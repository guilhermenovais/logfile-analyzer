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

  it("selecting a day in the calendar calls onChange with the combined date+existing-time value and closes the popover (FR-009)", async () => {
    const onChange = vi.fn();
    render(<TimeRangeField label="From" value={JUNE_12_1800} onChange={onChange} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Open From date picker" }),
    );
    expect(screen.getByRole("grid")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Monday, June 15th, 2026" }),
    );

    expect(onChange).toHaveBeenCalledWith(new Date(2026, 5, 15, 18, 0).getTime());
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("changing the hour stepper calls onChange with the combined value and closes the popover (FR-008/FR-009)", async () => {
    const onChange = vi.fn();
    render(<TimeRangeField label="From" value={JUNE_12_1800} onChange={onChange} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Open From date picker" }),
    );

    const hourInput = screen.getByLabelText("From hour");
    fireEvent.change(hourInput, { target: { value: "9" } });

    expect(onChange).toHaveBeenCalledWith(new Date(2026, 5, 12, 9, 0).getTime());
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
