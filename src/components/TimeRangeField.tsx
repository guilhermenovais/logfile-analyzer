import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Calendar, Check } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { combineInOffset, formatInOffset, parseInOffset } from "@/lib/timeRange";

export interface TimeRangeFieldProps {
  /** "From" or "To" — used for the visible label and aria-label. */
  label: "From" | "To";
  /** Current committed value (epoch-ms), or `null` if unset. */
  value: number | null;
  /** Called with the new committed value (epoch-ms), or `null` to clear. */
  onChange: (value: number | null) => void;
  disabled?: boolean;
  /** The log file's detected UTC offset, in minutes (FR-008/FR-009). */
  offsetMinutes: number;
}

/**
 * Reads the wall-clock Y/M/D/H/M of `epochMs` in `UTC+offsetMinutes` (via
 * `formatInOffset`'s UTC getters) and constructs a `Date` from those fields
 * using the **local** constructor, so that `Date`'s local getters (used by
 * `DayPicker` and the hour/minute steppers) display that wall-clock value
 * regardless of the browser's actual timezone (research.md §3.3, "wall-clock
 * fields" picker trick).
 */
function toWallClockDate(epochMs: number, offsetMinutes: number): Date {
  const [datePart, timePart] = formatInOffset(epochMs, offsetMinutes).split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

/**
 * Typed date+time entry with a calendar+time popover (FR-007–FR-010).
 * `TimeRangeField` is a controlled component: `value`/`onChange` are the
 * canonical epoch-ms representation, and the displayed text/picker state are
 * derived from `value` (research.md §1–4).
 */
export function TimeRangeField({
  label,
  value,
  onChange,
  disabled,
  offsetMinutes,
}: TimeRangeFieldProps) {
  const [text, setText] = useState(
    value !== null ? formatInOffset(value, offsetMinutes) : "",
  );
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);

  const seed = value !== null ? toWallClockDate(value, offsetMinutes) : new Date();
  const [pickerDate, setPickerDate] = useState<Date | undefined>(
    value !== null ? seed : undefined,
  );
  const [pickerHour, setPickerHour] = useState(seed.getHours());
  const [pickerMinute, setPickerMinute] = useState(seed.getMinutes());

  // Re-derive the displayed text/picker state when `value` changes from
  // outside (e.g. the FR-011-FR-013 pre-fill), without clobbering in-progress
  // edits on every render (react.dev "Adjusting state when a prop changes").
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(value !== null ? formatInOffset(value, offsetMinutes) : "");
    setInvalid(false);
    const next = value !== null ? toWallClockDate(value, offsetMinutes) : new Date();
    setPickerDate(value !== null ? next : undefined);
    setPickerHour(next.getHours());
    setPickerMinute(next.getMinutes());
  }

  function commit() {
    const parsed = parseInOffset(text, offsetMinutes);
    if (parsed === null) {
      setInvalid(true);
      setText(value !== null ? formatInOffset(value, offsetMinutes) : "");
      return;
    }
    setInvalid(false);
    onChange(parsed);
  }

  /** Commits the in-progress picker selection and closes the popover (FR-006/FR-007). */
  function closeAndCommit() {
    const seedDate = value !== null ? toWallClockDate(value, offsetMinutes) : new Date();
    onChange(combineInOffset(pickerDate ?? seedDate, pickerHour, pickerMinute, offsetMinutes));
    setOpen(false);
  }

  function handlePopoverOpenChange(next: boolean) {
    if (!next) {
      if (open) {
        closeAndCommit();
      }
      return;
    }
    // Reseed the in-progress selection from the committed `value` so a
    // reopened picker starts fresh, not from a stale in-progress edit.
    const seedDate = value !== null ? toWallClockDate(value, offsetMinutes) : new Date();
    setPickerDate(value !== null ? seedDate : undefined);
    setPickerHour(seedDate.getHours());
    setPickerMinute(seedDate.getMinutes());
    setOpen(true);
  }

  function handleDaySelect(day: Date | undefined) {
    if (!day) {
      return;
    }
    setPickerDate(day);
  }

  const selectedDate = value !== null ? toWallClockDate(value, offsetMinutes) : undefined;

  return (
    <label className="flex items-center gap-1 text-xs text-muted-foreground">
      {label}
      <input
        type="text"
        aria-label={`Time range ${label.toLowerCase()}`}
        aria-invalid={invalid}
        className={`w-36 rounded border px-2 py-1 text-xs ${invalid ? "border-destructive" : ""}`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        disabled={disabled}
      />
      <Popover.Root open={open} onOpenChange={handlePopoverOpenChange}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={`Open ${label} date picker`}
            className="rounded p-1 hover:bg-accent disabled:opacity-50"
            disabled={disabled}
          >
            <Calendar size={14} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="z-50 rounded border bg-background p-2 shadow-lg">
            <DayPicker
              mode="single"
              selected={pickerDate ?? selectedDate}
              defaultMonth={pickerDate ?? selectedDate}
              onSelect={handleDaySelect}
            />
            <div className="flex items-center justify-center gap-2 px-2 pb-1 text-xs">
              <label className="flex items-center gap-1">
                Hour
                <input
                  type="number"
                  aria-label={`${label} hour`}
                  min={0}
                  max={23}
                  value={pickerHour}
                  onChange={(event) => setPickerHour(Number(event.target.value))}
                  className="w-14 rounded border px-1 py-0.5"
                />
              </label>
              <label className="flex items-center gap-1">
                Minute
                <input
                  type="number"
                  aria-label={`${label} minute`}
                  min={0}
                  max={59}
                  value={pickerMinute}
                  onChange={(event) => setPickerMinute(Number(event.target.value))}
                  className="w-14 rounded border px-1 py-0.5"
                />
              </label>
              <button
                type="button"
                aria-label={`Confirm ${label} selection`}
                className="rounded p-1 hover:bg-accent"
                onClick={closeAndCommit}
              >
                <Check size={14} />
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </label>
  );
}
