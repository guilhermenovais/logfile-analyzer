# Implementation Plan: Streamlined Log Viewer Header

**Branch**: `008-improve-log-view-header` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-improve-log-view-header/spec.md`

## Summary

The log viewer's header is currently three stacked rows above the log
content (`SearchBar`'s time-range block, `HighlightPanel`'s "Highlighted
only" checkbox + always-visible highlight list, and `LogViewer`'s "Wrap
lines" checkbox), and the time-range inputs are native
`<input type="datetime-local">` fields whose picker doesn't support
hour/minute and doesn't auto-close on WebKitGTK (research.md §1). This plan
collapses all three rows into one new `LogViewToolbar` component
(FR-001/FR-002, FR-015), moves the highlighted-lines list behind a
hidden-by-default show/hide control (FR-003–FR-006), and replaces the
time-range inputs with a custom `TimeRangeField` (typed entry + a
`react-day-picker`/`@radix-ui/react-popover` calendar+time picker that closes
on selection, FR-007–FR-010). A small backend addition —
`first_timestamp`/`last_timestamp` on `FileProperties`, derived from the
already-computed `line_timestamps` — lets the new fields pre-fill with the
file's actual time span on first load (FR-011–FR-013).

## Technical Context

**Language/Version**: TypeScript (`strict: true`) + Rust (stable, pinned via `rust-toolchain.toml`)
**Primary Dependencies**: React 19, Zustand (new `useLogViewToolbarStore`, extends `useSearchUiStore`), TanStack Query (new `useFileProperties`), existing `@radix-ui/react-*` family + NEW `@radix-ui/react-popover ^1.1.16`, NEW `react-day-picker ^10`, `lucide-react` (existing icons for the show/hide control); Rust: `chrono` (existing, no new crates) for the first/last-timestamp scan
**Storage**: N/A — no schema changes; `FileProperties` (Tauri command output) gains two additive fields derived from in-memory `FileIndex.line_timestamps`
**Testing**: Vitest + React Testing Library (new/updated component and store tests), `cargo test` (new `commands::files` case for `first_timestamp`/`last_timestamp`)
**Target Platform**: Desktop — Linux, macOS, Windows (Tauri v2 supported matrix); the WebKitGTK `datetime-local` picker bug (research.md §1) is the primary driver for the custom `TimeRangeField`
**Project Type**: Desktop app (Tauri: Rust backend + React/TS webview frontend) — this feature touches both, but the backend change is one additive field pair
**Performance Goals**: Unchanged complexity class — `first_timestamp`/`last_timestamp` are a single O(n) scan over an already-resident `Vec<Option<i64>>` (n = total lines), done once per `get_file_properties` call; no new IPC streaming, no new per-line work during indexing
**Constraints**: TS/TSX files stay ≤200 lines, Rust files ≤300 lines (Principle III). `SearchBar.tsx` is currently 228 lines (over the 200-line guideline) — removing its time-range block brings it back under; new files (`LogViewToolbar.tsx`, `TimeRangeField.tsx`, `useLogViewToolbarStore.ts`, `useFileProperties.ts`) are each sized to stay under 200 lines, splitting further if a single component would exceed it
**Scale/Scope**: ~4 new frontend files, ~6 modified frontend files, 2 modified Rust files, 1 regenerated bindings file; no new Tauri commands/capabilities, no DB migration

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Type-Safe IPC & Shared Contracts | PASS | `FileProperties` gains `first_timestamp`/`last_timestamp: Option<f64>` (additive, `specta`-exported, regenerated via the existing `export_bindings` test). No new `invoke()` calls — `useFileProperties` wraps the existing typed `getFileProperties` from `src/ipc/files.ts`. No `.unwrap()`/`any` introduced. |
| II | Security & Least Privilege | PASS (N/A) | No new Tauri commands, capabilities, or MCP tools/inputs. The new fields are derived server-side from data already computed and held in memory (`line_timestamps`); no new untrusted input parsing. |
| III | Simplicity & Minimal Footprint | PASS | Two new deps (`react-day-picker`, `@radix-ui/react-popover`) replace the literal source of the reported bugs (native `datetime-local`) and are justified by Principle V's "build complex interactive components on a headless UI library" — both are lighter alternatives to all-in-one date-picker libraries (research.md §1–3). `SearchBar.tsx` (228→~165 lines) returns under the 200-line guideline; new files are scoped to stay under it. Per-file toolbar state reuses the existing per-alias Zustand-slice pattern (`useSearchUiStore`/`useLineSelectionStore`) instead of inventing a new mechanism. |
| IV | Test-First Quality Gates | PASS | New Vitest/RTL coverage for `LogViewToolbar`, `TimeRangeField`, `useLogViewToolbarStore`, `useFileProperties`, and the `useSearchUiStore` extension; updated tests for `SearchBar`/`HighlightPanel`/`LogViewer`/`WorkspacePage`. New `cargo test` case for `first_timestamp`/`last_timestamp`. `tsc --noEmit`, `eslint .`, `cargo clippy -D warnings`, `cargo fmt --check` all must continue to pass (quickstart.md). |
| V | Accessible, Native-Feeling Desktop UI | PASS | `TimeRangeField`'s popover/calendar are built on `@radix-ui/react-popover` + `react-day-picker` (headless, accessible, keyboard-navigable) rather than from scratch. The show/hide highlights control is a `<button>` with `aria-expanded`/`aria-controls`. Existing `FeatureErrorBoundary` boundaries around `HighlightPanel`/`LogViewer`/`SearchBar` are preserved. |
| VI | Performance for Large Log Volumes | PASS (N/A) | No change to log parsing/streaming/search paths. The new backend computation is a single in-memory scan of an already-bounded `Vec<Option<i64>>`, run on the existing `get_file_properties` command (not in the indexing hot path). |

**Result**: All gates PASS. No deviations — Complexity Tracking table is empty.

## Project Structure

### Documentation (this feature)

```text
specs/008-improve-log-view-header/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── file-properties.md   # Phase 1 output — FileProperties additive fields
└── tasks.md              # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── LogViewToolbar.tsx    # NEW — combined row (FR-001/FR-002/FR-015):
│   │                          #   time range (if hasTimestampFormat),
│   │                          #   "Highlighted only" + show/hide button,
│   │                          #   "Wrap lines"
│   ├── TimeRangeField.tsx     # NEW — typed input + popover calendar/time
│   │                          #   picker for one bound (FR-007–FR-010)
│   ├── SearchBar.tsx          # MODIFIED — time-range block + helpers removed
│   ├── HighlightPanel.tsx     # MODIFIED — "Highlighted only" checkbox removed;
│   │                          #   list-only, rendered when highlightsVisible
│   └── LogViewer.tsx          # MODIFIED — `wrap` becomes a prop, local
│                               #   checkbox/state removed
├── hooks/
│   ├── useLogViewToolbarStore.ts  # NEW — per-alias {highlightedOnly,
│   │                               #   highlightsVisible, wrap} (FR-003–FR-006,
│   │                               #   FR-014)
│   ├── useSearchUiStore.ts        # MODIFIED — + timeRangeInitialized,
│   │                               #   + initializeTimeRange action
│   │                               #   (FR-011–FR-013)
│   └── useFileProperties.ts       # NEW — TanStack Query wrapper around
│                                   #   getFileProperties, refetches on
│                                   #   indexingComplete (research.md §6)
└── pages/
    └── WorkspacePage.tsx     # MODIFIED — render LogViewToolbar; gate
                               #   HighlightPanel on highlightsVisible; wire
                               #   useFileProperties -> initializeTimeRange;
                               #   pass wrap to LogViewer

