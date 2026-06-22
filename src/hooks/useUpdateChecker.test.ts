import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdateChecker } from "./useUpdateChecker";

const check = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-updater", () => ({ check }));

const mockGetPlatform = vi.hoisted(() => vi.fn());
const mockDownloadUpdate = vi.hoisted(() => vi.fn());
const mockInstallUpdate = vi.hoisted(() => vi.fn());
vi.mock("@/ipc/update", () => ({
  getPlatform: mockGetPlatform,
  downloadUpdate: mockDownloadUpdate,
  installUpdate: mockInstallUpdate,
}));

describe("useUpdateChecker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockGetPlatform.mockResolvedValue("windows");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("transitions to checking on mount", async () => {
    check.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUpdateChecker());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("checking");
    expect(check).toHaveBeenCalled();
  });

  it("transitions to available when an update is found", async () => {
    const fakeUpdate = {
      version: "1.2.0",
      date: "2026-06-18",
      body: "Release notes",
      downloadAndInstall: vi.fn(),
    };
    check.mockResolvedValue(fakeUpdate);

    const { result } = renderHook(() => useUpdateChecker());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("available");
    expect(result.current.update).toBe(fakeUpdate);
  });

  it("transitions to not-available when no update exists", async () => {
    check.mockResolvedValue(null);

    const { result } = renderHook(() => useUpdateChecker());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("not-available");
    expect(result.current.update).toBeNull();
  });

  it("transitions to error on check failure without surfacing to user", async () => {
    check.mockRejectedValue(new Error("Network down"));

    const { result } = renderHook(() => useUpdateChecker());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.update).toBeNull();
  });

  it("transitions to downloading state with progress tracking when startDownload is called", async () => {
    let onProgress: ((event: unknown) => void) | undefined;
    const fakeUpdate = {
      version: "1.2.0",
      downloadAndInstall: vi.fn((cb: (event: unknown) => void) => {
        onProgress = cb;
        return new Promise(() => {});
      }),
    };
    check.mockResolvedValue(fakeUpdate);

    const { result } = renderHook(() => useUpdateChecker());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("available");

    act(() => {
      result.current.startDownload();
    });

    expect(result.current.status).toBe("downloading");
    expect(result.current.downloadProgress).toEqual({
      contentLength: null,
      downloaded: 0,
    });

    act(() => {
      onProgress!({ event: "Started", data: { contentLength: 1000 } });
    });
    expect(result.current.downloadProgress?.contentLength).toBe(1000);

    act(() => {
      onProgress!({ event: "Progress", data: { chunkLength: 400 } });
    });
    expect(result.current.downloadProgress?.downloaded).toBe(400);

    act(() => {
      onProgress!({ event: "Progress", data: { chunkLength: 600 } });
    });
    expect(result.current.downloadProgress?.downloaded).toBe(1000);
  });

  it("transitions to downloaded when download completes", async () => {
    let onProgress: ((event: unknown) => void) | undefined;
    const fakeUpdate = {
      version: "1.2.0",
      downloadAndInstall: vi.fn((cb: (event: unknown) => void) => {
        onProgress = cb;
        return Promise.resolve();
      }),
    };
    check.mockResolvedValue(fakeUpdate);

    const { result } = renderHook(() => useUpdateChecker());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      result.current.startDownload();
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      onProgress!({ event: "Finished" });
    });

    expect(result.current.status).toBe("downloaded");
  });

  it("transitions to error on download failure", async () => {
    const fakeUpdate = {
      version: "1.2.0",
      downloadAndInstall: vi.fn(() =>
        Promise.reject(new Error("Connection lost")),
      ),
    };
    check.mockResolvedValue(fakeUpdate);

    const { result } = renderHook(() => useUpdateChecker());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      result.current.startDownload();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.errorType).toBe("network");
  });

  it("produces signature-error status on signature verification failure", async () => {
    const fakeUpdate = {
      version: "1.2.0",
      downloadAndInstall: vi.fn(() =>
        Promise.reject(new Error("signature verification failed")),
      ),
    };
    check.mockResolvedValue(fakeUpdate);

    const { result } = renderHook(() => useUpdateChecker());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      result.current.startDownload();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("signature-error");
    expect(result.current.errorType).toBe("signature");
  });

  it("distinguishes signature error from network error by errorType", async () => {
    const fakeUpdate = {
      version: "1.2.0",
      downloadAndInstall: vi.fn(() =>
        Promise.reject(new Error("could not verify update signature")),
      ),
    };
    check.mockResolvedValue(fakeUpdate);

    const { result } = renderHook(() => useUpdateChecker());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      result.current.startDownload();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.errorType).toBe("signature");
    expect(result.current.status).toBe("signature-error");
  });

  // T010: Linux two-phase update flow tests
  describe("Linux two-phase flow", () => {
    beforeEach(() => {
      mockGetPlatform.mockResolvedValue("linux");
    });

    it("uses custom download+install on Linux", async () => {
      const fakeUpdate = {
        version: "1.2.0",
        downloadAndInstall: vi.fn(),
        download_url: "https://example.com/update.deb",
        signature: "fakesig==",
      };
      check.mockResolvedValue(fakeUpdate);
      mockDownloadUpdate.mockResolvedValue({
        path: "/tmp/update.deb",
        package_type: "deb",
      });
      mockInstallUpdate.mockResolvedValue(undefined);

      const { result } = renderHook(() => useUpdateChecker());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.status).toBe("available");

      await act(async () => {
        result.current.startDownload();
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(mockDownloadUpdate).toHaveBeenCalled();
      expect(mockInstallUpdate).toHaveBeenCalledWith(
        "/tmp/update.deb",
        "deb",
      );
      expect(fakeUpdate.downloadAndInstall).not.toHaveBeenCalled();
      expect(result.current.status).toBe("downloaded");
    });

    it("transitions through downloading → installing → downloaded on Linux", async () => {
      const fakeUpdate = {
        version: "1.2.0",
        downloadAndInstall: vi.fn(),
        download_url: "https://example.com/update.deb",
        signature: "fakesig==",
      };
      check.mockResolvedValue(fakeUpdate);

      let resolveDownload: (v: unknown) => void;
      mockDownloadUpdate.mockReturnValue(
        new Promise((resolve) => {
          resolveDownload = resolve;
        }),
      );

      const { result } = renderHook(() => useUpdateChecker());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      act(() => {
        result.current.startDownload();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.status).toBe("downloading");

      let resolveInstall: (v: unknown) => void;
      mockInstallUpdate.mockReturnValue(
        new Promise((resolve) => {
          resolveInstall = resolve;
        }),
      );

      await act(async () => {
        resolveDownload!({ path: "/tmp/update.deb", package_type: "deb" });
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.status).toBe("installing");

      await act(async () => {
        resolveInstall!(undefined);
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.status).toBe("downloaded");
    });

    it("transitions to install-error on install failure", async () => {
      const fakeUpdate = {
        version: "1.2.0",
        downloadAndInstall: vi.fn(),
        download_url: "https://example.com/update.deb",
        signature: "fakesig==",
      };
      check.mockResolvedValue(fakeUpdate);
      mockDownloadUpdate.mockResolvedValue({
        path: "/tmp/update.deb",
        package_type: "deb",
      });
      mockInstallUpdate.mockRejectedValue({
        kind: "UserCancelled",
      });

      const { result } = renderHook(() => useUpdateChecker());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      await act(async () => {
        result.current.startDownload();
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.status).toBe("install-error");
      expect(result.current.errorInfo).toBeDefined();
    });

  });

  // T018: Retry Install tests
  describe("retry install", () => {
    beforeEach(() => {
      mockGetPlatform.mockResolvedValue("linux");
    });

    it("retryInstall calls installUpdate with stored path without re-downloading", async () => {
      const fakeUpdate = {
        version: "1.2.0",
        downloadAndInstall: vi.fn(),
        download_url: "https://example.com/update.deb",
        signature: "fakesig==",
      };
      check.mockResolvedValue(fakeUpdate);
      mockDownloadUpdate.mockResolvedValue({
        path: "/tmp/update.deb",
        package_type: "deb",
      });
      mockInstallUpdate.mockRejectedValueOnce({ kind: "UserCancelled" });

      const { result } = renderHook(() => useUpdateChecker());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        result.current.startDownload();
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.status).toBe("install-error");
      expect(mockDownloadUpdate).toHaveBeenCalledTimes(1);

      mockInstallUpdate.mockResolvedValueOnce(undefined);
      await act(async () => {
        result.current.retryInstall();
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.status).toBe("downloaded");
      expect(mockDownloadUpdate).toHaveBeenCalledTimes(1);
      expect(mockInstallUpdate).toHaveBeenCalledTimes(2);
      expect(mockInstallUpdate).toHaveBeenLastCalledWith(
        "/tmp/update.deb",
        "deb",
      );
    });
  });

  // T019: Hard timeout test
  describe("hard timeout", () => {
    beforeEach(() => {
      mockGetPlatform.mockResolvedValue("linux");
    });

    it("transitions to install-error with timeout kind after 120s", async () => {
      const fakeUpdate = {
        version: "1.2.0",
        downloadAndInstall: vi.fn(),
        download_url: "https://example.com/update.deb",
        signature: "fakesig==",
      };
      check.mockResolvedValue(fakeUpdate);
      mockDownloadUpdate.mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useUpdateChecker());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      act(() => {
        result.current.startDownload();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_000);
      });

      expect(result.current.status).toBe("install-error");
      expect(result.current.errorInfo?.kind).toBe("timeout");
    });
  });

  it("uses plugin downloadAndInstall on non-Linux platforms", async () => {
    mockGetPlatform.mockResolvedValue("macos");
    const fakeUpdate = {
      version: "1.2.0",
      downloadAndInstall: vi.fn(() => Promise.resolve()),
    };
    check.mockResolvedValue(fakeUpdate);

    const { result } = renderHook(() => useUpdateChecker());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      result.current.startDownload();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fakeUpdate.downloadAndInstall).toHaveBeenCalled();
    expect(mockDownloadUpdate).not.toHaveBeenCalled();
  });
});
