import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Calendar } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

export interface TimeRangeFieldProps {
  /** "From" or "To" — used for the visible label and aria-label. */
  label: "From" | "To";
  /** Current committed value (epoch-ms), or `null` if unset. */
  value: number | null;
  /** Called with the new committed value (epoch-ms), or `null` to clear. */
  onChange: (value: number | null) => void;
  disabled?: boolean;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/** Formats epoch-ms as `YYYY-MM-DD HH:mm` in local time (research.md §4). */
export function formatLocal(epochMs: number): string {
  const date = new Date(epochMs);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const LOCAL_FORMAT = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

/** Parses a `YYYY-MM-DD HH:mm` string to epoch-ms, or `null` if invalid (research.md §4). */
export function parseLocal(text: string): number | null {
  const match = LOCAL_FORMAT.exec(text.trim());
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute] = match.map(Number) as unknown as [
    string,
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(year, month - 1, day, hour, minute);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }
  return date.getTime();
}

/**
 * Combines `date`'s year/month/day with `hour`/`minute`, returning epoch-ms.
 */
function combine(date: Date, hour: number, minute: number): number {
  const combined = new Date(date);
  combined.setHours(hour, minute, 0, 0);
  return combined.getTime();
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
}: TimeRangeFieldProps) {
  const [text, setText] = useState(value !== null ? formatLocal(value) : "");
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);

  const seed = value !== null ? new Date(value) : new Date();
  const [pickerHour, setPickerHour] = useState(seed.getHours());
  const [pickerMinute, setPickerMinute] = useState(seed.getMinutes());

  // Re-derive the displayed text/picker state when `value` changes from
  // outside (e.g. the FR-011-FR-013 pre-fill), without clobbering in-progress
  // edits on every render (react.dev "Adjusting state when a prop changes").
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(value !== null ? formatLocal(value) : "");
    setInvalid(false);
    const next = value !== null ? new Date(value) : new Date();
    setPickerHour(next.getHours());
    setPickerMinute(next.getMinutes());
  }

  function commit() {
    const parsed = parseLocal(text);
    if (parsed === null) {
      setInvalid(true);
      setText(value !== null ? formatLocal(value) : "");
      return;
    }
    setInvalid(false);
    onChange(parsed);
  }

  function handleDaySelect(day: Date | undefined) {
    if (!day) {
      return;
    }
    onChange(combine(day, pickerHour, pickerMinute));
    setOpen(false);
  }

  function handleHourChange(hour: number) {
    setPickerHour(hour);
    onChange(combine(value !== null ? new Date(value) : new Date(), hour, pickerMinute));
    setOpen(false);
  }

  function handleMinuteChange(minute: number) {
    setPickerMinute(minute);
    onChange(combine(value !== null ? new Date(value) : new Date(), pickerHour, minute));
    setOpen(false);
  }

  const selectedDate = value !== null ? new Date(value) : undefined;

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
      <Popover.Root open={open} onOpenChange={setOpen}>
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
              selected={selectedDate}
              defaultMonth={selectedDate}
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
                  onChange={(event) => handleHourChange(Number(event.target.value))}
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
                  onChange={(event) => handleMinuteChange(Number(event.target.value))}
                  className="w-14 rounded border px-1 py-0.5"
                />
              </label>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </label>
  );
}
