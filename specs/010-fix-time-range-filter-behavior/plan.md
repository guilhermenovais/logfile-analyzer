# Implementation Plan: Time Range Filter Behavior Fixes

**Branch**: `010-fix-time-range-filter-behavior` | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-fix-time-range-filter-behavior/spec.md`

## Summary

009 made the time range filter *take effect on search results* and fixed its
picker/Clear UX, but left three gaps this plan closes:

1. **US1 (P1)** — the main log view never consults `timeFrom`/`timeTo` at
   all. Fix: a new `set_view_time_range` command computes and caches, per
   open file, the ordered list of file line indices currently "in range"
   (`runtime.view_filter: Option<Vec<u32>>`, `None` = unfiltered identity).
   `stream_lines`/`LineBatch` are reinterpreted to address this filtered
   **view-row** space while still reporting each row's true file
   `line_index` (so highlight/selection/search-match state, which the spec
   requires to stay keyed by file line index, continues to work).
   FR-004's "inherit nearest preceding timestamp" is implemented once, via a
   new precomputed `effective_timestamps` vector, and reused by `search`/
   `search_with_context`/the MCP `search_with_context` tool so all four
   consumers of `filter_by_time_range` agree (FR-010).
2. **US2 (P2)** — two independent staleness bugs hide the time range fields
   until restart: (a) `FileProperties.indexing_complete` flips to `true`
   (stopping `useFileProperties`'s poll) before timestamp detection has
   finished, so a poll can permanently observe `has_timestamp_format: false`;
   and (b) `WorkspacePage.hasTimestampFormat` reads from a one-shot
   `useActiveWorkspace()` query that's never refetched. Fix: a new
   `FileIndex.timestamp_detection_complete` flag folds into
   `indexing_complete`'s definition, and `WorkspacePage` reads
   `hasTimestampFormat` from the already-polling `useFileProperties`.
3. **US3 (P3)** — the time range fields format/parse in the browser's local
   timezone, while log lines display timestamps in the file's own timezone.
   Fix: detect the file's UTC offset (`FileIndex.utc_offset_minutes`, exposed
   as `FileProperties.timestamp_offset_minutes`) during timestamp detection,
   and rewrite `src/lib/timeRange.ts`'s formatting/parsing to operate in that
   fixed offset (UTC when `0`) instead of the browser's local timezone,
   reusing the `Date` constructor/local-getter self-consistency trick 009
   already relied on implicitly.

## Technical Context

**Language/Version**: TypeScript (`strict: true`) + Rust (stable, pinned via `rust-toolchain.toml`)
**Primary Dependencies**: React 19, TanStack Query (`useFileProperties` — existing, now also the source of `hasTimestampFormat`/`timestamp_offset_minutes`), TanStack Virtual (`useVirtualizer` — `count` becomes the filtered view total), Zustand (`useSearchUiStore` — `timeFrom`/`timeTo`, unchanged shape, now also consumed by `LogViewer`), existing `@radix-ui/react-popover` + `react-day-picker` (unchanged usage). Rust: `chrono` (`DateTime::parse_from_rfc3339` for offset detection), `memmap2`, `tauri`/`specta`/`tauri-specta` (new command + changed `LineBatch`/`FileProperties` DTOs). No new dependencies.
**Storage**: N/A — no SQLite schema changes. All new state (`effective_timestamps`, `utc_offset_minutes`, `timestamp_detection_complete`, `view_filter`) is in-memory (`FileIndex`/`FileRuntime`), rebuilt on file load like `line_timestamps`/`line_offsets` today.
**Testing**: Vitest + React Testing Library (`timeRange.test.ts`, `TimeRangeField.test.tsx`, `LogViewToolbar.test.tsx`, `LogViewer.test.tsx`, `useLogStream.test.ts`, `WorkspacePage.test.tsx`); `cargo test` (`viewing_test.rs`, `files_test.rs`, `search_test.rs`, `mcp_tools_test.rs`, plus new unit tests in `logfile::view_filter`/`logfile::offset`).
**Target Platform**: Desktop — Linux, macOS, Windows (Tauri v2 supported matrix). All three user stories apply to the desktop UI; the `effective_timestamps`/FR-010 change also affects the MCP `search_with_context` tool's result set (consistency, not a new MCP capability).
**Project Type**: Desktop app (Tauri: Rust backend + React/TS webview frontend) — this feature touches both, plus regenerated `src/bindings/index.ts`.
**Performance Goals**: `effective_timestamps` (FR-004) and `utc_offset_minutes` (FR-008) are computed once per file load, as O(total_lines)/O(sample_size) additions to the existing `detect_and_parse` pass (research.md §1.3/§3.2). `set_view_time_range` is an O(total_lines) pass run via `spawn_blocking`, triggered only on a committed range change (not per-scroll, Principle VI). `stream_lines`'s per-batch cost and `MAX_BATCH_BYTES` cap are unchanged.
**Constraints**: TS/TSX files ≤200 lines, Rust files ≤300 lines (Principle III). Two new Rust modules (`logfile/view_filter.rs`, `logfile/offset.rs`) absorb new logic so `logfile/query.rs` (301 lines) doesn't grow; `logfile/timestamp.rs` (356 lines, already over budget pre-010) gains ~10 lines calling into them — flagged in Complexity Tracking rather than undertaking an unrelated full split.
**Scale/Scope**: 1 new Tauri command (`set_view_time_range`), 2 changed DTOs (`LineBatch`, `FileProperties`) requiring `src/bindings/index.ts` regeneration, 2 new Rust modules, ~5 modified Rust files, ~7 modified frontend files, new/updated tests across both layers per `quickstart.md`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Type-Safe IPC & Shared Contracts | PASS | New `set_view_time_range(alias, time_from: Option<f64>, time_to: Option<f64>) -> Result<u32, AppError>` and the changed `LineBatch`/`FileProperties` DTOs are all defined in `commands/types.rs` with `#[derive(specta::Type)]`, regenerated into `src/bindings/index.ts` via the existing `export_bindings`/`tests/export_bindings.rs` flow — no hand-written TS types, no `any`. `Result<T, AppError>` preserved throughout (data-model.md §3, §6–8). |
| II | Security & Least Privilege | PASS (N/A) | No new capabilities, file-system access, or MCP tools. `set_view_time_range`'s inputs (`alias: String`, `time_from`/`time_to: Option<f64>`) are the same shapes already accepted by `search`, validated the same way (`resolve_runtime`). |
| III | Simplicity & Minimal Footprint | PASS, with one flagged pre-existing-file note | No new dependencies. New logic lives in two small, independently-testable new modules (`logfile/view_filter.rs`, `logfile/offset.rs`) rather than growing `query.rs`/`timestamp.rs` further than necessary (research.md §4). `effective_timestamps`/`view_filter` reuse existing `RwLock` patterns (`FileIndex`/`FileRuntime`) — no new concurrency primitives. See Complexity Tracking for `timestamp.rs`'s small addition to an already-oversized file. |
| IV | Test-First Quality Gates | PASS | Each user story gets new failing tests before its fix (quickstart.md): `viewing_test.rs` (US1, `set_view_time_range`/`stream_lines`), `logfile::view_filter`/`logfile::offset` unit tests (US1/US3), `files_test.rs` reproducing the US2 race directly, `WorkspacePage.test.tsx` (US2), `timeRange.test.ts`/`TimeRangeField.test.tsx` (US3). `tsc --noEmit`, `eslint .`, `cargo clippy -D warnings`, `cargo fmt --check`, the full Vitest suite, and `cargo test` all gate completion. |
| V | Accessible, Native-Feeling Desktop UI | PASS | `TimeRangeField`'s Radix Popover/`react-day-picker`/keyboard-reachable controls are unchanged structurally — only the underlying epoch↔text conversion (`offsetMinutes`-aware) and an added required prop change. No new custom widgets. |
| VI | Performance for Large Log Volumes | PASS | `set_view_time_range` runs via `spawn_blocking` (one O(total_lines) pass per committed range change, not per scroll/render). `effective_timestamps` is computed once at detection time alongside the existing `line_timestamps` pass. `stream_lines`'s `MAX_BATCH_BYTES` (64KB) cap and incremental-while-indexing behavior are unchanged; `LineContent` vs. raw `String` adds a small, bounded per-line overhead (a `u32`), still well under the ~100KB/batch guidance. |

