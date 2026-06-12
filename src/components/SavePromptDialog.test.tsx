import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SavePromptDialog } from "./SavePromptDialog";

function noop() {
  // placeholder callback for unused handlers
}

describe("SavePromptDialog", () => {
  it("does not render when closed", () => {
    render(
      <SavePromptDialog
        open={false}
        error={null}
        isSaving={false}
        onSave={noop}
        onDiscard={noop}
        onCancel={noop}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the alias input and actions when open", () => {
    render(
      <SavePromptDialog
        open={true}
        error={null}
        isSaving={false}
        onSave={noop}
        onDiscard={noop}
        onCancel={noop}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/alias/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /discard/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("calls onSave with the trimmed alias on submit", async () => {
    const onSave = vi.fn();
    render(
      <SavePromptDialog
        open={true}
        error={null}
        isSaving={false}
        onSave={onSave}
        onDiscard={noop}
        onCancel={noop}
      />,
    );

    await userEvent.type(screen.getByLabelText(/alias/i), "  my-investigation  ");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(onSave).toHaveBeenCalledWith("my-investigation");
  });

  it("calls onDiscard when Discard is clicked", async () => {
    const onDiscard = vi.fn();
    render(
      <SavePromptDialog
        open={true}
        error={null}
        isSaving={false}
        onSave={noop}
        onDiscard={onDiscard}
        onCancel={noop}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /discard/i }));

    expect(onDiscard).toHaveBeenCalled();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(
      <SavePromptDialog
        open={true}
        error={null}
        isSaving={false}
        onSave={noop}
        onDiscard={noop}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
  });

  it("shows an alias-collision error message", () => {
    render(
      <SavePromptDialog
        open={true}
        error="WorkspaceAliasInUse"
        isSaving={false}
        onSave={noop}
        onDiscard={noop}
        onCancel={noop}
      />,
    );

    expect(screen.getByText("WorkspaceAliasInUse")).toBeInTheDocument();
  });

  it("disables the save button while saving", () => {
    render(
      <SavePromptDialog
        open={true}
        error={null}
        isSaving={true}
        onSave={noop}
        onDiscard={noop}
        onCancel={noop}
      />,
    );

    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });
});
