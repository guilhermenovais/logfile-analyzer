import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TimeRangeField } from "./TimeRangeField";

const JUNE_12_1800 = new Date(2026, 5, 12, 18, 0).getTime();

describe("TimeRangeField", () => {
  it("renders a text input pre-filled via the YYYY-MM-DD HH:mm formatter, empty when value is null", () => {
    const { rerender } = render(
      <TimeRangeField label="From" value={JUNE_12_1800} onChange={vi.fn()} />,
    );

    expect(screen.getByLabelText("Time range from")).toHaveValue(
      "2026-06-12 18:00",
    );

    rerender(<TimeRangeField label="To" value={null} onChange={vi.fn()} />);

    expect(screen.getByLabelText("Time range to")).toHaveValue("");
  });

  it("typing a full value and blurring commits the parsed epoch-ms without aria-invalid (FR-007/FR-013)", async () => {
    const onChange = vi.fn();
    render(<TimeRangeField label="From" value={null} onChange={onChange} />);

    const input = screen.getByLabelText("Time range from");
    await userEvent.type(input, "2026-06-12 18:00");
    await userEvent.tab();

    expect(onChange).toHaveBeenCalledWith(JUNE_12_1800);
    expect(input).toHaveAttribute("aria-invalid", "false");
  });

  it("typing an unparseable value sets aria-invalid, applies invalid styling, and does not call onChange (FR-010)", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TimeRangeField label="To" value={JUNE_12_1800} onChange={onChange} />,
    );

    const input = screen.getByLabelText("Time range to");
    await userEvent.clear(input);
    await userEvent.type(input, "not-a-date");
    await userEvent.tab();

    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveClass("border-destructive");

    // Re-rendering with the same (uncommitted) value prop restores the
    // last-committed display value.
    rerender(<TimeRangeField label="To" value={JUNE_12_1800} onChange={onChange} />);
    expect(input).toHaveValue("2026-06-12 18:00");
  });

  it("a calendar button opens a popover with a day grid and hour/minute steppers seeded from value (FR-008)", async () => {
    render(<TimeRangeField label="From" value={JUNE_12_1800} onChange={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Open From date picker" }),
    );

    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.getByLabelText("From hour")).toHaveValue(18);
    expect(screen.getByLabelText("From minute")).toHaveValue(0);
  });

  it("selecting a day in the calendar keeps the popover open, updates the selected day, and does not call onChange (FR-004)", async () => {
    const onChange = vi.fn();
    render(<TimeRangeField label="From" value={JUNE_12_1800} onChange={onChange} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Open From date picker" }),
    );
    expect(screen.getByRole("grid")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Monday, June 15th, 2026" }),
    );

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Monday, June 15th, 2026, selected" })
        .parentElement,
    ).toHaveAttribute("aria-selected", "true");
  });

  it("changing the hour then the minute input keeps the popover open, updates the displayed values, and does not call onChange (FR-005)", async () => {
    const onChange = vi.fn();
    render(<TimeRangeField label="From" value={JUNE_12_1800} onChange={onChange} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Open From date picker" }),
    );

    fireEvent.change(screen.getByLabelText("From hour"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("From minute"), { target: { value: "30" } });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.getByLabelText("From hour")).toHaveValue(9);
    expect(screen.getByLabelText("From minute")).toHaveValue(30);
  });

  it("activating the confirm button commits the in-progress selection and closes the popover (FR-006)", async () => {
    const onChange = vi.fn();
    render(<TimeRangeField label="From" value={JUNE_12_1800} onChange={onChange} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Open From date picker" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Monday, June 15th, 2026" }),
    );
    fireEvent.change(screen.getByLabelText("From hour"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("From minute"), { target: { value: "30" } });

    await userEvent.click(
      screen.getByRole("button", { name: "Confirm From selection" }),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(new Date(2026, 5, 15, 9, 30).getTime());
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("interacting outside the popover commits the in-progress selection, same as the confirm button (FR-007)", async () => {
    const onChange = vi.fn();
    render(<TimeRangeField label="From" value={JUNE_12_1800} onChange={onChange} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Open From date picker" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Monday, June 15th, 2026" }),
    );
    fireEvent.change(screen.getByLabelText("From hour"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("From minute"), { target: { value: "30" } });

    fireEvent.pointerDown(document.body);
    fireEvent.pointerUp(document.body);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(new Date(2026, 5, 15, 9, 30).getTime());
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("opening and closing the popover with no changes calls onChange with the unchanged value (Scenario 5)", async () => {
    const onChange = vi.fn();
    render(<TimeRangeField label="From" value={JUNE_12_1800} onChange={onChange} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Open From date picker" }),
    );
    expect(screen.getByRole("grid")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    fireEvent.pointerUp(document.body);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(JUNE_12_1800);
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("disabled disables the text input and the picker-trigger button", () => {
    render(
      <TimeRangeField label="From" value={JUNE_12_1800} onChange={vi.fn()} disabled />,
    );

    expect(screen.getByLabelText("Time range from")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Open From date picker" }),
    ).toBeDisabled();
  });
});
