import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/I18nProvider";

function LoadingStatus() {
  const { t } = useI18n();
  return <span className="sr-only">{t("common.loading")}</span>;
}

export function SubscriptionFormDialogLoading() {
  return (
    <div
      className="h5-subscription-dialog-form overflow-hidden"
      aria-busy="true"
      data-testid="subscription-form-loading"
    >
      <LoadingStatus />
      <div className="h5-mobile-sheet-scroll h5-subscription-dialog-scroll grid gap-5 px-6 py-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
          <div className="grid gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-11 w-full" />
          </div>
          <Skeleton className="h-20 w-20 justify-self-center rounded-lg" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
      <div className="h5-subscription-dialog-footer flex shrink-0 flex-col gap-3 border-t border-border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end md:p-6 md:pt-4">
        <Skeleton className="h-10 w-full sm:w-24" />
        <Skeleton className="h-10 w-full sm:w-24" />
      </div>
    </div>
  );
}

export function SubscriptionDetailDialogLoading() {
  return (
    <div
      className="grid min-h-[24rem] content-start gap-5"
      aria-busy="true"
      data-testid="subscription-detail-loading"
    >
      <LoadingStatus />
      <div className="flex items-start gap-3">
        <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
        <div className="grid min-w-0 flex-1 gap-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
      <div className="grid gap-3">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-5 w-full" />
      </div>
      <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <Skeleton className="h-10 w-full sm:w-24" />
        <Skeleton className="h-10 w-full sm:w-28" />
      </div>
    </div>
  );
}

export function SubscriptionCalendarDialogLoading() {
  return (
    <div
      className="grid min-h-[22rem] content-start gap-5"
      aria-busy="true"
      data-testid="subscription-calendar-loading"
    >
      <LoadingStatus />
      <div className="grid divide-y divide-border overflow-hidden rounded-md border border-border">
        <Skeleton className="m-3 h-5" />
        <Skeleton className="m-3 h-5" />
        <Skeleton className="m-3 h-5" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 flex-1" />
      </div>
      <div className="grid gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
