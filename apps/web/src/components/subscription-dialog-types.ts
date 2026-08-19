import type { ReactNode } from "react";
import type { Subscription, SubscriptionFormSubmission } from "@/types/subscription";

type CreateSubscriptionDialogProps = {
  mode: "create";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (submission: SubscriptionFormSubmission) => void;
  initialSubscription?: Subscription | null | undefined;
  availableTags?: readonly string[] | undefined;
  trigger?: ReactNode;
  loading?: boolean | undefined;
};

type EditSubscriptionDialogProps = {
  mode: "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: Subscription | null;
  onSubmit: (submission: SubscriptionFormSubmission) => void;
  availableTags?: readonly string[] | undefined;
  loading?: boolean | undefined;
};

export type SubscriptionDialogProps = CreateSubscriptionDialogProps | EditSubscriptionDialogProps;

export type SubscriptionDialogContentProps = SubscriptionDialogProps & {
  onNestedDialogOpenChange: (open: boolean) => void;
  onRequestClose: () => void;
};
