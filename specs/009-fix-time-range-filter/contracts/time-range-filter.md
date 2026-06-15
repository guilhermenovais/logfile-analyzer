# Contract: Time Range Filter (search/search_with_context + TimeRangeField)

This feature changes no Tauri command signatures. This contract documents the
**behavioral** guarantees being fixed/established, for the two IPC commands
and the `TimeRangeField` UI component.

## 1. `search` / `search_with_context` time-filter semantics (FR-001–FR-003)

`src-tauri/src/commands/search.rs`, signatures unchanged:

```rust
fn search(
    state: State<'_, Arc<AppState>>,
    alias: String,
    query: String,
    search_type: SearchType,
    time_from: Option<f64>,  // epoch-ms, inclusive lower bound
    time_to: Option<f64>,    // epoch-ms, inclusive upper bound
    channel: Channel<SearchMatchBatch>,
) -> Result<()>;

fn search_with_context(
    state: State<'_, Arc<AppState>>,
    alias: String,
    query: String,
    search_type: SearchType,
    surrounding_count: Option<u32>,
    time_from: Option<f64>,
    time_to: Option<f64>,
    channel: Channel<SearchWithContextBatch>,
) -> Result<()>;
```

**Guarantees** (re-affirmed by the new end-to-end test, research.md §1):

| Inputs | Result |
|--------|--------|
| `time_from = Some(a)`, `time_to = Some(b)` | Only matches on lines with a parsed timestamp `t` where `a <= t <= b` (FR-001). |
| `time_from = Some(a)`, `time_to = None` | Only matches with `t >= a` (FR-002). |
| `time_from = None`, `time_to = Some(b)` | Only matches with `t <= b` (FR-002). |
| `time_from = None`, `time_to = None` | No time filtering — identical to a search with no time range at all. |
| `time_from`/`time_to` set to the file's actual `first_timestamp`/`last_timestamp` (from `get_file_properties`) | Identical match set to `time_from = None, time_to = None` (FR-003) — the default span excludes nothing that has a parsed timestamp. |
| `time_from`/`time_to` set such that no line's timestamp satisfies both bounds (e.g. `from > to`, or a window with no data) | Zero matches (Acceptance Scenario 4 / Edge Cases) — **not** an error, and **not** the full unfiltered set. |
| Either bound set, but the file has no detected timestamp format (`timestamp_profile.is_none()`) | `Err(AppError::TimeRangeUnavailable)` (unchanged from before this feature). |

This table is the assertion target for the new `search_test.rs` end-to-end
case (research.md §1) and is unchanged for `search_with_context`/the MCP tool
(`mcp_tools_test.rs` already covers this path and is out of scope).

## 2. `TimeRangeField` picker contract (FR-004–FR-008)

`src/components/TimeRangeField.tsx`, props unchanged:

```ts
interface TimeRangeFieldProps {
  label: "From" | "To";
  value: number | null;       // committed value, epoch-ms
  onChange: (value: number | null) => void;  // called only on commit
  disabled?: boolean;
}
```

**Guarantees**:

- While the popover is open, selecting a calendar day, or changing the hour
  or minute input, updates only the popover's own display (selected day,
  hour/minute input values) — `onChange` is **not** called and the popover
  does **not** close (FR-004/FR-005).
- The popover footer has a confirm control (`<button aria-label="Confirm
  {label} selection">`, a `Check` icon). Activating it: calls `onChange` with
  the combined date+hour+minute as epoch-ms, then closes the popover
  (FR-006).
- Interacting outside the popover (any Radix `onOpenChange(false)` while it
  was open) has the **same effect** as the confirm control: commit then close
  (FR-007).
- After either commit path, the field's displayed text reflects the new
  `value` (via the existing value→text re-derivation), and the next call to
  `onChange` is the source of truth for `timeFrom`/`timeTo` used by `search`
  (FR-008).
- If the popover is opened and closed (by either path) with no day/hour/
  minute change, `onChange` is called with a value equal to the current
  `value` (Acceptance Scenario 5) — callers must treat this as a no-op
  (`setTimeRange` with the same values is idempotent).
- Typed-text entry (existing `commit` on blur/Enter, FR-007 from 008) is
  unchanged by this feature.

## 3. "Clear" contract (FR-009/FR-010)

`src/components/LogViewToolbar.tsx`'s "Clear" button:

| `useFileProperties(alias)` state | Clear behavior |
|-----------------------------------|-----------------|
| `first_timestamp = Some(a)`, `last_timestamp = Some(b)` | `setTimeRange(alias, a, b)` — fields show the file's first/last line timestamps (FR-009). |
| `first_timestamp = None` and/or `last_timestamp = None` (no detected format, or no line with a parseable timestamp, or indexing incomplete) | `setTimeRange(alias, null, null)` — fields are emptied (FR-010, Edge Cases bullet 1). |

Clear is only rendered when `timeFrom !== null || timeTo !== null` (unchanged
from 008) — i.e., it's not shown when the fields are already empty with no
known span.
