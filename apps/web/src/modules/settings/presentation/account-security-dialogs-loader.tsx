import { useLayoutEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { createLazyDialogResource, useLazyDialogSession } from "@/hooks/use-lazy-dialog-session";
import { useI18n } from "@/i18n/I18nProvider";
import type { AccountSecurityDialogsProps } from "./account-security-dialogs";
import {
  AccountPasskeysManagerDialog,
  type AccountPasskeysManagerDialogProps,
} from "./account-passkeys-manager-dialog";

const accountSecurityDialogResource = createLazyDialogResource(() =>
  import("./account-security-dialogs").then((module) => module.AccountSecurityDialogContent),
);

function AccountSecurityDialogLoading() {
  const { t } = useI18n();

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("common.loading")}</DialogTitle>
        <DialogDescription className="sr-only">{t("common.loading")}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3" aria-hidden="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-28 justify-self-end" />
      </div>
    </>
  );
}

type DeferredAccountSecurityDialogsProps = AccountSecurityDialogsProps &
  Omit<AccountPasskeysManagerDialogProps, "open" | "onOpenChange"> & {
    onPasskeysOpenChange: (open: boolean) => void;
  };

type AuthenticatorDialogState = Exclude<
  AccountSecurityDialogsProps["state"],
  { type: "none" } | { type: "passkeys_manager" }
>;

function isAuthenticatorDialogState(
  state: AccountSecurityDialogsProps["state"],
): state is AuthenticatorDialogState {
  return state.type !== "none" && state.type !== "passkeys_manager";
}

/** 账号安全入口保留单一状态机；二维码和凭据管理表单仅在对应会话存活期间装载。 */
export function DeferredAccountSecurityDialogs({
  state,
  onStateChange,
  onPasskeysOpenChange,
  ...passkeysProps
}: DeferredAccountSecurityDialogsProps) {
  const { t } = useI18n();
  const securityDialogOpen = isAuthenticatorDialogState(state);
  const [activeSecurityState, setActiveSecurityState] = useState<AuthenticatorDialogState | null>(() => (
    isAuthenticatorDialogState(state) ? state : null
  ));
  const { value: Content, error, sessionKey } = useLazyDialogSession(securityDialogOpen, accountSecurityDialogResource);

  useLayoutEffect(() => {
    if (isAuthenticatorDialogState(state)) setActiveSecurityState(state);
  }, [state]);

  if (securityDialogOpen && error) throw error;

  if (state.type === "passkeys_manager") {
    return (
      <AccountPasskeysManagerDialog
        {...passkeysProps}
        open
        onOpenChange={onPasskeysOpenChange}
      />
    );
  }

  return (
    <Dialog
      open={securityDialogOpen}
      onOpenChange={(open) => {
        if (!open) onStateChange({ type: "none" });
      }}
    >
      <DialogContent
        closeLabel={t("common.close")}
        dismissMode="explicit"
        aria-busy={Content && activeSecurityState ? undefined : true}
        data-testid={Content && activeSecurityState ? undefined : "account-security-dialog-loading"}
      >
        {Content && activeSecurityState
          ? <Content key={sessionKey} state={activeSecurityState} onStateChange={onStateChange} />
          : <AccountSecurityDialogLoading />}
      </DialogContent>
    </Dialog>
  );
}
