import type { ImportDataDialogProps } from "@/components/import-data-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { createLazyDialogResource, useLazyDialogSession } from "@/hooks/use-lazy-dialog-session";
import { useI18n } from "@/i18n/I18nProvider";

const importDataDialogResource = createLazyDialogResource(() =>
  import("@/components/import-data-dialog").then((module) => module.ImportDataDialogContent),
);

export function preloadImportDataDialog(): void {
  void importDataDialogResource.load().catch(() => undefined);
}

function ImportDataDialogLoading() {
  const { t } = useI18n();
  return (
    <>
      <DialogHeader className="shrink-0 border-b border-border bg-secondary/20 px-4 py-5 pr-12 sm:px-6 sm:pr-14">
        <DialogTitle className="text-xl">{t("import.title")}</DialogTitle>
        <DialogDescription className="mt-1 text-left">{t("import.description")}</DialogDescription>
        <Skeleton className="mt-4 h-9 w-full rounded-lg" />
      </DialogHeader>
      <div className="grid min-h-0 content-start gap-4 overflow-hidden px-4 py-5 sm:px-6">
        <Skeleton className="h-10 w-full sm:w-80" />
        <Skeleton className="h-44 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
      <DialogFooter className="shrink-0 border-t border-border bg-card px-4 py-4 sm:px-6">
        <Skeleton className="h-10 w-full sm:w-24" />
        <Skeleton className="h-10 w-full sm:w-24" />
      </DialogFooter>
    </>
  );
}

/** 导入代码按 intent 加载，Portal 与焦点域由同步 shell 独占，避免骨架和真实工作台互换 modal 所有权。 */
export function DeferredImportDataDialog(props: ImportDataDialogProps) {
  const { t } = useI18n();
  const { value: Content, error, sessionKey } = useLazyDialogSession(props.open, importDataDialogResource);
  if (props.open && error) throw error;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        dismissMode="explicit"
        layout="frame"
        closeLabel={t("common.close")}
        className="h5-dialog-frame h5-import-dialog-panel overflow-hidden border-border bg-card p-0 sm:max-w-5xl"
        aria-busy={Content ? undefined : true}
        data-testid={Content ? undefined : "import-data-dialog-loading"}
      >
        {Content ? <Content key={sessionKey} {...props} /> : <ImportDataDialogLoading />}
      </DialogContent>
    </Dialog>
  );
}