**Result**: All gates PASS. One item noted in Complexity Tracking (pre-existing
`logfile/timestamp.rs` size, marginally increased — not a new violation
introduced by this feature's design, but worth surfacing per the
Development Workflow's "flag inconsistencies" guidance).

## Project Structure

### Documentation (this feature)

```text
specs/010-fix-time-range-filter-behavior/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── main-view-time-filter.md          # set_view_time_range, stream_lines/
│   │                                       #   LineBatch, effective_timestamps
│   │                                       #   (US1, FR-001–005, FR-010)
│   └── file-properties-and-timezone.md   # FileProperties.indexing_complete
│                                           #   redefinition + timestamp_offset_
│                                           #   minutes, TimeRangeField/timeRange.ts
│                                           #   offset contract (US2/US3, FR-006–009)
└── tasks.md              # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
src-tauri/
├── src/
│   ├── state.rs                    # MODIFIED — FileIndex gains
│   │                                #   effective_timestamps, utc_offset_minutes,
│   │                                #   timestamp_detection_complete;
│   │                                #   FileRuntime gains view_filter
│   ├── logfile/
│   │   ├── view_filter.rs          # NEW — effective_timestamps,
│   │   │                            #   timestamp_bounds, visible_line_indices
│   │   │                            #   (US1, FR-001–005)
│   │   ├── offset.rs               # NEW — detect_utc_offset_minutes (US3, FR-008)
│   │   ├── query.rs                # UNCHANGED (filter_by_time_range signature
│   │   │                            #   stays the same; new callers pass
│   │   │                            #   effective_timestamps)
│   │   └── timestamp.rs            # MODIFIED — detect_and_parse calls
│   │                                #   view_filter::effective_timestamps and
│   │                                #   (for Iso8601) offset::detect_utc_offset_minutes
│   ├── commands/
│   │   ├── types.rs                 # MODIFIED — FileProperties gains
│   │   │                            #   timestamp_offset_minutes, redefines
│   │   │                            #   indexing_complete semantics (impl in
│   │   │                            #   files.rs); LineBatch.lines becomes
│   │   │                            #   Vec<LineContent>
│   │   ├── files.rs                 # MODIFIED — index_and_detect_timestamps
│   │   │                            #   sets timestamp_detection_complete;
│   │   │                            #   file_properties redefines
│   │   │                            #   indexing_complete, adds
│   │   │                            #   timestamp_offset_minutes
│   │   ├── viewing.rs               # MODIFIED — new set_view_time_range
│   │   │                            #   command; stream_lines addresses
│   │   │                            #   view-row space via view_filter
│   │   └── search.rs                # MODIFIED — filter_by_time_range calls
│   │                                #   switch to effective_timestamps
│   ├── mcp/tools.rs                 # MODIFIED — search_with_context tool's
│   │                                #   filter_by_time_range call switches to
│   │                                #   effective_timestamps (FR-010)
│   └── lib.rs                       # MODIFIED — register set_view_time_range
│                                     #   in collect_commands!
└── tests/
    ├── viewing_test.rs               # MODIFIED — set_view_time_range +
    │                                  #   filtered stream_lines cases (US1)
    ├── files_test.rs                 # MODIFIED — indexing_complete race
    │                                  #   reproduction + timestamp_offset_minutes
    │                                  #   (US2/US3)
    ├── search_test.rs                # MODIFIED — FR-004 inheritance via
    │                                  #   effective_timestamps
    └── mcp_tools_test.rs             # MODIFIED — same, for MCP
                                       #   search_with_context

src/
├── bindings/index.ts                 # REGENERATED — set_view_time_range,
│                                      #   LineBatch, FileProperties
├── ipc/viewing.ts                    # MODIFIED — setViewTimeRange wrapper;
│                                      #   LineBatch.lines: LineContent[]
├── lib/
│   ├── timeRange.ts                  # MODIFIED — formatLocal/parseLocal/combine
│   │                                  #   -> formatInOffset/parseInOffset/
│   │                                  #   combineInOffset (US3, FR-008/FR-009)
│   └── timeRange.test.ts             # MODIFIED — offset-aware round-trip cases
├── hooks/
│   └── useLogStream.ts               # MODIFIED — timeFrom/timeTo/
│                                      #   hasTimestampFormat params,
│                                      #   setViewTimeRange wiring,
│                                      #   lines: Map<number, LineContent>,
│                                      #   totalLines (view) vs fileTotalLines
├── components/
│   ├── LogViewer.tsx                 # MODIFIED — hasTimestampFormat prop,
│   │                                  #   reads timeFrom/timeTo, view-row
│   │                                  #   rendering, navNonce reverse lookup
│   │                                  #   (US1)
│   ├── LogViewer.test.tsx            # MODIFIED/NEW — filtered rendering cases
│   ├── TimeRangeField.tsx            # MODIFIED — offsetMinutes prop (US3)
│   ├── TimeRangeField.test.tsx       # MODIFIED — offset-aware cases
│   └── LogViewToolbar.tsx            # MODIFIED — passes offsetMinutes from
│                                      #   useFileProperties (US3)
└── pages/
    ├── WorkspacePage.tsx              # MODIFIED — hasTimestampFormat from
    │                                  #   useFileProperties, passed to
    │                                  #   LogViewer (US2)
    └── WorkspacePage.test.tsx         # MODIFIED/NEW — US2 race reproduction
```

**Structure Decision**: Follows the existing Tauri layout
(`src-tauri/src/{state,logfile,commands,mcp}` + `src-tauri/tests`,
`src/{bindings,ipc,lib,hooks,components,pages}`). The two new Rust modules
(`logfile/view_filter.rs`, `logfile/offset.rs`) sit alongside `query.rs`/
`timestamp.rs` as the natural home for FR-004/FR-005's filtering logic and
FR-008's offset detection, keeping both existing files at their current size.
No new top-level directories.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| `src-tauri/src/logfile/timestamp.rs` grows from 356 to ~366 lines, further over the 300-line Rust guideline (Principle III) | `detect_and_parse` is the single place `line_timestamps`/the sample are available to compute `effective_timestamps` (FR-004) and detect `utc_offset_minutes` (FR-008); both additions are 2–3 lines each (one function call + one field write), with the actual logic living in the new `view_filter.rs`/`offset.rs` modules. | A full split of `timestamp.rs` (pre-existing 56-line overage, unrelated to this feature) was rejected as out-of-scope churn for a bug-fix feature — Development Workflow directs flagging pre-existing inconsistencies rather than silently expanding the change's footprint to fix them. |
