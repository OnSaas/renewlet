import type { HTMLAttributes, ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface SubscriptionCalendarScaffoldProps extends HTMLAttributes<HTMLDivElement> {
  facts: ReactNode;
  feedActions?: ReactNode;
  notice: ReactNode;
  primaryAction: ReactNode;
  providerHeading: ReactNode;
  providers: ReactNode;
  secondaryActions: ReactNode;
}

interface SubscriptionCalendarFactRowProps {
  icon?: ReactNode;
  label: ReactNode;
  strong?: boolean;
  value: ReactNode;
}

export type SubscriptionCalendarScaffoldSlots = Pick<
  SubscriptionCalendarScaffoldProps,
  | "facts"
  | "feedActions"
  | "notice"
  | "primaryAction"
  | "providerHeading"
  | "providers"
  | "secondaryActions"
>;

export function SubscriptionCalendarScaffold({
  className,
  facts,
  feedActions,
  notice,
  primaryAction,
  providerHeading,
  providers,
  secondaryActions,
  ...props
}: SubscriptionCalendarScaffoldProps) {
  return (
    <div className={cn("grid gap-5", className)} {...props}>
      <dl
        className="grid divide-y divide-border rounded-md border border-border bg-background/50 text-sm"
        data-dialog-region="calendar-facts"
      >
        {facts}
      </dl>
      <div className="grid gap-3" data-dialog-region="calendar-feed-actions">
        {primaryAction}
        {feedActions}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {secondaryActions}
        </div>
        {notice}
      </div>
      <div className="grid gap-2" data-dialog-region="calendar-providers">
        {providerHeading}
        <div className="overflow-hidden rounded-md border border-border bg-background/50">
          {providers}
        </div>
      </div>
    </div>
  );
}

export function SubscriptionCalendarFactRow({
  icon,
  label,
  strong = false,
  value,
}: SubscriptionCalendarFactRowProps) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 px-3 py-2">
      <dt className="flex min-w-0 items-center gap-2 text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </dt>
      <dd className={strong ? "min-w-0 text-right font-medium text-foreground" : "min-w-0 text-right text-foreground"}>
        {value}
      </dd>
    </div>
  );
}

export function createSubscriptionCalendarLoadingSlots(label: string): SubscriptionCalendarScaffoldSlots {
  return {
    facts: (
      <>
        <SubscriptionCalendarFactRow
          label={(
            <>
              <span className="sr-only">{label}</span>
              <Skeleton aria-hidden="true" className="h-4 w-24" />
            </>
          )}
          value={<Skeleton aria-hidden="true" className="h-5 w-28" />}
        />
        <SubscriptionCalendarFactRow
          label={<Skeleton aria-hidden="true" className="h-4 w-20" />}
          value={<Skeleton aria-hidden="true" className="h-5 w-24" />}
        />
        <SubscriptionCalendarFactRow
          label={<Skeleton aria-hidden="true" className="h-4 w-20" />}
          value={<Skeleton aria-hidden="true" className="h-5 w-28" />}
        />
      </>
    ),
    primaryAction: <Skeleton className="h-10 w-full" />,
    secondaryActions: <Skeleton className="h-9 w-full sm:w-28" />,
    notice: <Skeleton className="h-5 w-full" />,
    providerHeading: <Skeleton className="h-4 w-28" />,
    providers: (
      <>
        <Skeleton className="m-3 h-5" />
        <Skeleton className="m-3 h-5" />
        <Skeleton className="m-3 h-5" />
        <Skeleton className="m-3 h-5" />
      </>
    ),
  };
}
