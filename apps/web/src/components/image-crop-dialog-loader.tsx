import type { ImageCropDialogProps } from "@/components/image-crop-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { createLazyDialogResource, useLazyDialogSession } from "@/hooks/use-lazy-dialog-session";
import { useI18n } from "@/i18n/I18nProvider";

const imageCropDialogResource = createLazyDialogResource(() =>
  import("@/components/image-crop-dialog").then((module) => module.ImageCropDialogContent),
);

export function preloadImageCropDialog(): void {
  void imageCropDialogResource.load().catch(() => undefined);
}

function ImageCropDialogLoading() {
  const { t } = useI18n();
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("media.cropTitle")}</DialogTitle>
        <DialogDescription className="sr-only">{t("media.cropDescription")}</DialogDescription>
      </DialogHeader>
      <Skeleton className="h-72 w-full rounded-lg" />
      <DialogFooter className="gap-2">
        <Skeleton className="h-10 w-full sm:w-20" />
        <Skeleton className="h-10 w-full sm:w-20" />
        <Skeleton className="h-10 w-full sm:w-24" />
      </DialogFooter>
    </>
  );
}

/** 三个上传入口共享一个裁剪模块资源；关闭后迟到的代码只能进入缓存，不能替换退出中的裁剪工作台。 */
export function DeferredImageCropDialog(props: ImageCropDialogProps) {
  const { t } = useI18n();
  const { value: Content, error, sessionKey } = useLazyDialogSession(props.open, imageCropDialogResource);
  if (props.open && error) throw error;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        dismissMode="explicit"
        closeLabel={t("common.close")}
        className="border-border bg-card sm:max-w-md"
        aria-busy={Content ? undefined : true}
        data-testid={Content ? undefined : "image-crop-dialog-loading"}
      >
        {Content ? <Content key={sessionKey} {...props} /> : <ImageCropDialogLoading />}
      </DialogContent>
    </Dialog>
  );
}
