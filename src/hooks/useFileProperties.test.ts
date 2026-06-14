import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileProperties } from "@/bindings";
import {
  filePropertiesRefetchInterval,
  useFileProperties,
} from "./useFileProperties";

const { getFileProperties } = vi.hoisted(() => ({
  getFileProperties: vi.fn(),
}));

vi.mock("@/ipc/files", () => ({ getFileProperties }));

const properties: FileProperties = {
  total_lines: 3,
  has_timestamp_format: true,
  available: true,
  indexing_complete: true,
  first_timestamp: 1000,
  last_timestamp: 2000,
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useFileProperties", () => {
  beforeEach(() => {
    getFileProperties.mockReset();
  });

  it("fetches and returns FileProperties (including first/last timestamps) for the given alias", async () => {
    getFileProperties.mockResolvedValue(properties);

    const { result } = renderHook(() => useFileProperties("app"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getFileProperties).toHaveBeenCalledWith("app");
    expect(result.current.data).toEqual(properties);
    expect(result.current.data?.first_timestamp).toBe(1000);
    expect(result.current.data?.last_timestamp).toBe(2000);
  });

  it("does not call getFileProperties when alias is null", async () => {
    const { result } = renderHook(() => useFileProperties(null), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(getFileProperties).not.toHaveBeenCalled();
  });

  describe("filePropertiesRefetchInterval", () => {
    it("returns a positive number while indexing is incomplete", () => {
      expect(
        filePropertiesRefetchInterval({
          state: { data: { ...properties, indexing_complete: false } },
        }),
      ).toBeGreaterThan(0);
    });

    it("returns false once indexing is complete", () => {
      expect(
        filePropertiesRefetchInterval({
          state: { data: { ...properties, indexing_complete: true } },
        }),
      ).toBe(false);
    });

    it("returns a positive number when there is no data yet", () => {
      expect(filePropertiesRefetchInterval({ state: { data: undefined } })).toBeGreaterThan(
        0,
      );
    });
  });
});
