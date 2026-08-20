import { useCallback, useMemo, useRef, useState } from "react";
import { buildRenewalCalendarEvent, type RenewalCalendarEvent } from "@renewlet/shared/calendar-events";
import { google, office365, outlook, yahoo, type CalendarEvent } from "calendar-link";
import { CalendarDays, CalendarPlus, Clipboard, Download, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MobileBottomDrawerContent, MobileDrawerRoot } from "@/components/ui/mobile-drawer";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createSubscriptionCalendarLoadingSlots,
  SubscriptionCalendarFactRow,
  SubscriptionCalendarScaffold,
  type SubscriptionCalendarScaffoldSlots,
} from "@/components/subscription-calendar-scaffold";
import { toast } from "@/components/ui/sonner";
import { useCustomConfigState } from "@/contexts/CustomConfigContext";
import { useCreateSubscriptionCalendarFeed, useDeleteSubscriptionCalendarFeed, useSubscriptionCalendarFeedStatus } from "@/hooks/use-calendar-feed";
import { useSettings } from "@/hooks/use-settings";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useI18n } from "@/i18n/I18nProvider";
import { addDateOnly } from "@/lib/time/date-only";
import { formatBillingCycleLabel } from "@/lib/subscription-billing";
import { buildAndroidCalendarIntentUrl, isAndroidChromeUserAgent, openValidatedWebcalUrl } from "@/shared/browser/calendar-links";
import { copyTextToClipboard, type ClipboardCopyTarget } from "@/shared/browser/clipboard";
import { downloadFile } from "@/shared/browser/download-file";
import { calendarFeedService } from "@/services/calendar-feed-service";
import {
  DEFAULT_NOTIFICATION_REMINDER_DAYS,
  DISABLED_REMINDER_DAYS,
  INHERIT_REMINDER_DAYS,
  type Subscription,
  type SubscriptionCollectionItem,
} from "@/types/subscription";

interface AddToCalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null 表示上层详情已被清理；此时不能渲染会创建 token 的子弹窗。 */
  subscription: Subscription | null;
  loadingPreview: SubscriptionCollectionItem | null;
  loading?: boolean | undefined;
}

interface SubscriptionCalendarDialogContentProps {
  open: boolean;
  subscription: Subscription | null;
  isExpiryEvent: boolean;
  loading: boolean;
  loadingLabel: string;
}

interface CalendarProviderLink {
  href: string;
  label: string;
}

type SystemCalendarActionPhase = "idle" | "creating" | "opening";

