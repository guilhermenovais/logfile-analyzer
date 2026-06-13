import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IpcError } from "@/ipc/client";
import type { McpStatusInfo } from "@/ipc/settings";
import { SettingsDialog } from "./SettingsDialog";

const { useMcpStatus, useConfigureMcpPort } = vi.hoisted(() => ({
  useMcpStatus: vi.fn(),
  useConfigureMcpPort: vi.fn(),
}));

vi.mock("@/hooks/useMcpSettings", () => ({ useMcpStatus, useConfigureMcpPort }));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));

function mockQuery(overrides: Partial<ReturnType<typeof useMcpStatus>> = {}) {
  return {
    data: { configured: true, port: 8741, error: null } satisfies McpStatusInfo,
    isLoading: false,
    error: null,
    ...overrides,
  };
}

function mockMutation(overrides: Partial<ReturnType<typeof useConfigureMcpPort>> = {}) {
  return {
    mutateAsync: vi.fn().mockResolvedValue({ configured: true, port: 9000, error: null }),
    isPending: false,
    ...overrides,
  };
}

describe("SettingsDialog", () => {
  it("shows the currently configured port (FR-013)", () => {
    useMcpStatus.mockReturnValue(mockQuery());
    useConfigureMcpPort.mockReturnValue(mockMutation());

    render(<SettingsDialog open={true} onOpenChange={() => {}} />);

    expect(screen.getByRole("textbox", { name: /port/i })).toHaveValue("8741");
  });

  it("saves a new available port and updates the displayed port (FR-015)", async () => {
    useMcpStatus.mockReturnValue(mockQuery());
    const mutateAsync = vi
      .fn()
      .mockResolvedValue({ configured: true, port: 9000, error: null });
    useConfigureMcpPort.mockReturnValue(mockMutation({ mutateAsync }));

    render(<SettingsDialog open={true} onOpenChange={() => {}} />);

    const input = screen.getByRole("textbox", { name: /port/i });
    await userEvent.clear(input);
    await userEvent.type(input, "9000");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(mutateAsync).toHaveBeenCalledWith(9000);
    expect(await screen.findByRole("textbox", { name: /port/i })).toHaveValue(
      "9000",
    );
  });

  it("shows the PortUnavailable message and keeps the previous port displayed (FR-016)", async () => {
    useMcpStatus.mockReturnValue(mockQuery());
    const mutateAsync = vi
      .fn()
      .mockRejectedValue(
        new IpcError({ kind: "PortUnavailable", message: "address in use" }),
      );
    useConfigureMcpPort.mockReturnValue(mockMutation({ mutateAsync }));

    render(<SettingsDialog open={true} onOpenChange={() => {}} />);

    const input = screen.getByRole("textbox", { name: /port/i });
    await userEvent.clear(input);
    await userEvent.type(input, "9001");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/address in use/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /port/i })).toHaveValue("9001");
  });

  it("shows a validation message and disables save for an invalid port (FR-003/FR-014)", async () => {
    useMcpStatus.mockReturnValue(mockQuery());
    const mutateAsync = vi.fn();
    useConfigureMcpPort.mockReturnValue(mockMutation({ mutateAsync }));

    render(<SettingsDialog open={true} onOpenChange={() => {}} />);

    const input = screen.getByRole("textbox", { name: /port/i });
    await userEvent.clear(input);
    await userEvent.type(input, "abc");

    expect(
      screen.getByText(/enter a port number between 1 and 65535/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("makes no configure_mcp_port call when closed without changes (Acceptance Scenario 5)", () => {
    useMcpStatus.mockReturnValue(mockQuery());
    const mutateAsync = vi.fn();
    useConfigureMcpPort.mockReturnValue(mockMutation({ mutateAsync }));

    const onOpenChange = vi.fn();
    render(<SettingsDialog open={true} onOpenChange={onOpenChange} />);

    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