src-tauri/src/
├── commands/
│   ├── types.rs           # MODIFIED — + FileProperties.first_timestamp,
│   │                       #   + FileProperties.last_timestamp (Option<f64>)
│   └── files.rs           # MODIFIED — compute first/last timestamps from
│                           #   FileIndex.line_timestamps in file_properties()
└── (no other backend modules touched — mcp/tools.rs's
    GetFilePropertiesOutput, persistence/, capabilities/ all unchanged)

src/bindings/index.ts       # REGENERATED via `cargo test export_bindings`
                             #   (FileProperties gains the two new fields)
```

No changes to `src-tauri/src/persistence/`, `src-tauri/capabilities/`,
`src-tauri/src/mcp/tools.rs`, or any Tauri command signatures beyond the
additive `FileProperties` fields.

**Structure Decision**: Frontend follows the existing
`src/{components,hooks,pages}` layout; new state (`useLogViewToolbarStore`,
`useFileProperties`) follows the established per-alias Zustand-slice /
TanStack-Query hook patterns (`useSearchUiStore`, `useLineSelectionStore`,
`useHighlights`). Backend follows 007's precedent of extending the existing
`FileProperties`/`file_properties()` (`commands/files.rs` +
`commands/types.rs`) rather than adding a new command — additive fields only,
no new IPC surface.

## Complexity Tracking

*No Constitution Check violations - table intentionally empty.*
