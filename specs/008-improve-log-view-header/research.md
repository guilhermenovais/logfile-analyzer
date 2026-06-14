# Phase 0 Research: Streamlined Log Viewer Header

## 1. Cross-platform date+time input (FR-007–FR-009)

- **Decision**: Replace the current `<input type="datetime-local">` fields in
  `SearchBar` with a custom `TimeRangeField` component: a free-text
  `<input type="text">` for typed entry (FR-007), plus a button that opens a
  `@radix-ui/react-popover` containing a `react-day-picker` calendar and
  hour/minute number inputs (FR-008). Choosing a day (once hour/minute have
  values) or changing the time closes the popover programmatically (FR-009).
- **Rationale**: the reported bugs (no typing, no hour/minute, picker doesn't
  close) are exactly the native `datetime-local` picker's behavior on
  WebKitGTK (this project's Linux dev/target webview per the Tauri v2
  supported matrix), and differ again on WebView2/WKWebView. There is no
  single native baseline that satisfies FR-007–FR-009 across all three. A
  custom popover gives one consistent, testable implementation everywhere.
- **Alternatives considered**:
  - Keep `datetime-local` and "fix" it with JS — the native picker UI can't be
    overridden or forced to close.
  - Split into `<input type="date">` + `<input type="time">` — the date
    input's native calendar has the same "doesn't auto-close" problem on
    WebKitGTK; doesn't fully resolve FR-009.
  - Third-party all-in-one date-time pickers (`react-datepicker`, MUI X Date
    Pickers) — heavier, bring their own styling/theming systems that fight
    Tailwind + the existing Radix/shadcn-style components (Principle III).

## 2. Calendar primitive

- **Decision**: `react-day-picker` (current major: `^10.0.1`) for the calendar
  grid inside the popover.
- **Rationale**: v10 has no required peer dependency beyond `react`/
  `react-dom` (no forced `date-fns`), ~9 kB gzipped, accessible
  (ARIA grid + keyboard navigation built in), MIT-licensed. Matches Principle
  III ("prefer the lighter dependency for equivalent functionality... check
  bundlephobia before adding one") and Principle V ("build... complex
  interactive components on a headless UI library" — a calendar grid with
  correct month/locale/keyboard handling is exactly that kind of component).
- **Alternatives considered**: hand-rolled calendar grid — weeks of edge
  cases (month lengths, locale, keyboard nav, a11y) for one feature, rejected
  as disproportionate; Radix has no calendar primitive of its own.

## 3. Popover / positioning

- **Decision**: `@radix-ui/react-popover` `^1.1.16` — the same version line as
  the already-installed `@radix-ui/react-dialog ^1.1.16` — for the picker's
  trigger/content, focus handling, and outside-click/Escape dismissal.
- **Rationale**: keeps every "complex interactive component" (Dialog,
  DropdownMenu, Tabs, now Popover) on the same Radix family already in
  `package.json`, sharing the same `@radix-ui/react-*` core primitives and
  matching the version already pinned for Dialog.
- **Alternatives considered**: a hand-rolled positioned `<div>` with a
  click-outside listener — re-implements focus trapping/Escape handling Radix
  already provides for the other dialogs/menus, against Principle V's
  "headless UI library" requirement.

## 4. Typed value parsing/formatting (FR-007, FR-010)

- **Decision**: keep epoch-ms as the canonical value (unchanged from today).
  `TimeRangeField` renders/parses a single `YYYY-MM-DD HH:mm` text value using
  small local helpers (zero-padding via template literals/`Intl`, parsing via
  `new Date(year, monthIndex, day, hour, minute)` after splitting on the fixed
  separators) — a direct extension of the existing
  `toDatetimeLocalValue`/`fromDatetimeLocalValue` helpers, just with a space
  instead of `T` and minute (not second) precision. If the typed text doesn't
  match the expected shape or produces an invalid `Date`, the field is marked
  invalid (red outline + `aria-invalid="true"`) and `onChange` is **not**
  called, so the last committed `timeFrom`/`timeTo` remains in effect (FR-010).
- **Rationale**: avoids adding a date-formatting/parsing library (`date-fns`,
  `dayjs`, `luxon`) for a single fixed display format; the project already has
  equivalent ad-hoc epoch↔local-string helpers in `SearchBar.tsx`.
- **Alternatives considered**: `date-fns`/`dayjs` — unnecessary dependency for
  one fixed format string.

