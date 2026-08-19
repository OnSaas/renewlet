import type { RenewSubscriptionDialogProps } from "@/components/renew-subscription-dialog";
import { SubscriptionFormDialogLoading } from "@/components/subscription-dialog-loading";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/I18nProvider";
import { createLazyDialogResource, useLazyDialogSession } from "@/hooks/use-lazy-dialog-session";

const renewSubscriptionDialogResource = createLazyDialogResource(() =>
  import("@/components/renew-subscription-dialog").then((module) => module.RenewSubscriptionDialogContent),
);

export function preloadRenewSubscriptionDialog(): void {
  void renewSubscriptionDialogResource.load().catch(() => undefined);
}

function RenewSubscriptionDialogLoading({
  subscription,
}: Pick<
  RenewSubscriptionDialogProps,
  "subscription"
>) {
  const { t } = useI18n();
  const title = subscription
    ? t("subscription.renew.title", { name: subscription.name })
    : t("subscription.renew");

  return (
    <>
      <DialogHeader className="shrink-0 p-6 pb-0">
        <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("subscription.renew.description")}
        </DialogDescription>
      </DialogHeader>
      <SubscriptionFormDialogLoading />
    </>
  );
}

/** 续订代码按 intent 加载，但单次 open session 始终复用同一套 Radix Portal、焦点域和退出动画。 */
export function DeferredRenewSubscriptionDialog(props: RenewSubscriptionDialogProps) {
  const { t } = useI18n();
  const { value: Content, error, sessionKey } = useLazyDialogSession(props.open, renewSubscriptionDialogResource);
  if (props.open && error) throw error;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        closeLabel={t("common.close")}
        dismissMode="explicit"
        layout="content"
        className="h5-dialog-auto-frame gap-0 border-border bg-card p-0 sm:max-w-lg"
        aria-busy={Content ? undefined : true}
        data-testid={Content ? undefined : "renew-subscription-dialog-loading"}
        onCloseAutoFocus={(event) => {
          if (!props.restoreFocusRef?.current) return;
          event.preventDefault();
          props.restoreFocusRef.current.focus();
        }}
      >
        {Content ? <Content key={sessionKey} {...props} /> : <RenewSubscriptionDialogLoading subscription={props.subscription} />}
      </DialogContent>
    </Dialog>
  );
}
