import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "error"
  | "downloading"
  | "downloaded"
  | "signature-error";

export interface DownloadProgress {
  contentLength: number | null;
  downloaded: number;
}

export interface UpdateCheckerState {
  status: UpdateStatus;
  update: Update | null;
  downloadProgress: DownloadProgress | null;
  errorType: "network" | "signature" | null;
  startDownload: () => void;
  dismiss: () => void;
}

export function useUpdateChecker(): UpdateCheckerState {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgress | null>(null);
  const [errorType, setErrorType] = useState<"network" | "signature" | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function checkForUpdate() {
      setStatus("checking");
      try {
        const result = await check();
        if (cancelled) return;
        if (result) {
          setUpdate(result);
          setStatus("available");
        } else {
          setStatus("not-available");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
        }
      }
    }

    void checkForUpdate();
    return () => {
      cancelled = true;
    };
  }, []);

  function startDownload() {
    if (!update) return;

    setStatus("downloading");
    setDownloadProgress({ contentLength: null, downloaded: 0 });
    setErrorType(null);

    let totalDownloaded = 0;

    update
      .downloadAndInstall((event) => {
        if (event.event === "Started") {
          setDownloadProgress({
            contentLength: event.data.contentLength ?? null,
            downloaded: 0,
          });
        } else if (event.event === "Progress") {
          totalDownloaded += event.data.chunkLength;
          setDownloadProgress((prev) => ({
            contentLength: prev?.contentLength ?? null,
            downloaded: totalDownloaded,
          }));
        } else if (event.event === "Finished") {
          setStatus("downloaded");
        }
      })
      .catch((err: Error) => {
        const msg = err.message?.toLowerCase() ?? "";
        if (msg.includes("signature") || msg.includes("verify")) {
          setErrorType("signature");
          setStatus("signature-error");
        } else {
          setErrorType("network");
          setStatus("error");
        }
      });
  }

  function dismiss() {
    setStatus("idle");
    setUpdate(null);
    setDownloadProgress(null);
    setErrorType(null);
  }

  return { status, update, downloadProgress, errorType, startDownload, dismiss };
}
