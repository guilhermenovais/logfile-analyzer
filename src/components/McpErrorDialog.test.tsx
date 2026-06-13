import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { McpErrorDialog } from "./McpErrorDialog";

describe("McpErrorDialog", () => {
  it("renders the error message when present", () => {
    render(
      <McpErrorDialog
        open={true}
        error="address in use"
        onOpenChange={() => {}}
        onOpenSettings={() => {}}
      />,
    );

    expect(screen.getByText(/address in use/i)).toBeInTheDocument();
  });

  it("is dismissible without re-blocking the app", async () => {
    const onOpenChange = vi.fn();
    render(
      <McpErrorDialog
        open={true}
        error="address in use"
        onOpenChange={onOpenChange}
        onOpenSettings={() => {}}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onOpenSettings when 'Go to Settings' is clicked", async () => {
    const onOpenSettings = vi.fn();
    render(
      <McpErrorDialog
        open={true}
        error="address in use"
        onOpenChange={() => {}}
        onOpenSettings={onOpenSettings}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /go to settings/i }));

    expect(onOpenSettings).toHaveBeenCalledOnce();
  });
});
