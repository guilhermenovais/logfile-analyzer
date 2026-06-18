import * as Dialog from "@radix-ui/react-dialog";
import type { Update } from "@tauri-apps/plugin-updater";
import type { DownloadProgress, UpdateStatus } from "@/hooks/useUpdateChecker";

export interface UpdateDialogProps {
  status: UpdateStatus;
  update: Update | null;
  downloadProgress: DownloadProgress | null;
  errorType?: "network" | "signature" | null;
  onStartDownload: () => void;
  onRestart: () => void;
  onDismiss: () => void;
}

export function UpdateDialog({
  status,
  update,
  downloadProgress,
  errorType,
  onStartDownload,
  onRestart,
  onDismiss,
}: UpdateDialogProps) {
  const showDialog =
    status === "available" ||
    status === "downloading" ||
    status === "downloaded" ||
    status === "error" ||
    status === "signature-error";

  if (!showDialog) return null;

  const progressPercent =
    downloadProgress?.contentLength && downloadProgress.contentLength > 0
      ? Math.round(
          (downloadProgress.downloaded / downloadProgress.contentLength) * 100,
        )
      : null;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onDismiss()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-4 shadow-lg">
          <Dialog.Title className="text-sm font-semibold">
            {status === "downloaded"
              ? "Update Ready"
              : status === "downloading"
                ? "Downloading Update"
                : status === "error" || status === "signature-error"
                  ? "Update Error"
                  : "Update Available"}
          </Dialog.Title>

          {status === "available" && update && (
            <>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                Version {update.version} is available. Would you like to update
                now?
              </Dialog.Description>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded border px-2 py-1 text-xs hover:bg-accent"
                >
                  Later
                </button>
                <button
                  type="button"
                  onClick={onStartDownload}
                  className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
                >
                  Update Now
                </button>
              </div>
            </>
          )}

          {status === "downloading" && (
            <>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                Downloading update{update ? ` ${update.version}` : ""}...
              </Dialog.Description>
              <div className="mt-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    role="progressbar"
                    aria-valuenow={progressPercent ?? undefined}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    style={{ width: `${progressPercent ?? 0}%` }}
                  />
                </div>
                {progressPercent !== null && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {progressPercent}%
                  </p>
                )}
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded border px-2 py-1 text-xs hover:bg-accent"
                >
                  Later
                </button>
              </div>
            </>
          )}

          {status === "downloaded" && (
            <>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                Update downloaded. Restart to apply.
              </Dialog.Description>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded border px-2 py-1 text-xs hover:bg-accent"
                >
                  Later
                </button>
                <button
                  type="button"
                  onClick={onRestart}
                  className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
                >
                  Restart Now
                </button>
              </div>
            </>
          )}

          {status === "signature-error" && (
            <>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                Update could not be verified. The update signature is invalid.
              </Dialog.Description>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded border px-2 py-1 text-xs hover:bg-accent"
                >
                  Dismiss
                </button>
              </div>
            </>
          )}

          {status === "error" && errorType !== "signature" && (
            <>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                Failed to download the update. Please try again later.
              </Dialog.Description>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded border px-2 py-1 text-xs hover:bg-accent"
                >
                  Dismiss
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
