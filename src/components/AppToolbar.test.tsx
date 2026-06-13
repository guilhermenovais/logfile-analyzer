import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppToolbar } from "./AppToolbar";

describe("AppToolbar", () => {
  it("renders a labeled Settings button alongside its children", () => {
    render(
      <AppToolbar onOpenSettings={() => {}}>
        <span>child content</span>
      </AppToolbar>,
    );

    expect(screen.getByText("child content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });

  it("invokes onOpenSettings when the Settings button is clicked (FR-012)", async () => {
    const onOpenSettings = vi.fn();
    render(
      <AppToolbar onOpenSettings={onOpenSettings}>
        <span>child content</span>
      </AppToolbar>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(onOpenSettings).toHaveBeenCalledOnce();
  });
});
