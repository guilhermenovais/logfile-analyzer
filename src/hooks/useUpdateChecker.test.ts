import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdateChecker } from "./useUpdateChecker";

const check = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-updater", () => ({ check }));

describe("useUpdateChecker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
});
