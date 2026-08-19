import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  prefetchSubscriptionDetail,
  useCreateSubscription,
  useDeleteSubscription,
  usePatchSubscription,
  useRenewSubscription,
  useSubscriptionDetail,
  useUpdateSubscription,
} from "@/hooks/use-subscriptions";
import { useDeferredDialogCleanup } from "@/hooks/use-deferred-dialog-cleanup";
import { useDialogSessionSnapshot } from "@/hooks/use-dialog-session-snapshot";
import { buildClonedSubscriptionDraft } from "@/modules/subscriptions/domain/subscription-clone";
import type {
  SubscriptionCollectionItem,
  SubscriptionFormSubmission,
} from "@/types/subscription";
import type { SubscriptionRenewBody } from "@renewlet/shared/schemas/subscriptions";

/** 订阅 CRUD 控制器只保存目标 id；完整对象始终来自唯一的 detail query cache。 */
export function useSubscriptionCrud(subscriptions: readonly SubscriptionCollectionItem[]) {
  const queryClient = useQueryClient();
  const { mutate: createSubscription } = useCreateSubscription();
  const { mutate: updateSubscription } = useUpdateSubscription();
  const { mutate: patchSubscription } = usePatchSubscription();
  const {
    mutateAsync: renewSubscription,
    error: renewError,
    isPending: renewSubmitting,
  } = useRenewSubscription();
  const { mutate: deleteSubscription } = useDeleteSubscription();
  const [editingSubscriptionId, setEditingSubscriptionId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [cloningSubscriptionId, setCloningSubscriptionId] = useState<string | null>(null);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [renewingSubscriptionId, setRenewingSubscriptionId] = useState<string | null>(null);
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const editingQuery = useSubscriptionDetail(editingSubscriptionId, editDialogOpen);
  const cloningQuery = useSubscriptionDetail(cloningSubscriptionId, cloneDialogOpen);
  const renewingQuery = useSubscriptionDetail(renewingSubscriptionId, renewDialogOpen);
  const currentEditDialogSession = useMemo(() => ({
    subscription: editingQuery.data ?? null,
    pending: editingQuery.isPending,
  }), [editingQuery.data, editingQuery.isPending]);
  const currentCloneDialogSession = useMemo(() => ({
    subscription: cloningQuery.data ?? null,
    pending: cloningQuery.isPending,
  }), [cloningQuery.data, cloningQuery.isPending]);
  const currentRenewDialogSession = useMemo(() => ({
    subscription: renewingQuery.data ?? null,
    pending: renewingQuery.isPending,
    error: renewError ?? renewingQuery.error,
    submitting: renewSubmitting,
  }), [renewError, renewSubmitting, renewingQuery.data, renewingQuery.error, renewingQuery.isPending]);
  const editDialogSession = useDialogSessionSnapshot(editDialogOpen, editingSubscriptionId, currentEditDialogSession);
  const cloneDialogSession = useDialogSessionSnapshot(cloneDialogOpen, cloningSubscriptionId, currentCloneDialogSession);
  const renewDialogSession = useDialogSessionSnapshot(renewDialogOpen, renewingSubscriptionId, currentRenewDialogSession);
  const renewRestoreFocusRef = useRef<HTMLElement | null>(null);
  const { scheduleCleanup: scheduleEditCleanup, cancelCleanup: cancelEditCleanup } = useDeferredDialogCleanup(() => {
    // 关闭动画结束后再丢弃 id，避免 detail cache 在 fade-out 中解除绑定导致内容闪空。
    setEditingSubscriptionId(null);
  });
  const { scheduleCleanup: scheduleCloneCleanup, cancelCleanup: cancelCloneCleanup } = useDeferredDialogCleanup(() => {
    setCloningSubscriptionId(null);
  });
  const { scheduleCleanup: scheduleRenewCleanup, cancelCleanup: cancelRenewCleanup } = useDeferredDialogCleanup(() => {
    setRenewingSubscriptionId(null);
  });

  const handlePrefetchSubscription = useCallback((id: string) => {
    void prefetchSubscriptionDetail(queryClient, id);
  }, [queryClient]);

  const handleAddSubscription = useCallback((submission: SubscriptionFormSubmission) => {
    createSubscription({ ...submission, pinned: false });
  }, [createSubscription]);

  const handleDeleteSubscription = useCallback((id: string) => {
    deleteSubscription(id);
  }, [deleteSubscription]);

  const handleTogglePinnedSubscription = useCallback((id: string) => {
    const subscription = subscriptions.find((item) => item.id === id);
    if (!subscription) return;
    // 快捷菜单只表达单字段意图，不能把列表旧快照当完整 PATCH 覆盖并发编辑。
    patchSubscription({ id, patch: { pinned: !subscription.pinned } });
  }, [patchSubscription, subscriptions]);

  const handleTogglePublicHiddenSubscription = useCallback((id: string) => {
    const subscription = subscriptions.find((item) => item.id === id);
    if (!subscription) return;
    patchSubscription({ id, patch: { publicHidden: !subscription.publicHidden } });
  }, [patchSubscription, subscriptions]);

  const handleRenewSubscription = useCallback((id: string) => {
    renewRestoreFocusRef.current = typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    cancelRenewCleanup();
    setRenewingSubscriptionId(id);
    setRenewDialogOpen(true);
  }, [cancelRenewCleanup]);

  const handleEditSubscription = useCallback((id: string) => {
    cancelEditCleanup();
    setEditingSubscriptionId(id);
    setEditDialogOpen(true);
  }, [cancelEditCleanup]);

  const handleCloneSubscription = useCallback((id: string) => {
    cancelCloneCleanup();
    setCloningSubscriptionId(id);
    setCloneDialogOpen(true);
  }, [cancelCloneCleanup]);

  const handleSaveSubscription = useCallback((changes: SubscriptionFormSubmission) => {
    if (!editingSubscriptionId) return;
    updateSubscription({ id: editingSubscriptionId, changes });
  }, [editingSubscriptionId, updateSubscription]);

  const handleSaveClonedSubscription = useCallback((submission: SubscriptionFormSubmission) => {
    if (!cloningQuery.data) return;
    createSubscription(buildClonedSubscriptionDraft(cloningQuery.data, submission));
  }, [cloningQuery.data, createSubscription]);

  const handleSubmitRenewSubscription = useCallback(async (payload: SubscriptionRenewBody) => {
    if (!renewingSubscriptionId) return;
    await renewSubscription({ id: renewingSubscriptionId, payload });
    setRenewDialogOpen(false);
    scheduleRenewCleanup();
  }, [renewSubscription, renewingSubscriptionId, scheduleRenewCleanup]);

  const handleEditDialogOpenChange = useCallback((nextOpen: boolean) => {
    setEditDialogOpen(nextOpen);
    if (nextOpen) {
      cancelEditCleanup();
      return;
    }
    scheduleEditCleanup();
  }, [cancelEditCleanup, scheduleEditCleanup]);

  const handleCloneDialogOpenChange = useCallback((nextOpen: boolean) => {
    setCloneDialogOpen(nextOpen);
    if (nextOpen) {
      cancelCloneCleanup();
      return;
    }
    scheduleCloneCleanup();
  }, [cancelCloneCleanup, scheduleCloneCleanup]);

  const handleRenewDialogOpenChange = useCallback((nextOpen: boolean) => {
    setRenewDialogOpen(nextOpen);
    if (nextOpen) {
      cancelRenewCleanup();
      return;
    }
    scheduleRenewCleanup();
  }, [cancelRenewCleanup, scheduleRenewCleanup]);

  return {
    editingSubscription: editDialogSession.subscription,
    editDialogOpen,
    editDetailPending: editDialogSession.pending,
    cloningSubscription: cloneDialogSession.subscription,
    cloneDialogOpen,
    cloneDetailPending: cloneDialogSession.pending,
    renewingSubscription: renewDialogSession.subscription,
    renewDialogOpen,
    renewDetailPending: renewDialogSession.pending,
    renewError: renewDialogSession.error,
    renewSubmitting: renewDialogSession.submitting,
    renewRestoreFocusRef,
    handlePrefetchSubscription,
    handleAddSubscription,
    handleDeleteSubscription,
    handleTogglePinnedSubscription,
    handleTogglePublicHiddenSubscription,
    handleRenewSubscription,
    handleSubmitRenewSubscription,
    handleEditSubscription,
    handleCloneSubscription,
    handleSaveSubscription,
    handleSaveClonedSubscription,
    handleEditDialogOpenChange,
    handleCloneDialogOpenChange,
    handleRenewDialogOpenChange,
  };
}
