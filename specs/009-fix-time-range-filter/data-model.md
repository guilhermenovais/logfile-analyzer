# Phase 1 Data Model: Time Range Filter Fixes

No SQLite schema changes, no IPC type changes. This feature corrects the
*behavior* of existing entities (data-model.md from 005/007/008) rather than
adding new ones. The three entities named in `spec.md`'s "Key Entities"
section map onto existing structures as follows.

---

## Time Range Filter → `SearchUiState.timeFrom` / `timeTo` (UNCHANGED shape)

`src/hooks/useSearchUiStore.ts` — already holds `timeFrom: number | null` and
`timeTo: number | null` (epoch-ms) per file alias, set via `setTimeRange` and
read by `SearchBar`/`LogViewToolbar`. **No shape change.** This feature
changes:
- *who calls* `setTimeRange` and with what values (US2's `closeAndCommit`,
  US3's Clear), and
- *what effect* a non-null `timeFrom`/`timeTo` has once passed to the `search`
  IPC command (US1 — backend fix, scope TBD per research.md §1).

## File Time Span → `FileProperties.first_timestamp` / `last_timestamp` (UNCHANGED shape, reused)

`src-tauri/src/commands/types.rs` / `src/bindings/index.ts` (added in 008) —
`first_timestamp: number | null`, `last_timestamp: number | null` (epoch-ms).
Already consumed by `WorkspacePage` for the FR-011 (008) pre-fill via
`useFileProperties`. **No shape change.** This feature adds a second consumer:
`LogViewToolbar`'s "Clear" button (US3, research.md §3).

## Picker In-Progress Selection → `TimeRangeField` local component state (NEW fields)

Entirely internal to `src/components/TimeRangeField.tsx`; never leaves the
component (not in any store, not sent over IPC).

| Field | Type | Initial value | Set by | Read by |
|-------|------|----------------|--------|---------|
| `pickerDate` | `Date \| undefined` | seeded from `value` (or `new Date()` if `value === null`) when the popover opens | `handleDaySelect` (FR-004) | `closeAndCommit` (combined with `pickerHour`/`pickerMinute`); `DayPicker`'s `selected`/`defaultMonth` |
| `pickerHour` | `number` (0–23) | seeded from `value` (or current hour) when the popover opens | hour `<input type="number">` `onChange` (FR-005) | `closeAndCommit`; hour input's `value` |
| `pickerMinute` | `number` (0–59) | seeded from `value` (or current minute) when the popover opens | minute `<input type="number">` `onChange` (FR-005) | `closeAndCommit`; minute input's `value` |
| `open` | `boolean` (existing) | `false` | `Popover.Root`'s `onOpenChange` (FR-006/FR-007) | `Popover.Root`'s `open` |

**Lifecycle** (FR-004–FR-008):
1. User opens the popover (`open: false → true`): `pickerDate`/`pickerHour`/
   `pickerMinute` are (re-)seeded from `value`.
2. User selects a day and/or changes hour/minute any number of times, in any
   order: only `pickerDate`/`pickerHour`/`pickerMinute` change; `open` stays
   `true`; `value` is untouched.
3. User activates the confirm button, or interacts outside the popover
   (`open: true → false`, via `closeAndCommit`): `onChange(combine(pickerDate,
   pickerHour, pickerMinute))` is called once, then `open` becomes `false`.
   The parent's `value` prop updates, and the existing "re-derive `text` from
   `value`" effect (`TimeRangeField.tsx`'s `prevValue` check) updates the
   displayed text (FR-008).

No other state transitions exist — there is no "discard"/"cancel" affordance
(spec Assumptions: outside-interaction == confirm, never a revert).

---

## Helper module: `src/lib/timeRange.ts` (NEW — pure functions, no state)

Extracted from `TimeRangeField.tsx` (research.md §4), unchanged behavior:

| Export | Signature | Used by |
|--------|-----------|---------|
| `formatLocal` | `(epochMs: number) => string` (`"YYYY-MM-DD HH:mm"`, local time) | `TimeRangeField` (display), tests |
| `parseLocal` | `(text: string) => number \| null` | `TimeRangeField` (`commit`), tests |
| `combine` | `(date: Date, hour: number, minute: number) => number` | `TimeRangeField` (`closeAndCommit`, `handleDaySelect`'s seed) |
| `pad` | `(value: number) => string` | `formatLocal` only (internal helper, exported for reuse if needed) |
