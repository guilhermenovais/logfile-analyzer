# Contract: File Properties Availability & Timezone (US2/US3, FR-006–FR-009)

## 1. `get_file_properties` / `FileProperties` (MODIFIED)

```rust
pub struct FileProperties {
    pub total_lines: u32,
    pub has_timestamp_format: bool,
    pub available: bool,
    pub indexing_complete: bool,        // REDEFINED
    pub first_timestamp: Option<f64>,
    pub last_timestamp: Option<f64>,
    pub timestamp_offset_minutes: i32,  // NEW
}
```

**`indexing_complete` redefinition**:

| Before 010 | After 010 |
|---|---|
| `index.state == IndexState::Ready` | `index.state == IndexState::Ready && index.timestamp_detection_complete` |

`useFileProperties`'s `filePropertiesRefetchInterval` keeps polling
(`1000`ms) while `indexing_complete === false`, and stops once `true`. With
the redefinition, polling continues until timestamp detection has concluded
— at which point `has_timestamp_format`, `first_timestamp`/`last_timestamp`,
and `timestamp_offset_minutes` are all in their **final** state for this file
(no further changes will occur without removing/re-adding the file). This is
the fix for the US2 race (research.md §2.2): a poll can no longer observe
`indexing_complete: true` together with stale/default `has_timestamp_format:
false` / `first_timestamp: null`.

**`timestamp_offset_minutes` semantics (FR-008)**:

| `has_timestamp_format` | `timestamp_offset_minutes` |
|---|---|
| `false` | `0` (not meaningful — FR-008's "no timezone behavior applies" — not read by the frontend in this case) |
| `true`, detected format is `Iso8601` and a sampled line has an explicit UTC offset | that offset, in minutes (e.g. `+02:00` → `120`, `-05:00` → `-300`) |
| `true`, otherwise (no explicit offset found, or format is `EpochSeconds`/`EpochMillis`/`SpaceSeparated`) | `0` (UTC) |

**Guarantee table** (`get_file_properties` for a loaded file, by detection
state):

| State | `indexing_complete` | `has_timestamp_format` | `first_timestamp`/`last_timestamp` | `timestamp_offset_minutes` |
|---|---|---|---|---|
| Line-offset indexing in progress | `false` | `false` | `None`/`None` | `0` |
| Line-offset indexing done, timestamp detection in progress | `false` | `false` | `None`/`None` | `0` |
| Both done, no format detected | `true` | `false` | `None`/`None` | `0` |
| Both done, format detected | `true` | `true` | `Some(_)`/`Some(_)` | per table above |

A poller that stops as soon as `indexing_complete === true` always lands in
one of the last two rows — never an intermediate state with mismatched
fields.

## 2. `WorkspacePage.hasTimestampFormat` data source (FR-006)

| Before 010 | After 010 |
|---|---|
| `useActiveWorkspace().data?.files.find(f => f.alias === selectedAlias)?.has_timestamp_format ?? false` — **one-shot** query, never refetched after initial load | `useFileProperties(selectedAlias).data?.has_timestamp_format ?? false` — same polling query (§1) already used for `first_timestamp`/`last_timestamp` |

**Guarantee**: for a file whose timestamp detection completes *after* it has
already been selected (US2 Acceptance Scenario 1), `hasTimestampFormat`
transitions `false` → `true` within one poll interval (≤1000ms) of detection
completing, without requiring `WorkspacePage` (or the app) to remount —
re-rendering `SearchBar`, `LogViewToolbar`, and `LogViewer` with
`hasTimestampFormat = true`, which in turn shows the `TimeRangeField`s
pre-filled via the existing `initializeTimeRange` effect (FR-007, unchanged
from 009).

For a file without a detectable timestamp format (US2 Acceptance Scenario 3),
`has_timestamp_format` stays `false` permanently once `indexing_complete`
becomes `true` — `hasTimestampFormat` stays `false`, time range fields remain
hidden, unchanged from current behavior.

## 3. `timeRange.ts` offset-aware functions (MODIFIED — FR-008/FR-009)

```ts
export function formatInOffset(epochMs: number, offsetMinutes: number): string;
export function parseInOffset(text: string, offsetMinutes: number): number | null;
export function combineInOffset(date: Date, hour: number, minute: number, offsetMinutes: number): number;
```

Replaces `formatLocal`/`parseLocal`/`combine` (009). `pad` is unchanged.

**Guarantees**:

| Function | Contract |
|---|---|
| `formatInOffset(epochMs, offsetMinutes)` | Returns `YYYY-MM-DD HH:mm` representing the wall-clock time at `epochMs` in the timezone `UTC+offsetMinutes`. For `offsetMinutes = 0`, this is the **UTC** wall-clock time (NOT the browser's local time — this is the FR-008 Scenario 2 behavior change from 009's `formatLocal`, which used browser-local). |
| `parseInOffset(text, offsetMinutes)` | Inverse of `formatInOffset`: parses `YYYY-MM-DD HH:mm` as a wall-clock time in `UTC+offsetMinutes`, returns the corresponding epoch-ms, or `null` if `text` doesn't match the format or fails the Y/M/D/H/M round-trip validation (same validation shape as 009's `parseLocal`). |
| `combineInOffset(date, hour, minute, offsetMinutes)` | Given a `Date` whose **local** Y/M/D fields represent a wall-clock date in `UTC+offsetMinutes` (i.e. produced by the picker seeding below), combines with `hour`/`minute` and returns the corresponding epoch-ms via the same `UTC+offsetMinutes` interpretation. |

**Round-trip property** (replaces 009's "local round trip"): for any
`epochMs` and `offsetMinutes`, `parseInOffset(formatInOffset(epochMs,
offsetMinutes), offsetMinutes) === epochMs` (to minute precision).

## 4. `TimeRangeField` (MODIFIED — FR-008/FR-009)

```ts
export interface TimeRangeFieldProps {
  label: "From" | "To";
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  offsetMinutes: number;  // NEW, required
}
```

**Guarantees** (in addition to the unchanged picker/commit contract from
009's `contracts/time-range-filter.md` §2 — popover open/close, confirm
button, blur/Enter commit, idempotent re-commit):

- The displayed text (`formatInOffset(value, offsetMinutes)`) and the picker's
  calendar day / hour / minute — which render via `Date`'s **local**
  getters — both show the wall-clock value of `value` in `UTC+offsetMinutes`,
  regardless of the browser's actual timezone. This is achieved by seeding
  `pickerDate` via `new Date(year, month, day, hour, minute)` using the Y/M/D/H/M
  read from `formatInOffset`'s UTC-getter computation (research.md §3.3) —
  i.e. the picker is a pure "wall-clock fields" widget, not tied to either
  the browser's or the file's actual timezone offset internally.
- A value typed or picked equal to a specific log line's displayed timestamp
  (which `LogLine` shows verbatim from the file, in the file's own offset)
  commits to the epoch-ms that line's `effective_timestamps` entry equals —
  i.e. that line is included at the boundary (US3 Independent Test, FR-009).

## 5. `LogViewToolbar` (MODIFIED — FR-008)

Passes `offsetMinutes={fileProperties?.timestamp_offset_minutes ?? 0}` (from
its existing `useFileProperties(alias)` call) to both `TimeRangeField`
instances ("From" and "To"). The "Clear" button's behavior (009's
`contracts/time-range-filter.md` §3 — `setTimeRange(alias, first_timestamp,
last_timestamp)` or `setTimeRange(alias, null, null)`) is unchanged: it
operates on epoch-ms values, which are offset-independent.