export function AddToCalendarDialog({
  open,
  onOpenChange,
  subscription,
  loadingPreview,
  loading,
}: AddToCalendarDialogProps) {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const { t } = useI18n();
  if (!subscription && !loading) return null;

  const titleSubscription = subscription ?? loadingPreview;
  const isExpiryEvent = titleSubscription?.billingCycle === "one-time";
  const title = titleSubscription
    ? isExpiryEvent
      ? t("subscription.addToCalendarExpiryTitle")
      : t("subscription.addToCalendarTitle")
    : t("subscription.addToCalendar");
  const description = titleSubscription
    ? isExpiryEvent
      ? t("subscription.addToCalendarExpiryDescription", { name: titleSubscription.name })
      : t("subscription.addToCalendarDescription", { name: titleSubscription.name })
    : t("common.loading");
  const content = (
    <SubscriptionCalendarDialogContent
      open={open}
      subscription={subscription}
      isExpiryEvent={isExpiryEvent}
      loading={loading === true}
      loadingLabel={t("common.loading")}
    />
  );

  if (isMobile) {
    return (
      <MobileDrawerRoot open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
        {open ? (
          <MobileBottomDrawerContent
            title={title}
            description={description}
            descriptionMode={titleSubscription ? "visible" : "sr-only"}
            closeLabel={t("common.close")}
            icon={<CalendarPlus className="h-5 w-5 shrink-0 text-primary" />}
            className="max-h-[calc(var(--app-viewport-height)-1rem)]"
            headerClassName="border-b border-border pb-4"
            bodyClassName="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            aria-busy={loading ? true : undefined}
          >
            {content}
          </MobileBottomDrawerContent>
        ) : null}
      </MobileDrawerRoot>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="overflow-hidden border-border bg-card p-0 sm:max-w-md"
        aria-busy={loading ? true : undefined}
      >
        <DialogHeader className="border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-base leading-6">
            <CalendarPlus className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0 wrap-break-word">{title}</span>
          </DialogTitle>
          <DialogDescription className={titleSubscription ? "text-left leading-5" : "sr-only"}>
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 py-4">
          {content}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Feed URL 是低权限 bearer secret；创建/再生成都必须走 React Query mutation，
 * 本地 `feedUrl` 只缓存本次新 token，避免等待状态接口刷新时用户复制旧地址。
 */
function SubscriptionCalendarDialogContent({
  open,
  subscription,
  isExpiryEvent,
  loading,
  loadingLabel,
}: SubscriptionCalendarDialogContentProps) {
  const { t, locale, label, formatCurrency, formatDateOnly } = useI18n();
  const { config } = useCustomConfigState();
  const { data: settings } = useSettings();
  const subscriptionId = subscription?.id ?? "";
  const subscriptionFeedStatus = useSubscriptionCalendarFeedStatus(
    subscriptionId,
    open && !loading && subscription !== null,
  );
  const createSubscriptionFeed = useCreateSubscriptionCalendarFeed();
  const deleteSubscriptionFeed = useDeleteSubscriptionCalendarFeed();
  const [localFeed, setLocalFeed] = useState<{
    subscriptionId: string;
    feedUrl: string | null;
  } | null>(null);
  const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false);
  const [isDownloadingCalendar, setIsDownloadingCalendar] = useState(false);
  const [isRetryingFeedStatus, setIsRetryingFeedStatus] = useState(false);
  const [systemCalendarActionPhase, setSystemCalendarActionPhase] = useState<SystemCalendarActionPhase>("idle");
  const [isRegeneratingFeed, setIsRegeneratingFeed] = useState(false);
  const feedUrlInputRef = useRef<HTMLInputElement>(null);
  const localFeedUrl = localFeed?.subscriptionId === subscriptionId
    ? localFeed.feedUrl
    : undefined;
  const visibleFeedUrl = localFeedUrl !== undefined
    ? localFeedUrl
    : subscriptionFeedStatus.data?.feedUrl ?? null;
  const category = subscription
    ? config.categories.find((item) => item.value === subscription.category)
    : undefined;
  const paymentMethod = subscription?.paymentMethod
    ? config.paymentMethods.find((item) => item.value === subscription.paymentMethod)
    : undefined;
  const categoryLabel = subscription
    ? category ? label(category.labels) : subscription.category
    : "";
  const paymentMethodLabel = subscription
    ? paymentMethod ? label(paymentMethod.labels) : subscription.paymentMethod
    : undefined;
  const billingCycleLabel = subscription ? formatBillingCycleLabel(subscription, locale) : "";
  const globalReminderDays = settings?.notificationReminderDays ?? DEFAULT_NOTIFICATION_REMINDER_DAYS;
  const reminderDays = subscription
    ? subscription.reminderDays === DISABLED_REMINDER_DAYS
      ? undefined
      : subscription.reminderDays === INHERIT_REMINDER_DAYS
        ? globalReminderDays
        : subscription.reminderDays
    : undefined;

  const renewalEvent = useMemo<RenewalCalendarEvent | null>(() => {
    if (!subscription) return null;
    return buildRenewalCalendarEvent({
      subscription,
      labels: {
        amount: formatCurrency(subscription.price, subscription.currency),
        billingCycle: billingCycleLabel,
        category: categoryLabel,
        paymentMethod: paymentMethodLabel,
      },
      // “不提醒”只影响 ICS alarm；一次性下载仍保留这条续费/到期事件本身。
      reminderDays,
      text: {
        amount: ({ amount }) => t("subscription.addToCalendar.description.amount", { amount }),
        billingCycle: (cycle) => t("subscription.addToCalendar.description.billingCycle", { cycle }),
        category: (value) => t("subscription.addToCalendar.description.category", { category: value }),
        paymentMethod: (value) => t("subscription.addToCalendar.description.paymentMethod", { paymentMethod: value }),
        notes: (notes) => t("subscription.addToCalendar.description.notes", { notes }),
      },
    });
  }, [
    billingCycleLabel,
    categoryLabel,
    formatCurrency,
    paymentMethodLabel,
    reminderDays,
    subscription,
    t,
  ]);

  const calendarEvent = useMemo<CalendarEvent | null>(() => {
    if (!subscription || !renewalEvent) return null;
    const event: CalendarEvent = {
      allDay: true,
      busy: false,
      description: renewalEvent.description,
      end: addDateOnly(subscription.nextBillingDate, { days: 1 }),
      start: subscription.nextBillingDate,
      title: subscription.name,
      uid: renewalEvent.uid,
    };
    if (subscription.website) {
      event.url = subscription.website;
    }
    return event;
  }, [
    renewalEvent,
    subscription,
  ]);

  const links = useMemo<CalendarProviderLink[]>(() => calendarEvent ? [
      { href: google(calendarEvent), label: t("subscription.addToCalendarGoogle") },
      { href: outlook(calendarEvent), label: t("subscription.addToCalendarOutlook") },
      { href: office365(calendarEvent), label: t("subscription.addToCalendarOffice365") },
      { href: yahoo(calendarEvent), label: t("subscription.addToCalendarYahoo") },
    ] : [], [calendarEvent, t]);

  const androidSystemCalendarHref = useMemo(() => {
    if (!subscription || !renewalEvent) return undefined;
    return buildAndroidCalendarIntentUrl({
      title: subscription.name,
      description: renewalEvent.description,
      startDate: subscription.nextBillingDate,
      endDate: addDateOnly(subscription.nextBillingDate, { days: 1 }),
      fallbackUrl: links[0]?.href,
    });
  }, [links, renewalEvent, subscription]);

  const handleSubscribe = useCallback(async () => {
    if (!subscription || systemCalendarActionPhase !== "idle" || isRegeneratingFeed) return;
    let createdFeedUrl: string | null = null;
    setSystemCalendarActionPhase("creating");
    try {
      const created = await createSubscriptionFeed.mutateAsync(subscription.id);
      createdFeedUrl = created.feedUrl;
      setLocalFeed({ subscriptionId: subscription.id, feedUrl: created.feedUrl });
      setSystemCalendarActionPhase("opening");
      await openValidatedWebcalUrl(created.feedUrl);
      toast.success(t("subscription.addToCalendarSubscribed"), {
        description: t("subscription.addToCalendarSubscribedDescription"),
      });
    } catch {
      if (createdFeedUrl) {
        toast.error(t("subscription.addToCalendarOpenSystemFailed"), {
          description: t("subscription.addToCalendarOpenSystemFailedDescription"),
        });
      } else {
        toast.error(t("subscription.addToCalendarSubscribeFailed"));
      }
    } finally {
      setSystemCalendarActionPhase("idle");
    }
  }, [createSubscriptionFeed, isRegeneratingFeed, subscription, systemCalendarActionPhase, t]);

  const handleOpenExistingFeed = useCallback(async () => {
    if (!visibleFeedUrl || systemCalendarActionPhase !== "idle" || isRegeneratingFeed) return;
    setSystemCalendarActionPhase("opening");
    try {
      await openValidatedWebcalUrl(visibleFeedUrl);
      toast.success(t("subscription.addToCalendarSubscribed"), {
        description: t("subscription.addToCalendarSubscribedDescription"),
      });
    } catch {
      toast.error(t("subscription.addToCalendarOpenSystemFailed"), {
        description: t("subscription.addToCalendarOpenSystemFailedDescription"),
      });
    } finally {
      setSystemCalendarActionPhase("idle");
    }
  }, [isRegeneratingFeed, systemCalendarActionPhase, visibleFeedUrl, t]);

  const handleRegenerate = useCallback(async () => {
    if (!subscription || isRegeneratingFeed || systemCalendarActionPhase !== "idle") return;
    setIsRegeneratingFeed(true);
    try {
      // 再生成通过删除旧 token 后重新创建完成，保证误分享的旧公开链接立即失效。
      await deleteSubscriptionFeed.mutateAsync(subscription.id);
      setLocalFeed({ subscriptionId: subscription.id, feedUrl: null });
      const created = await createSubscriptionFeed.mutateAsync(subscription.id);
      setLocalFeed({ subscriptionId: subscription.id, feedUrl: created.feedUrl });
      setConfirmRegenerateOpen(false);
      toast.success(t("subscription.addToCalendarRegenerated"), {
        description: t("subscription.addToCalendarRegeneratedDescription"),
      });
    } catch {
      toast.error(t("subscription.addToCalendarRegenerateFailed"));
    } finally {
      setIsRegeneratingFeed(false);
    }
  }, [createSubscriptionFeed, deleteSubscriptionFeed, isRegeneratingFeed, subscription, systemCalendarActionPhase, t]);

  const handleCopyFeedUrl = useCallback(async (target?: ClipboardCopyTarget | null) => {
    if (!visibleFeedUrl) return;
    const copyResult = await copyTextToClipboard(visibleFeedUrl, { target });
    if (copyResult.ok) {
      toast.success(t("subscription.addToCalendarFeedUrlCopied"));
      return;
    }
    toast.error(t("subscription.addToCalendarFeedUrlCopyFailed"), {
      description: t("subscription.addToCalendarFeedUrlCopyFailedDescription"),
    });
  }, [visibleFeedUrl, t]);

  const handleDownload = useCallback(async () => {
    if (!subscription) return;
    setIsDownloadingCalendar(true);
    try {
      const ics = await calendarFeedService.downloadSubscriptionIcs(subscription.id);
      downloadFile(ics, `renewlet-${safeCalendarFilename(subscription.id)}.ics`);
      toast.success(t("subscription.addToCalendarDownloaded"));
    } catch {
      toast.error(t("subscription.addToCalendarDownloadFailed"));
    } finally {
      setIsDownloadingCalendar(false);
    }
  }, [subscription, t]);

  const handleRetryFeedStatus = async () => {
    if (isRetryingFeedStatus) return;
    setIsRetryingFeedStatus(true);
    try {
      await subscriptionFeedStatus.refetch();
    } finally {
      setIsRetryingFeedStatus(false);
    }
  };

  let scaffoldSlots: SubscriptionCalendarScaffoldSlots;
  if (loading || !subscription || !renewalEvent) {
    scaffoldSlots = createSubscriptionCalendarLoadingSlots(loadingLabel);
  } else {
    const hasFeedStatusData = subscriptionFeedStatus.data !== undefined;
    // 首次 query 只决定动作类型；mutation 才进入按钮 busy，有缓存的后台刷新不能让已知操作退回占位态。
    const isFeedStatusUnavailable = !hasFeedStatusData
      && (subscriptionFeedStatus.isError || isRetryingFeedStatus);
    const isFeedStatusPending = !hasFeedStatusData && !isFeedStatusUnavailable;
    const isSystemCalendarActionPending = systemCalendarActionPhase !== "idle";
    const subscribeLabel = visibleFeedUrl
      ? t("subscription.addToCalendarSubscribeSystem")
      : t("subscription.addToCalendarGenerateFeed");
    const pendingSubscribeLabel = systemCalendarActionPhase === "creating"
      ? t("subscription.addToCalendarGenerateFeedLoading")
      : t("subscription.addToCalendarOpenSystemLoading");
    scaffoldSlots = {
      facts: (
        <>
          <SubscriptionCalendarFactRow
            icon={<CalendarDays className="h-4 w-4 text-primary" />}
            label={t("subscription.addToCalendarEventDate")}
            value={formatDateOnly(subscription.nextBillingDate, "full")}
            strong
          />
          <SubscriptionCalendarFactRow
            label={t("subscription.addToCalendarEventType")}
            value={isExpiryEvent
              ? t("subscription.addToCalendarExpiryFeed")
              : t("subscription.addToCalendarSubscriptionFeed")}
          />
          <SubscriptionCalendarFactRow
            label={t("subscription.addToCalendarSyncStatus")}
            value={t("subscription.addToCalendarSubscriptionSync")}
          />
        </>
      ),
      primaryAction: isFeedStatusPending ? (
        <div role="status" data-testid="subscription-calendar-feed-status-loading">
          <span className="sr-only">{t("subscription.addToCalendarFeedStatusLoading")}</span>
          <Skeleton aria-hidden="true" className="h-10 w-full" />
        </div>
      ) : isFeedStatusUnavailable ? (
        <div
          role="alert"
          className="flex min-h-10 flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{t("subscription.addToCalendarFeedStatusFailed")}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 justify-center border-destructive/30"
            onClick={() => void handleRetryFeedStatus()}
            disabled={isRetryingFeedStatus}
            aria-busy={isRetryingFeedStatus ? true : undefined}
          >
            <RefreshCw className={isRetryingFeedStatus ? "animate-spin" : undefined} />
            {isRetryingFeedStatus
              ? t("subscription.addToCalendarFeedStatusRetrying")
              : t("subscription.addToCalendarFeedStatusRetry")}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="default"
          className="h-10 w-full justify-center"
          onClick={() => {
            void (visibleFeedUrl ? handleOpenExistingFeed() : handleSubscribe());
          }}
          disabled={isSystemCalendarActionPending || isRegeneratingFeed}
          aria-busy={isSystemCalendarActionPending ? true : undefined}
        >
          {isSystemCalendarActionPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <CalendarPlus className="h-4 w-4" />}
          {isSystemCalendarActionPending ? pendingSubscribeLabel : subscribeLabel}
        </Button>
      ),
      feedActions: visibleFeedUrl ? (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            ref={feedUrlInputRef}
            value={visibleFeedUrl}
            readOnly
            className="border-border bg-secondary font-mono text-xs"
            aria-label={t("subscription.addToCalendarFeedUrl")}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-center border-border"
            onClick={() => {
              void handleCopyFeedUrl(feedUrlInputRef.current);
            }}
            disabled={isRegeneratingFeed}
          >
            <Clipboard className="h-4 w-4" />
            {t("subscription.addToCalendarCopyFeedUrl")}
          </Button>
          <div className="sm:col-span-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 justify-center gap-2 px-2 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmRegenerateOpen(true)}
              disabled={isSystemCalendarActionPending || isRegeneratingFeed}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("subscription.addToCalendarRegenerate")}
            </Button>
          </div>
        </div>
      ) : null,
      secondaryActions: (
        <>
          {isAndroidChromeUserAgent() && androidSystemCalendarHref ? (
            <Button variant="outline" size="sm" asChild className="justify-center border-border">
              <a href={androidSystemCalendarHref} rel="noopener noreferrer">
                <CalendarPlus className="h-4 w-4" />
                {t("subscription.addToCalendarAndroidSingleEvent")}
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-center border-border"
            onClick={() => void handleDownload()}
            disabled={isDownloadingCalendar}
          >
            {isDownloadingCalendar
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />}
            {t("subscription.addToCalendarDownloadIcs")}
          </Button>
        </>
      ),
      notice: (
        <p className="text-xs leading-5 text-muted-foreground">
          {isExpiryEvent
            ? t("subscription.addToCalendarExpiryEventNotice")
            : t("subscription.addToCalendarSingleEventNotice")}
        </p>
      ),
      providerHeading: (
        <p className="text-xs font-medium uppercase text-muted-foreground">
          {t("subscription.addToCalendarOnlineServices")}
        </p>
      ),
      providers: (
        <>
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-10 items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm text-foreground transition-colors last:border-b-0 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span className="truncate">{link.label}</span>
              <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
            </a>
          ))}
        </>
      ),
    };
  }

  return (
    <>
      <SubscriptionCalendarScaffold
        {...scaffoldSlots}
        data-testid={loading ? "subscription-calendar-data-loading" : undefined}
      />
      {!loading && subscription ? (
        <CalendarFeedRegenerateDialog
          open={confirmRegenerateOpen}
          onOpenChange={setConfirmRegenerateOpen}
          onConfirm={() => void handleRegenerate()}
          pending={isRegeneratingFeed}
        />
      ) : null}
    </>
  );
}

function safeCalendarFilename(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "subscription";
}

function CalendarFeedRegenerateDialog({
  onConfirm,
  onOpenChange,
  open,
  pending,
}: {
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
}) {
  const { t } = useI18n();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("subscription.addToCalendarRegenerateTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("subscription.addToCalendarRegenerateDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            disabled={pending}
            aria-busy={pending ? true : undefined}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {pending
              ? t("subscription.addToCalendarRegenerateLoading")
              : t("subscription.addToCalendarRegenerate")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
