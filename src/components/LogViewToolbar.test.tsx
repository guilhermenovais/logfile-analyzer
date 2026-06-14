import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useLogViewToolbarStore } from "@/hooks/useLogViewToolbarStore";
import { useSearchUiStore } from "@/hooks/useSearchUiStore";
import { LogViewToolbar } from "./LogViewToolbar";

describe("LogViewToolbar", () => {
  beforeEach(() => {
    useLogViewToolbarStore.setState({ slices: {} });
    useSearchUiStore.setState({ slices: {} });
  });

  it("renders all controls within a single flex-wrap row (FR-001/FR-015)", () => {
    const { container } = render(
      <LogViewToolbar alias="app" hasTimestampFormat={false} />,
    );

    expect(container.firstChild).toHaveClass(
      "flex",
      "flex-wrap",
      "items-center",
      "gap-2",
    );
  });

  it("renders time-range fields when hasTimestampFormat, with Clear hidden until a range is set (FR-001/FR-007)", () => {
    render(<LogViewToolbar alias="app" hasTimestampFormat={true} />);

    expect(screen.getByLabelText("Time range from")).toBeInTheDocument();
    expect(screen.getByLabelText("Time range to")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("shows Clear when a time range is set and clears it via setTimeRange (FR-001)", async () => {
    useSearchUiStore.getState().setTimeRange("app", 1000, 2000);
    render(<LogViewToolbar alias="app" hasTimestampFormat={true} />);

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(useSearchUiStore.getState().slices["app"].timeFrom).toBeNull();
    expect(useSearchUiStore.getState().slices["app"].timeTo).toBeNull();
  });

  it("omits time-range fields and Clear when hasTimestampFormat is false, but renders the other toggles (FR-002)", () => {
    render(<LogViewToolbar alias="app" hasTimestampFormat={false} />);

    expect(screen.queryByLabelText("Time range from")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Time range to")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/highlighted only/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/wrap lines/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /show highlights/i }),
    ).toBeInTheDocument();
  });

  it("the Highlighted only checkbox reflects and updates highlightedOnly, independent of the show/hide button (FR-006)", async () => {
    render(<LogViewToolbar alias="app" hasTimestampFormat={false} />);

    const checkbox = screen.getByLabelText(/highlighted only/i);
    expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);

    expect(checkbox).toBeChecked();
    expect(useLogViewToolbarStore.getState().slices["app"].highlightedOnly).toBe(
      true,
    );
    expect(useLogViewToolbarStore.getState().slices["app"].highlightsVisible).toBe(
      false,
    );
  });

  it("the show/hide button toggles highlightsVisible without changing highlightedOnly (FR-003/FR-005)", async () => {
    render(<LogViewToolbar alias="app" hasTimestampFormat={false} />);

    const button = screen.getByRole("button", { name: /show highlights/i });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "highlighted-lines-panel");

    await userEvent.click(button);

    expect(useLogViewToolbarStore.getState().slices["app"].highlightsVisible).toBe(
      true,
    );
    expect(useLogViewToolbarStore.getState().slices["app"].highlightedOnly).toBe(
      false,
    );
    expect(screen.getByRole("button", { name: /hide highlights/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("the Wrap lines checkbox reflects and updates wrap", async () => {
    render(<LogViewToolbar alias="app" hasTimestampFormat={false} />);

    const checkbox = screen.getByLabelText(/wrap lines/i);
    expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);

    expect(checkbox).toBeChecked();
    expect(useLogViewToolbarStore.getState().slices["app"].wrap).toBe(true);
  });
});
