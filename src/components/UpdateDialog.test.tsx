import { render, screen } from "@testing-library/react";
import type { Update } from "@tauri-apps/plugin-updater";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UpdateDialog } from "./UpdateDialog";

function fakeUpdate(overrides: Partial<Update> = {}): Update {
  return {
    available: true,
    currentVersion: "0.1.0",
    version: "2.0.0",
    rawJson: {},
    downloadAndInstall: vi.fn(),
    download: vi.fn(),
    install: vi.fn(),
    close: vi.fn(),
    ...overrides,
  } as unknown as Update;
}

describe("UpdateDialog", () => {
  it("renders nothing when no update is available", () => {
    const { container } = render(
      <UpdateDialog
        status="not-available"
        update={null}
        downloadProgress={null}
        onStartDownload={() => {}}
        onRestart={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders version number when update is available", () => {
    const update = fakeUpdate({ date: "2026-06-18", body: "New features" });

    render(
      <UpdateDialog
        status="available"
        update={update}
        downloadProgress={null}
        onStartDownload={() => {}}
        onRestart={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText(/2\.0\.0/)).toBeInTheDocument();
  });

  it("shows Update Now and Later buttons when update is available", () => {
    const update = fakeUpdate();

    render(
      <UpdateDialog
        status="available"
        update={update}
        downloadProgress={null}
        onStartDownload={() => {}}
        onRestart={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /update now/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /later/i }),
    ).toBeInTheDocument();
  });

  it("calls onDismiss when Later is clicked", async () => {
    const onDismiss = vi.fn();
    const update = fakeUpdate();

    render(
      <UpdateDialog
        status="available"
        update={update}
        downloadProgress={null}
        onStartDownload={() => {}}
        onRestart={() => {}}
        onDismiss={onDismiss}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /later/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("calls onStartDownload when Update Now is clicked", async () => {
    const onStartDownload = vi.fn();
    const update = fakeUpdate();

    render(
      <UpdateDialog
        status="available"
        update={update}
        downloadProgress={null}
        onStartDownload={onStartDownload}
        onRestart={() => {}}
        onDismiss={() => {}}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /update now/i }),
    );
    expect(onStartDownload).toHaveBeenCalledOnce();
  });

  it("renders progress bar during download", () => {
    const update = fakeUpdate();

    render(
      <UpdateDialog
        status="downloading"
        update={update}
        downloadProgress={{ contentLength: 1000, downloaded: 500 }}
        onStartDownload={() => {}}
        onRestart={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("renders restart prompt after download completes", () => {
    const update = fakeUpdate();

    render(
      <UpdateDialog
        status="downloaded"
        update={update}
        downloadProgress={null}
        onStartDownload={() => {}}
        onRestart={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /restart now/i }),
    ).toBeInTheDocument();
  });

  it("calls onRestart when Restart Now is clicked", async () => {
    const onRestart = vi.fn();
    const update = fakeUpdate();

    render(
      <UpdateDialog
        status="downloaded"
        update={update}
        downloadProgress={null}
        onStartDownload={() => {}}
        onRestart={onRestart}
        onDismiss={() => {}}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /restart now/i }),
    );
    expect(onRestart).toHaveBeenCalledOnce();
  });

  it("renders error message on download failure", () => {
    render(
      <UpdateDialog
        status="error"
        update={null}
        downloadProgress={null}
        errorType="network"
        onStartDownload={() => {}}
        onRestart={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText(/failed to download/i)).toBeInTheDocument();
  });

  it("renders signature verification error with distinct message", () => {
    render(
      <UpdateDialog
        status="signature-error"
        update={null}
        downloadProgress={null}
        errorType="signature"
        onStartDownload={() => {}}
        onRestart={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText(/could not be verified/i)).toBeInTheDocument();
  });

  it("renders generic error for network failures distinct from signature errors", () => {
    render(
      <UpdateDialog
        status="error"
        update={null}
        downloadProgress={null}
        errorType="network"
        onStartDownload={() => {}}
        onRestart={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText(/failed to download/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not be verified/i)).not.toBeInTheDocument();
  });

  it("shows Later button during download to dismiss", () => {
    const update = fakeUpdate();

    render(
      <UpdateDialog
        status="downloading"
        update={update}
        downloadProgress={{ contentLength: 1000, downloaded: 200 }}
        onStartDownload={() => {}}
        onRestart={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /later/i }),
    ).toBeInTheDocument();
  });

  // T011: New UI states for Linux two-phase flow
  it("renders Installing spinner for installing status", () => {
    render(
      <UpdateDialog
        status="installing"
        update={fakeUpdate()}
        downloadProgress={null}
        onStartDownload={() => {}}
        onRestart={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText("Installing update...")).toBeInTheDocument();
  });

  it("renders install-error with pkexec-not-found message", () => {
    render(
      <UpdateDialog
        status="install-error"
        update={null}
        downloadProgress={null}
        errorInfo={{
          kind: "pkexec-not-found",
          message: "pkexec is not available",
          releasesUrl: "https://github.com/guilhermenovais/logfile-analyzer/releases",
        }}
        onStartDownload={() => {}}
        onRestart={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText(/pkexec is not available/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download manually/i })).toBeInTheDocument();
  });

  it("renders install-error with user-cancelled message", () => {
    render(
      <UpdateDialog
        status="install-error"
        update={null}
        downloadProgress={null}
        errorInfo={{
          kind: "user-cancelled",
          message: "Authentication was cancelled",
          releasesUrl: "https://github.com/guilhermenovais/logfile-analyzer/releases",
        }}
        onStartDownload={() => {}}
        onRestart={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText(/authentication was cancelled/i)).toBeInTheDocument();
  });

  it("renders install-error with install-failed message", () => {
    render(
      <UpdateDialog
        status="install-error"
        update={null}
        downloadProgress={null}
        errorInfo={{
          kind: "install-failed",
          message: "Installation failed: exit code 1",
          releasesUrl: "https://github.com/guilhermenovais/logfile-analyzer/releases",
        }}
        onStartDownload={() => {}}
        onRestart={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText(/installation failed/i)).toBeInTheDocument();
  });

  it("renders install-error with timeout message", () => {
    render(
      <UpdateDialog
        status="install-error"
        update={null}
        downloadProgress={null}
        errorInfo={{
          kind: "timeout",
          message: "Update timed out",
          releasesUrl: "https://github.com/guilhermenovais/logfile-analyzer/releases",
        }}
        onStartDownload={() => {}}
        onRestart={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText(/timed out/i)).toBeInTheDocument();
  });

  it("shows Retry Install button on install-error", () => {
    const onRetryInstall = vi.fn();
    render(
      <UpdateDialog
        status="install-error"
        update={null}
        downloadProgress={null}
        errorInfo={{
          kind: "install-failed",
          message: "Installation failed",
          releasesUrl: "https://github.com/guilhermenovais/logfile-analyzer/releases",
        }}
        onRetryInstall={onRetryInstall}
        onStartDownload={() => {}}
        onRestart={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /retry install/i }),
    ).toBeInTheDocument();
  });

  it("calls onRetryInstall when Retry Install is clicked", async () => {
    const onRetryInstall = vi.fn();
    render(
      <UpdateDialog
        status="install-error"
        update={null}
        downloadProgress={null}
        errorInfo={{
          kind: "install-failed",
          message: "Installation failed",
          releasesUrl: "https://github.com/guilhermenovais/logfile-analyzer/releases",
        }}
        onRetryInstall={onRetryInstall}
        onStartDownload={() => {}}
        onRestart={() => {}}
        onDismiss={() => {}}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /retry install/i }),
    );
    expect(onRetryInstall).toHaveBeenCalledOnce();
  });
});
