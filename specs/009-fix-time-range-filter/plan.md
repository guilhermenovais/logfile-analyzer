# Implementation Plan: Time Range Filter Fixes

**Branch**: `009-fix-time-range-filter` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-fix-time-range-filter/spec.md`

## Summary

The time-range filter introduced by 008 has three independent defects that
this plan fixes in place (no new IPC commands, no schema changes):

1. **US1 (P1)** — on the desktop `search`/`search_with_context` commands, a
   non-empty `[time_from, time_to]` currently has no effect on results. The
   isolated filter logic (`logfile::query::filter_by_time_range`) and its
   unit tests are correct, and the frontend wiring (`LogViewToolbar` →
   `useSearchUiStore` → `SearchBar` → `useSearch` → `search` IPC) is also
   individually correct per existing tests — but no test exercises the full
   "real `add_file` background detection → toolbar-set time range → `search`"
   pipeline end-to-end. Phase 0 closes that gap with new end-to-end tests on
   both sides to localize and fix the actual break.
2. **US2 (P2)** — `TimeRangeField`'s popover (`src/components/
   TimeRangeField.tsx`) currently calls `onChange` and closes immediately on
   every day/hour/minute change (008's `research.md §1`, "closes the popover
   programmatically"). This plan changes the popover to an in-progress
   selection that's only committed (via `onChange`) when the user activates a
   new explicit confirm control or interacts outside the popover (Radix
   `onOpenChange`).
3. **US3 (P3)** — `LogViewToolbar`'s "Clear" button currently calls
   `setTimeRange(alias, null, null)`. This plan changes it to reuse the
   file's time span (already fetched via `useFileProperties` for the FR-011
   pre-fill) and call `setTimeRange(alias, firstTimestamp, lastTimestamp)`.

## Technical Context

**Language/Version**: TypeScript (`strict: true`) + Rust (stable, pinned via `rust-toolchain.toml`)
**Primary Dependencies**: React 19, Zustand (`useSearchUiStore` — existing `setTimeRange`/`initializeTimeRange`, reused as-is), TanStack Query (`useFileProperties` — existing, reused for the Clear target), existing `@radix-ui/react-popover` + `react-day-picker` + `lucide-react` (new `Check` icon for the picker's confirm control). No new dependencies.
**Storage**: N/A — no schema changes, no new persisted fields.
**Testing**: Vitest + React Testing Library (new `TimeRangeField`/`LogViewToolbar` cases, plus a new end-to-end-ish test wiring `LogViewToolbar`+`SearchBar` against a real `useSearchUiStore` with mocked `@tauri-apps/api/core` `invoke`), `cargo test` (new end-to-end `search_test.rs` case going through real `add_file` indexing rather than a hand-built `FileIndex`).
**Target Platform**: Desktop — Linux, macOS, Windows (Tauri v2 supported matrix). US1 is explicitly scoped to "the desktop interface" (the MCP `search_with_context` tool already exercises `filter_by_time_range` via `mcp_tools_test.rs` and is not in scope).
**Project Type**: Desktop app (Tauri: Rust backend + React/TS webview frontend) — this feature touches both.
**Performance Goals**: Unchanged complexity class — no new per-line work, no new IPC streaming; the US1 fix is corrective (existing filter pass), not a new pass.
**Constraints**: TS/TSX files stay ≤200 lines, Rust files ≤300 lines (Principle III). `TimeRangeField.tsx` is currently exactly 200 lines; US2's confirm/commit logic would push it over, so its pure `pad`/`formatLocal`/`parseLocal`/`combine` helpers move to a new `src/lib/timeRange.ts` (also lets `TimeRangeField.test.tsx` and a future `LogViewToolbar` Clear test import `formatLocal` without reaching into `TimeRangeField.tsx`'s internals).
**Scale/Scope**: 1 new frontend module (`src/lib/timeRange.ts`), 2 modified frontend components (`TimeRangeField.tsx`, `LogViewToolbar.tsx`), 1 likely-modified backend file (`src-tauri/src/commands/search.rs`, exact change pending Phase 0's reproduction test), 1 new backend integration test, several updated test files. No new Tauri commands/capabilities, no bindings regeneration expected.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Type-Safe IPC & Shared Contracts | PASS | No new/changed Tauri command signatures — `search`/`search_with_context` keep `time_from`/`time_to: Option<f64>` and `Result<(), AppError>`. Any US1 fix is internal to `commands::search`/`state`, still returning `Result<T, AppError>`, no `.unwrap()`/`any` introduced. |
| II | Security & Least Privilege | PASS (N/A) | No new commands, capabilities, or MCP tools/inputs. No new untrusted-input parsing — `time_from`/`time_to` were already validated `Option<f64>` IPC args. |
| III | Simplicity & Minimal Footprint | PASS | No new dependencies (reuses existing Radix Popover, react-day-picker, lucide-react, `useFileProperties`, `setTimeRange`). `TimeRangeField.tsx`'s pure formatting/parsing helpers move to `src/lib/timeRange.ts` to keep both files under the 200-line guideline (research.md §4). US3 reuses the existing `setTimeRange` action — no new store action needed. |
| IV | Test-First Quality Gates | PASS | Each user story gets new failing tests before its fix: a Rust end-to-end `search_test.rs` case (real `add_file` → indexing → `search`, US1), `TimeRangeField`/`LogViewToolbar` Vitest cases for the confirm/click-outside commit model (US2) and the Clear-to-span behavior (US3). `tsc --noEmit`, `eslint .`, `cargo clippy -D warnings`, `cargo fmt --check`, the Vitest suite, and `cargo test` all continue to gate completion (quickstart.md). |
| V | Accessible, Native-Feeling Desktop UI | PASS | The picker's new confirm control is a `<button>` with an `aria-label` (e.g. `"Confirm {label} selection"`), keyboard-reachable like the existing hour/minute `<input>`s. Outside-dismiss continues to use Radix Popover's built-in `onOpenChange`/`onInteractOutside` (no hand-rolled click-outside listener), per Principle V's "headless UI library" requirement (008 precedent). |
| VI | Performance for Large Log Volumes | PASS (N/A) | No change to parsing/streaming/search complexity — US1's fix corrects an existing single-pass filter, it doesn't add one. |

**Result**: All gates PASS. No deviations — Complexity Tracking table is empty.

## Project Structure

### Documentation (this feature)

```text
specs/009-fix-time-range-filter/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── time-range-filter.md   # Phase 1 output — search/search_with_context
│                                #   time-filter contract (FR-001–003) +
│                                #   TimeRangeField picker/Clear contract
│                                #   (FR-004–010)
└── tasks.md              # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
src/
├── lib/
│   └── timeRange.ts        # NEW — pure helpers extracted from
│                            #   TimeRangeField.tsx: pad, formatLocal,
│                            #   parseLocal, combine (research.md §4)
├── components/
│   ├── TimeRangeField.tsx   # MODIFIED — popover becomes an in-progress
│   │                        #   selection (pickerDate/pickerHour/
│   │                        #   pickerMinute), committed via a new confirm
│   │                        #   button or Radix onOpenChange(false)
│   │                        #   (FR-004–FR-008, US2)
│   ├── TimeRangeField.test.tsx   # MODIFIED — replaces "closes on
│   │                              #   selection/hour/minute change" cases
│   │                              #   with "stays open; confirm/outside-click
│   │                              #   commits"
│   ├── LogViewToolbar.tsx   # MODIFIED — "Clear" resets to
│   │                        #   useFileProperties' first/last timestamp
│   │                        #   instead of null/null (FR-009/FR-010, US3)
│   └── LogViewToolbar.test.tsx   # MODIFIED — Clear test asserts reset to
│                                  #   the file's span, not null
└── (US1 frontend coverage — new test, file TBD by research.md §1: either a
    new src/components/*.test.tsx wiring LogViewToolbar+SearchBar, or an
    addition to WorkspacePage.test.tsx)

src-tauri/
├── src/commands/search.rs   # LIKELY MODIFIED — exact change depends on
│                             #   Phase 0's reproduction test (US1)
└── tests/search_test.rs     # MODIFIED — new end-to-end case: real
                              #   add_file + wait-for-indexing + search with
                              #   a narrow time range (US1)
```

No changes to `src-tauri/src/persistence/`, `src-tauri/capabilities/`,
`src-tauri/src/mcp/`, `src/bindings/index.ts`, or any Tauri command
signatures.

**Structure Decision**: Frontend follows the existing
`src/{components,hooks,lib,pages}` layout — `src/lib/timeRange.ts` is a new
pure-function module alongside any existing `src/lib/*` utilities, used only
by `TimeRangeField.tsx` and its test. Backend follows the existing
`commands::search` + `tests/search_test.rs` structure; no new modules.

## Complexity Tracking

*No Constitution Check violations - table intentionally empty.*
