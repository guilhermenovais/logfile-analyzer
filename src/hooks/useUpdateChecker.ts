import { useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import {
  downloadUpdate,
  getPlatform,
  installUpdate,
  type DownloadResult,
} from "@/ipc/update";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "error"
  | "downloading"
  | "installing"
  | "downloaded"
  | "signature-error"
  | "install-error";

export interface DownloadProgress {
  contentLength: number | null;
  downloaded: number;
}

export interface UpdateErrorInfo {
  kind:
    | "download"
    | "signature"
    | "pkexec-not-found"
    | "user-cancelled"
    | "install-failed"
    | "timeout"
    | "unknown";
  message: string;
  releasesUrl: string;
}

const RELEASES_URL =
  "https://github.com/guilhermenovais/logfile-analyzer/releases";

export interface UpdateCheckerState {
  status: UpdateStatus;
  update: Update | null;
  downloadProgress: DownloadProgress | null;
  errorType: "network" | "signature" | null;
  errorInfo: UpdateErrorInfo | null;
  startDownload: () => void;
  retryInstall: () => void;
  dismiss: () => void;
}

function mapInstallErrorKind(err: unknown): UpdateErrorInfo["kind"] {
  if (err && typeof err === "object" && "kind" in err) {
    const kind = (err as { kind: string }).kind;
    switch (kind) {
      case "PkexecNotFound":
        return "pkexec-not-found";
      case "UserCancelled":
        return "user-cancelled";
      case "Timeout":
        return "timeout";
      case "InstallFailed":
        return "install-failed";
      case "DownloadFailed":
        return "download";
      case "SignatureInvalid":
        return "signature";
      default:
        return "unknown";
    }
  }
  return "unknown";
}

function mapInstallErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    if ("message" in err && typeof (err as { message: unknown }).message === "string") {
      return (err as { message: string }).message;
    }
    const kind = mapInstallErrorKind(err);
    switch (kind) {
      case "pkexec-not-found":
        return "pkexec is not available. Please download the update manually.";
      case "user-cancelled":
        return "Authentication was cancelled.";
      case "timeout":
        return "Update timed out.";
      default:
        return "Installation failed.";
    }
  }
  if (err instanceof Error) return err.message;
  return "Installation failed.";
}

const HARD_TIMEOUT_MS = 120_000;

export function useUpdateChecker(): UpdateCheckerState {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgress | null>(null);
  const [errorType, setErrorType] = useState<"network" | "signature" | null>(
    null,
  );
  const [errorInfo, setErrorInfo] = useState<UpdateErrorInfo | null>(null);
  const downloadResultRef = useRef<DownloadResult | null>(null);
  const platformRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        platformRef.current = await getPlatform();
      } catch {
        platformRef.current = "unknown";
      }

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

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  async function startLinuxFlow(upd: Update) {
    setStatus("downloading");
    setDownloadProgress(null);
    setErrorType(null);
    setErrorInfo(null);

    const rawJson = upd.rawJson as {
      platforms?: Record<string, { url?: string; signature?: string }>;
    };
    const platforms = rawJson?.platforms ?? {};
    const linuxEntry =
      platforms["linux-x86_64"] ?? Object.values(platforms)[0];
    const url = (upd as unknown as { download_url?: string }).download_url ??
      linuxEntry?.url;
    const signature =
      (upd as unknown as { signature?: string }).signature ??
      linuxEntry?.signature;

    if (!url || !signature) {
      setErrorInfo({
        kind: "download",
        message: "No download URL or signature available for this platform.",
        releasesUrl: RELEASES_URL,
      });
      setStatus("install-error");
      return;
    }

    try {
      const result = await downloadUpdate(url, signature);
      downloadResultRef.current = result;

      setStatus("installing");

      await installUpdate(result.path, result.package_type);
      setStatus("downloaded");
    } catch (err) {
      const kind = mapInstallErrorKind(err);
      setErrorInfo({
        kind,
        message: mapInstallErrorMessage(err),
        releasesUrl: RELEASES_URL,
      });
      setStatus("install-error");
    }
  }

  function startDownload() {
    if (!update) return;

    if (platformRef.current === "linux") {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject({ kind: "Timeout", message: "Update timed out." }),
          HARD_TIMEOUT_MS,
        ),
      );
      void Promise.race([startLinuxFlow(update), timeoutPromise]).catch(
        (err) => {
          const kind = mapInstallErrorKind(err);
          setErrorInfo({
            kind,
            message: mapInstallErrorMessage(err),
            releasesUrl: RELEASES_URL,
          });
          setStatus("install-error");
        },
      );
      return;
    }

    setStatus("downloading");
    setDownloadProgress({ contentLength: null, downloaded: 0 });
    setErrorType(null);
    setErrorInfo(null);

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

  function retryInstall() {
    const stored = downloadResultRef.current;
    if (!stored) return;

    setStatus("installing");
    setErrorInfo(null);

    installUpdate(stored.path, stored.package_type)
      .then(() => setStatus("downloaded"))
      .catch((err) => {
        const kind = mapInstallErrorKind(err);
        setErrorInfo({
          kind,
          message: mapInstallErrorMessage(err),
          releasesUrl: RELEASES_URL,
        });
        setStatus("install-error");
      });
  }

  function dismiss() {
    setStatus("idle");
    setUpdate(null);
    setDownloadProgress(null);
    setErrorType(null);
    setErrorInfo(null);
    downloadResultRef.current = null;
  }

  return {
    status,
    update,
    downloadProgress,
    errorType,
    errorInfo,
    startDownload,
    retryInstall,
    dismiss,
  };
}
