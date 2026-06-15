import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TimeRangeField } from "./TimeRangeField";

// 18:00 UTC on 2026-06-12 — displayed as "2026-06-12 18:00" at offsetMinutes=0.
const JUNE_12_1800_UTC = Date.UTC(2026, 5, 12, 18, 0);

describe("TimeRangeField", () => {
  describe("with offsetMinutes = 0 (UTC)", () => {
    it("renders a text input pre-filled via formatInOffset, empty when value is null", () => {
      const { rerender } = render(
        <TimeRangeField
          label="From"
          value={JUNE_12_1800_UTC}
          onChange={vi.fn()}
          offsetMinutes={0}
        />,
      );

      expect(screen.getByLabelText("Time range from")).toHaveValue(
        "2026-06-12 18:00",
      );

      rerender(
        <TimeRangeField label="To" value={null} onChange={vi.fn()} offsetMinutes={0} />,
      );

      expect(screen.getByLabelText("Time range to")).toHaveValue("");
    });

    it("typing a full value and blurring commits the parsed epoch-ms without aria-invalid (FR-007/FR-013)", async () => {
      const onChange = vi.fn();
      render(
        <TimeRangeField label="From" value={null} onChange={onChange} offsetMinutes={0} />,
      );

      const input = screen.getByLabelText("Time range from");
      await userEvent.type(input, "2026-06-12 18:00");
      await userEvent.tab();

      expect(onChange).toHaveBeenCalledWith(JUNE_12_1800_UTC);
      expect(input).toHaveAttribute("aria-invalid", "false");
    });

    it("typing an unparseable value sets aria-invalid, applies invalid styling, and does not call onChange (FR-010)", async () => {
      const onChange = vi.fn();
      const { rerender } = render(
        <TimeRangeField
          label="To"
          value={JUNE_12_1800_UTC}
          onChange={onChange}
          offsetMinutes={0}
        />,
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
      rerender(
        <TimeRangeField
          label="To"
          value={JUNE_12_1800_UTC}
          onChange={onChange}
          offsetMinutes={0}
        />,
      );
      expect(input).toHaveValue("2026-06-12 18:00");
    });

    it("a calendar button opens a popover with a day grid and hour/minute steppers seeded from value (FR-008)", async () => {
      render(
        <TimeRangeField
          label="From"
          value={JUNE_12_1800_UTC}
          onChange={vi.fn()}
          offsetMinutes={0}
        />,
      );

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
      render(
        <TimeRangeField
          label="From"
          value={JUNE_12_1800_UTC}
          onChange={onChange}
          offsetMinutes={0}
        />,
      );

      await userEvent.click(
        screen.getByRole("button", { name: "Open From date picker" }),
      );
      expect(screen.getByRole("grid")).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: /Monday, June 15th, 2026/ }),
      );

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole("grid")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Monday, June 15th, 2026, selected/ })
          .parentElement,
      ).toHaveAttribute("aria-selected", "true");
    });

    it("changing the hour then the minute input keeps the popover open, updates the displayed values, and does not call onChange (FR-005)", async () => {
      const onChange = vi.fn();
      render(
        <TimeRangeField
          label="From"
          value={JUNE_12_1800_UTC}
          onChange={onChange}
          offsetMinutes={0}
        />,
      );

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
      render(
        <TimeRangeField
          label="From"
          value={JUNE_12_1800_UTC}
          onChange={onChange}
          offsetMinutes={0}
        />,
      );

      await userEvent.click(
        screen.getByRole("button", { name: "Open From date picker" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: /Monday, June 15th, 2026/ }),
      );
      fireEvent.change(screen.getByLabelText("From hour"), { target: { value: "9" } });
      fireEvent.change(screen.getByLabelText("From minute"), { target: { value: "30" } });

      await userEvent.click(
        screen.getByRole("button", { name: "Confirm From selection" }),
      );

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(Date.UTC(2026, 5, 15, 9, 30));
      expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    });

    it("interacting outside the popover commits the in-progress selection, same as the confirm button (FR-007)", async () => {
      const onChange = vi.fn();
      render(
        <TimeRangeField
          label="From"
          value={JUNE_12_1800_UTC}
          onChange={onChange}
          offsetMinutes={0}
        />,
      );

      await userEvent.click(
        screen.getByRole("button", { name: "Open From date picker" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: /Monday, June 15th, 2026/ }),
      );
      fireEvent.change(screen.getByLabelText("From hour"), { target: { value: "9" } });
      fireEvent.change(screen.getByLabelText("From minute"), { target: { value: "30" } });

      fireEvent.pointerDown(document.body);
      fireEvent.pointerUp(document.body);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(Date.UTC(2026, 5, 15, 9, 30));
      expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    });

    it("opening and closing the popover with no changes calls onChange with the unchanged value (Scenario 5)", async () => {
      const onChange = vi.fn();
      render(
        <TimeRangeField
          label="From"
          value={JUNE_12_1800_UTC}
          onChange={onChange}
          offsetMinutes={0}
        />,
      );

      await userEvent.click(
        screen.getByRole("button", { name: "Open From date picker" }),
      );
      expect(screen.getByRole("grid")).toBeInTheDocument();

      fireEvent.pointerDown(document.body);
      fireEvent.pointerUp(document.body);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(JUNE_12_1800_UTC);
      expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    });

    it("disabled disables the text input and the picker-trigger button", () => {
      render(
        <TimeRangeField
          label="From"
          value={JUNE_12_1800_UTC}
          onChange={vi.fn()}
          offsetMinutes={0}
          disabled
        />,
      );

      expect(screen.getByLabelText("Time range from")).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Open From date picker" }),
      ).toBeDisabled();
    });
  });

  describe("with a non-zero offsetMinutes (FR-008/FR-009)", () => {
    // 23:00 UTC on 2026-06-12 — at UTC+120 this is the wall-clock time
    // 2026-06-13 01:00 (crosses a calendar-day boundary).
    const JUNE_12_2300_UTC = Date.UTC(2026, 5, 12, 23, 0);
    const OFFSET_MINUTES = 120;

    it("displays the text input and seeds the picker's calendar day/hour/minute from the wall-clock value in UTC+offsetMinutes", async () => {
      render(
        <TimeRangeField
          label="From"
          value={JUNE_12_2300_UTC}
          onChange={vi.fn()}
          offsetMinutes={OFFSET_MINUTES}
        />,
      );

      expect(screen.getByLabelText("Time range from")).toHaveValue(
        "2026-06-13 01:00",
      );

      await userEvent.click(
        screen.getByRole("button", { name: "Open From date picker" }),
      );

      expect(screen.getByLabelText("From hour")).toHaveValue(1);
      expect(screen.getByLabelText("From minute")).toHaveValue(0);
      expect(
        screen.getByRole("button", { name: /Saturday, June 13th, 2026, selected/ }),
      ).toBeInTheDocument();
    });

    it("typing a value and blurring commits the epoch-ms parsed via UTC+offsetMinutes", async () => {
      const onChange = vi.fn();
      render(
        <TimeRangeField
          label="From"
          value={null}
          onChange={onChange}
          offsetMinutes={OFFSET_MINUTES}
        />,
      );

      const input = screen.getByLabelText("Time range from");
      await userEvent.type(input, "2026-06-13 01:00");
      await userEvent.tab();

      expect(onChange).toHaveBeenCalledWith(JUNE_12_2300_UTC);
    });

    it("selecting a day and confirming commits the epoch-ms via UTC+offsetMinutes", async () => {
      const onChange = vi.fn();
      render(
        <TimeRangeField
          label="From"
          value={JUNE_12_2300_UTC}
          onChange={onChange}
          offsetMinutes={OFFSET_MINUTES}
        />,
      );

      await userEvent.click(
        screen.getByRole("button", { name: "Open From date picker" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: /Monday, June 15th, 2026/ }),
      );
      fireEvent.change(screen.getByLabelText("From hour"), { target: { value: "9" } });
      fireEvent.change(screen.getByLabelText("From minute"), { target: { value: "30" } });

      await userEvent.click(
        screen.getByRole("button", { name: "Confirm From selection" }),
      );

      expect(onChange).toHaveBeenCalledWith(
        Date.UTC(2026, 5, 15, 9, 30) - OFFSET_MINUTES * 60_000,
      );
    });
  });
});