## 5. File time span — backend (FR-011/FR-012)

- **Decision**: add `first_timestamp: Option<f64>` and
  `last_timestamp: Option<f64>` (epoch-ms, UTC) to `FileProperties`
  (`src-tauri/src/commands/types.rs`), computed in
  `commands::files::file_properties` from the existing
  `FileIndex.line_timestamps: Option<Vec<Option<i64>>>` (already populated by
  `timestamp::detect_and_parse` once indexing finishes): the first and last
  `Some` entries, in line order. `f64` (not `i64`) follows the existing
  `SearchHistoryEntry.time_from`/`time_to` convention — `specta`/
  `tauri-specta` forbid exporting 64-bit integers, and epoch-ms values are
  always well within `f64`'s 53-bit exact-integer range.
- **Rationale**: `line_timestamps` already holds exactly the data needed, in
  memory, with no extra file scan; `FileProperties`/`get_file_properties` is
  the existing per-file properties endpoint (FR-027) and additive fields don't
  change its meaning for existing consumers (the MCP `get_file_properties`
  tool builds its own `GetFilePropertiesOutput` field-by-field and is
  unaffected unless explicitly extended — not required by this feature's FRs).
- **Alternatives considered**: a new dedicated command — rejected, this is
  exactly the kind of per-file derived property `FileProperties` already
  exists to carry.

## 6. Frontend pre-fill timing (Edge Case: file still indexing)

- **Decision**: new `useFileProperties(alias)` hook (TanStack Query) wraps
  `getFileProperties`. `WorkspacePage` already tracks `indexingComplete` via
  `useLogStream`; when it flips to `true`, `useFileProperties` is invalidated/
  refetched so `first_timestamp`/`last_timestamp` (initially `null` while
  `line_timestamps` is still being computed) become available without manual
  polling. `useSearchUiStore`'s per-alias slice gains
  `timeRangeInitialized: boolean` (default `false`). A `WorkspacePage` effect
  calls a new `initializeTimeRange(alias, first, last)` action once
  `first_timestamp`/`last_timestamp` are non-null **and**
  `timeRangeInitialized === false`; it sets `timeFrom`/`timeTo` and flips
  `timeRangeInitialized` to `true`. The existing user-driven `setTimeRange`
  action (typing, picker selection, "Clear") also flips
  `timeRangeInitialized` to `true`, so a manual edit made before indexing
  finishes is never overwritten by a later pre-fill.
- **Rationale**: gives exactly the "pre-fill once, unless the user already
  acted" semantics FR-011–FR-013 ask for, and because the slice is per-alias
  (default `timeRangeInitialized: false` for any alias not yet seen) it
  naturally satisfies "switching files doesn't show stale pre-filled values".
- **Alternatives considered**: prefilling inside `useLogStream`/`LogViewer` —
  wrong layer; time range is search-bar/toolbar state (`useSearchUiStore`),
  not log-viewing state.

## 7. Per-file toolbar visibility state (FR-003–FR-006, FR-014)

- **Decision**: new Zustand store `useLogViewToolbarStore`, mirroring the
  per-alias slice pattern already used by `useSearchUiStore`/
  `useLineSelectionStore`: `{ highlightedOnly: boolean; highlightsVisible:
  boolean; wrap: boolean }`, all defaulting to `false` for any alias not yet
  seen. `WorkspacePage`'s current local `highlightedOnly` `useState` and
  `LogViewer`'s local `wrap` `useState` are both removed in favor of this
  store.
- **Rationale**: "Highlighted only", the highlighted-lines-list visibility,
  and "Wrap lines" are all view-only, per-file toggles with identical
  reset-on-switch semantics (US2 Scenario 5); one small store following an
  established pattern is simpler than three different mechanisms (Principle
  III).
- **Alternatives considered**: folding this into `useSearchUiStore` —
  rejected; that store is scoped to search query/results/time-range state
  (data-model.md from 004/005) and this state isn't search-related.

## 8. Combined-row layout (FR-001/FR-002/FR-015)

- **Decision**: `flex flex-wrap items-center gap-2` on the new toolbar
  container — no new layout tooling.
- **Rationale**: identical to the wrapping pattern already used by
  `SearchBar`'s rows; `flex-wrap` alone satisfies FR-015 ("controls wrap to
  additional rows... remaining grouped and usable").
- **Alternatives considered**: CSS grid with explicit breakpoints — more
  complex than needed for a handful of inline controls.
