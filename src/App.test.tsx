import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpStatusInfo } from "@/ipc/settings";
import App from "./App";

const { useWorkspaceActions } = vi.hoisted(() => ({
  useWorkspaceActions: vi.fn(),
}));
vi.mock("@/hooks/useWorkspaceActions", () => ({ useWorkspaceActions }));

vi.mock("@/app/McpSetupGate", () => ({
  McpSetupGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/pages/WorkspacePage", () => ({
  WorkspacePage: () => <div data-testid="workspace-page" />,
}));

const { useMcpStatus, useConfigureMcpPort } = vi.hoisted(() => ({
  useMcpStatus: vi.fn(),
  useConfigureMcpPort: vi.fn(),
}));
vi.mock("@/hooks/useMcpSettings", () => ({ useMcpStatus, useConfigureMcpPort }));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));

const { getVersion } = vi.hoisted(() => ({
  getVersion: vi.fn(),
}));
vi.mock("@tauri-apps/api/app", () => ({ getVersion }));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn().mockResolvedValue(null),
}));
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

describe("App", () => {
  beforeEach(() => {
    getVersion.mockResolvedValue("0.1.0");
    useWorkspaceActions.mockReturnValue({
      handleNewWorkspace: vi.fn(),
      handleOpenSavedWorkspaces: vi.fn(),
      handleSave: vi.fn(),
    });
    useMcpStatus.mockReturnValue({
      data: { configured: true, port: 8741, error: null } satisfies McpStatusInfo,
      isLoading: false,
      error: null,
    });
    useConfigureMcpPort.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ configured: true, port: 8741, error: null }),
      isPending: false,
    });
  });

  it("renders MenuBar and not AppToolbar or any standalone settings/gear button (FR-007/SC-002)", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Options" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Help" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Settings")).not.toBeInTheDocument();
    expect(screen.getByTestId("workspace-page")).toBeInTheDocument();
  });

  it("selecting Options opens SettingsDialog", async () => {
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Options" }));

    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
  });

  it("selecting Help > About opens AboutDialog", async () => {
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Help" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "About" }));

    expect(await screen.findByText("0.1.0")).toBeInTheDocument();
  });

  it("Workspace menu New/Open/Save invoke useWorkspaceActions handlers", async () => {
    const handleNewWorkspace = vi.fn();
    const handleOpenSavedWorkspaces = vi.fn();
    const handleSave = vi.fn();
    useWorkspaceActions.mockReturnValue({
      handleNewWorkspace,
      handleOpenSavedWorkspaces,
      handleSave,
    });

    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Workspace" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "New" }));
    expect(handleNewWorkspace).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: "Workspace" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Open" }));
    expect(handleOpenSavedWorkspaces).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: "Workspace" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Save" }));
    expect(handleSave).toHaveBeenCalledOnce();
  });
});
