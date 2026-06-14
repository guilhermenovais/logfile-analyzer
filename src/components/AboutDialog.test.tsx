import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AboutDialog } from "./AboutDialog";

const { getVersion } = vi.hoisted(() => ({
  getVersion: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({ getVersion }));

describe("AboutDialog", () => {
  it("displays the resolved app version from getVersion() (FR-009)", async () => {
    getVersion.mockResolvedValue("0.1.0");

    render(<AboutDialog open onOpenChange={() => {}} />);

    expect(getVersion).toHaveBeenCalledOnce();
    expect(await screen.findByText("0.1.0")).toBeInTheDocument();
  });

  it("shows a fallback placeholder while the version is pending", () => {
    let resolveVersion: (value: string) => void = () => {};
    getVersion.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveVersion = resolve;
      }),
    );

    render(<AboutDialog open onOpenChange={() => {}} />);

    expect(screen.getByText("—")).toBeInTheDocument();
    resolveVersion("0.1.0");
  });

  it("shows a fallback placeholder if getVersion() rejects", async () => {
    getVersion.mockRejectedValue(new Error("not available"));

    render(<AboutDialog open onOpenChange={() => {}} />);

    await waitFor(() => expect(screen.getByText("—")).toBeInTheDocument());
  });
});
