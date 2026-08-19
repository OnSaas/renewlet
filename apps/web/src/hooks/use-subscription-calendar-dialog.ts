import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchSubscriptionDetail, useSubscriptionDetail } from "@/hooks/use-subscriptions";
import { useDeferredDialogCleanup } from "@/hooks/use-deferred-dialog-cleanup";
import { useDialogSessionSnapshot } from "@/hooks/use-dialog-session-snapshot";

/** 卡片日历动作只保存目标 id，完整事件数据与详情/编辑共享同一个 detail cache。 */
export function useSubscriptionCalendarDialog() {
  const queryClient = useQueryClient();
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const detailQuery = useSubscriptionDetail(subscriptionId, open);
  const currentDialogSession = useMemo(() => ({
    subscription: detailQuery.data ?? null,
    pending: detailQuery.isPending,
    error: detailQuery.error,
  }), [detailQuery.data, detailQuery.error, detailQuery.isPending]);
  const dialogSession = useDialogSessionSnapshot(open, subscriptionId, currentDialogSession);
  const { scheduleCleanup, cancelCleanup } = useDeferredDialogCleanup(() => setSubscriptionId(null));

  const prefetch = useCallback((id: string) => {
    void prefetchSubscriptionDetail(queryClient, id);
  }, [queryClient]);

  const show = useCallback((id: string) => {
    cancelCleanup();
    setSubscriptionId(id);
    setOpen(true);
  }, [cancelCleanup]);

  const onOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      cancelCleanup();
      return;
    }
    scheduleCleanup();
  }, [cancelCleanup, scheduleCleanup]);

  return {
    open,
    subscription: dialogSession.subscription,
    pending: dialogSession.pending,
    error: dialogSession.error,
    prefetch,
    show,
    onOpenChange,
  };
}
