import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchSubscriptionDetail, useSubscriptionDetail } from "@/hooks/use-subscriptions";
import { useDeferredDialogCleanup } from "@/hooks/use-deferred-dialog-cleanup";
import { useDialogSessionSnapshot } from "@/hooks/use-dialog-session-snapshot";

export function useSubscriptionDetailDialog() {
  const queryClient = useQueryClient();
  const [detailSubscriptionId, setDetailSubscriptionId] = useState<string | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const detailQuery = useSubscriptionDetail(detailSubscriptionId, detailDialogOpen);
  const currentDetailDialogSession = useMemo(() => ({
    subscription: detailQuery.data ?? null,
    pending: detailQuery.isPending,
    error: detailQuery.error,
  }), [detailQuery.data, detailQuery.error, detailQuery.isPending]);
  const detailDialogSession = useDialogSessionSnapshot(
    detailDialogOpen,
    detailSubscriptionId,
    currentDetailDialogSession,
  );
  const { scheduleCleanup: scheduleDetailCleanup, cancelCleanup: cancelDetailCleanup } =
    useDeferredDialogCleanup(() => {
      // 详情关闭动画期间保留 id 与 cache 绑定，避免 Dialog/Drawer fade-out 时标题和内容闪空。
      setDetailSubscriptionId(null);
    });

  const handlePrefetchDetails = useCallback((id: string) => {
    void prefetchSubscriptionDetail(queryClient, id);
  }, [queryClient]);

  const handleViewDetails = useCallback((id: string) => {
    cancelDetailCleanup();
    setDetailSubscriptionId(id);
    setDetailDialogOpen(true);
  }, [cancelDetailCleanup]);

  const handleDetailDialogOpenChange = useCallback((nextOpen: boolean) => {
    setDetailDialogOpen(nextOpen);
    if (nextOpen) {
      cancelDetailCleanup();
      return;
    }
    scheduleDetailCleanup();
  }, [cancelDetailCleanup, scheduleDetailCleanup]);

  return {
    detailDialogOpen,
    selectedDetailSubscription: detailDialogSession.subscription,
    detailPending: detailDialogSession.pending,
    detailError: detailDialogSession.error,
    handlePrefetchDetails,
    handleViewDetails,
    handleDetailDialogOpenChange,
  };
}
