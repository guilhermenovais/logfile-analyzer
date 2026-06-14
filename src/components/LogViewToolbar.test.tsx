import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLogViewToolbarStore } from "@/hooks/useLogViewToolbarStore";
import { useSearchUiStore } from "@/hooks/useSearchUiStore";
import { LogViewToolbar } from "./LogViewToolbar";

const { useFileProperties } = vi.hoisted(() => ({ useFileProperties: vi.fn() }));
vi.mock("@/hooks/useFileProperties", () => ({ useFileProperties }));

describe("LogViewToolbar", () => {
  beforeEach(() => {
    useLogViewToolbarStore.setState({ slices: {} });
    useSearchUiStore.setState({ slices: {} });
    useFileProperties.mockReturnValue({ data: undefined });
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

  it("shows Clear when a time range is set and resets it to the file's first/last timestamps (FR-009)", async () => {
    useFileProperties.mockReturnValue({
      data: {
        total_lines: 10,
        has_timestamp_format: true,
        available: true,
        indexing_complete: true,
        first_timestamp: 1000,
        last_timestamp: 5000,
      },
    });
    useSearchUiStore.getState().setTimeRange("app", 2000, 3000);
    render(<LogViewToolbar alias="app" hasTimestampFormat={true} />);

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(useSearchUiStore.getState().slices["app"].timeFrom).toBe(1000);
    expect(useSearchUiStore.getState().slices["app"].timeTo).toBe(5000);
  });

  it("Clear empties the fields when the file's first/last timestamps are unknown (FR-010)", async () => {
    useFileProperties.mockReturnValue({ data: undefined });
    useSearchUiStore.getState().setTimeRange("app", 2000, 3000);
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
