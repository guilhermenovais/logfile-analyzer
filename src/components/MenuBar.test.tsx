import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MenuBar } from "./MenuBar";

function renderMenuBar() {
  const onNewWorkspace = vi.fn();
  const onOpenSavedWorkspaces = vi.fn();
  const onSaveWorkspace = vi.fn();
  const onOpenSettings = vi.fn();
  const onOpenAbout = vi.fn();

  render(
    <MenuBar
      onNewWorkspace={onNewWorkspace}
      onOpenSavedWorkspaces={onOpenSavedWorkspaces}
      onSaveWorkspace={onSaveWorkspace}
      onOpenSettings={onOpenSettings}
      onOpenAbout={onOpenAbout}
    />,
  );

  return { onNewWorkspace, onOpenSavedWorkspaces, onSaveWorkspace, onOpenSettings, onOpenAbout };
}

describe("MenuBar", () => {
  it("renders exactly Workspace, Options, and Help top-level triggers and no settings/gear/cog icon (FR-001/FR-007/SC-002)", () => {
    renderMenuBar();

    expect(screen.getByRole("button", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Options" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Help" })).toBeInTheDocument();

    expect(screen.queryByLabelText("Settings")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /settings|gear|cog/i })).not.toBeInTheDocument();
  });

  it("Workspace menu lists New/Open/Save and calls the matching handlers (FR-002)", async () => {
    const { onNewWorkspace, onOpenSavedWorkspaces, onSaveWorkspace } = renderMenuBar();

    await userEvent.click(screen.getByRole("button", { name: "Workspace" }));
    expect(await screen.findByRole("menuitem", { name: "New" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Open" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Save" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("menuitem", { name: "New" }));
    expect(onNewWorkspace).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: "Workspace" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Open" }));
    expect(onOpenSavedWorkspaces).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: "Workspace" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Save" }));
    expect(onSaveWorkspace).toHaveBeenCalledOnce();
  });

  it("Options is a plain button with no dropdown content that opens settings directly (FR-006)", async () => {
    const { onOpenSettings } = renderMenuBar();

    await userEvent.click(screen.getByRole("button", { name: "Options" }));

    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("Help menu lists About and calls onOpenAbout (FR-008)", async () => {
    const { onOpenAbout } = renderMenuBar();

    await userEvent.click(screen.getByRole("button", { name: "Help" }));
    const aboutItem = await screen.findByRole("menuitem", { name: "About" });
    expect(aboutItem).toBeInTheDocument();

    await userEvent.click(aboutItem);
    expect(onOpenAbout).toHaveBeenCalledOnce();
  });
});
