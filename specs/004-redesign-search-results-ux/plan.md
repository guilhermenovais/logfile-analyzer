# Implementation Plan: Redesigned Search Results UX

**Branch**: `004-redesign-search-results-ux` | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-redesign-search-results-ux/spec.md`

## Summary

Redesign the desktop search experience around a results list and a
"find-in-page"-style navigation model: the results panel becomes a clickable
list of matching lines only (no context), with a header (match count,
prev/next, close) that drives gray match-highlighting and step-through
navigation in the main log view (US1–US3). The standalone per-file "History"
section is removed; the search field instead offers autocomplete from the
last 5 (filtered) workspace searches plus a clock-icon overlay listing the
full, deduplicated workspace search history, persisted across restarts
(US4). This requires: a frontend redesign of `SearchBar`/`LogViewer` plus a
new per-alias Zustand store for results/nav/panel state, and a backend schema
change moving `search_history_entries` from per-file to per-workspace with
dedup and a one-time migration of existing rows.

## Technical Context

**Language/Version**: Rust (stable, pinned via `rust-toolchain.toml`) backend; TypeScript 5.8 (`strict: true`) + React 19 frontend — unchanged from 001/002/003
**Primary Dependencies**: Existing stack (Tauri v2, `rusqlite`, `tauri-specta`/`specta`, TanStack Query, `@tanstack/react-virtual`, Radix Dialog). Adds the first real usage of the already-declared `zustand` dependency for per-file search UI state (research.md §2) — no new packages
**Storage**: Existing local SQLite database; `search_history_entries` changes from `file_id`-scoped to `workspace_id`-scoped with a dedup `UNIQUE` index and a renamed `last_used_at` column, plus a one-time migration of existing rows (data-model.md)
**Testing**: `cargo test` (schema migration, `persistence::repo::search_history`, `commands::search` — Tauri mock runtime); Vitest + React Testing Library (mocked Tauri IPC) for `SearchBar`, new `SearchResultsPanel`/`SearchHistoryOverlay`, `LogViewer` highlighting/scroll, and the new Zustand store
**Target Platform**: Desktop — Linux, macOS, Windows (Tauri v2 supported matrix), unchanged
**Project Type**: Desktop app (Tauri: Rust backend + React/TS webview frontend), unchanged
**Performance Goals**: No new hot paths — results panel/highlighting reuse the existing `search` command's `MAX_MATCH_BATCH = 500` streaming cap (Principle VI); scroll-to-line reuses the existing `@tanstack/react-virtual` virtualizer already in `LogViewer`
**Constraints**: No new/changed IPC payload sizes beyond `get_search_history` dropping its `alias` param (contracts/ipc-commands.md); existing "Showing the first N matches" truncation notice applies to both the results list and main-view highlighting/navigation (Assumptions)
**Scale/Scope**: 1 schema migration + 1 repo module change + 1 command signature change + 1 DTO change (backend); 1 new Zustand store, 1 new history hook, 2 new components (`SearchResultsPanel`, `SearchHistoryOverlay`), `SearchBar`/`LogViewer`/`WorkspacePage` rewrites, 1 new CSS token (frontend)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Type-Safe IPC & Shared Contracts | PASS | `SearchHistoryEntry` (workspace_id/last_used_at) and `get_search_history`'s dropped `alias` param are specta-typed and regenerated into `src/bindings/index.ts`; `src/ipc/search.ts` wrappers updated to match. No raw `invoke()` calls added — components continue to go through `src/ipc/`. |
| II | Security & Least Privilege | PASS | `workspace_id` for history recording/reading is derived server-side from `*state.active_workspace_id`, never client-supplied. No new Tauri commands, plugins, or capability entries (contracts/ipc-commands.md). |
| III | Simplicity & Minimal Footprint | PASS | Reuses the existing `search` command instead of adding a new "matches only" command (research.md §1); reuses `@tanstack/react-virtual` for scroll-to-line (research.md §6); autocomplete/overlay share one cached `get_search_history()` result, filtered client-side, instead of a new backend search-history-search command (research.md §5). New files (`SearchResultsPanel`, `SearchHistoryOverlay`, `useSearchUiStore`, `useSearchHistory`) split out because `SearchBar.tsx` is already near the 200-line TSX limit and each has a distinct responsibility. |
| IV | Test-First Quality Gates | PASS | New/updated `cargo test`: schema migration (old → new `search_history_entries`, dedup), `persistence::repo::search_history` (workspace-scoped record/list/dedup-upsert), `commands::search` (history now keyed by workspace, `get_search_history` without `alias`). New/updated Vitest+RTL: results panel (list/click/close/prev-next/wrap), `LogViewer` (gray highlight set, scroll-to-line via `scrollToLine` prop), autocomplete filtering, history overlay, and the new Zustand store's per-alias isolation (FR-016). |
| V | Accessible, Native-Feeling Desktop UI | PASS | Prev/next/close remain `<button>`s; the history overlay is built on the already-used `@radix-ui/react-dialog`; the autocomplete suggestion list uses proper `combobox`/`listbox`/`option` ARIA roles so it's keyboard-navigable, consistent with existing accessible patterns in `SearchBar`/`HighlightPanel`. |
| VI | Performance for Large Log Volumes | PASS | No new IPC channels or payload shapes beyond the `get_search_history` signature tweak; gray highlighting/navigation are computed from the already-capped `search` results array client-side; `LogViewer`'s scroll-to-line uses the existing virtualizer's `scrollToIndex`, no extra rendering of off-screen lines. |

**Result**: All gates PASS. No violations — Complexity Tracking table left empty.

## Project Structure

### Documentation (this feature)

```text
specs/004-redesign-search-results-ux/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── ipc-commands.md  # Phase 1 output — delta on 001's IPC contract
└── tasks.md              # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── SearchBar.tsx               # MODIFIED: input row, search-type/time-range controls, clock
│   │                                #   icon, and autocomplete combobox (FR-010/FR-011); drops the
│   │                                #   old results list and "History" section
│   ├── SearchBar.test.tsx           # MODIFIED
│   ├── SearchResultsPanel.tsx       # NEW: matches-only list (FR-001-003), header with match
│   │                                #   count + prev/next + close (FR-004/FR-006/FR-007/FR-017)
│   ├── SearchResultsPanel.test.tsx  # NEW
│   ├── SearchHistoryOverlay.tsx     # NEW: Radix Dialog, scrollable full-history list (FR-012),
│   │                                #   select-to-rerun (FR-018)
│   ├── SearchHistoryOverlay.test.tsx # NEW
│   ├── LogViewer.tsx                # MODIFIED: + searchMatchLines prop (gray bg-search-match,
│   │                                #   FR-005), + scrollToLine prop (research.md §6)
│   └── LogViewer.test.tsx           # MODIFIED
├── hooks/
│   ├── useSearchUiStore.ts          # NEW: zustand store, per-alias SearchUiState (data-model.md)
│   ├── useSearchUiStore.test.ts     # NEW
│   ├── useSearchHistory.ts          # NEW: TanStack Query wrapper over get_search_history(),
│   │                                #   + derived autocomplete-suggestions selector (FR-010)
│   ├── useSearchHistory.test.ts     # NEW
│   ├── useSearch.ts                 # MODIFIED: now a thin wrapper invoking `search` and writing
│   │                                #   results into useSearchUiStore (or removed if folded into
│   │                                #   the store's actions — see tasks)
│   └── useSearch.test.ts            # MODIFIED
├── ipc/
│   └── search.ts                    # MODIFIED: getSearchHistory() drops `alias`; SearchHistoryEntry
│                                     #   type follows bindings (workspace_id/last_used_at)
├── pages/
│   ├── WorkspacePage.tsx            # MODIFIED: renders SearchResultsPanel + wires
│   │                                #   searchMatchLines/scrollToLine into LogViewer for the
│   │                                #   selected alias's slice (FR-016)
│   └── WorkspacePage.test.tsx       # MODIFIED
├── App.css                          # MODIFIED: + --search-match / --color-search-match token
│                                     #   (research.md §3)
└── bindings/index.ts                # REGENERATED (specta) — SearchHistoryEntry, get_search_history

src-tauri/src/
├── persistence/
│   ├── schema.rs                    # MODIFIED: new search_history_entries shape (workspace_id,
│   │                                #   last_used_at, dedup UNIQUE index) + migration from the
│   │                                #   old file_id-based table (FR-019, data-model.md)
│   └── repo/
│       └── search_history.rs        # MODIFIED: record() takes workspace_id + upserts on the
│                                     #   dedup key; list_for_workspace() replaces list_for_file()
├── commands/
│   ├── search.rs                    # MODIFIED: search/search_with_context record history via
│                                     #   workspace_id; get_search_history() drops `alias`
│   └── types.rs                     # MODIFIED: SearchHistoryEntry { workspace_id, last_used_at, ... }
└── lib.rs                           # unchanged collect_commands! list (same command names),
                                      # specta regenerates the changed signature/types

src-tauri/tests/
└── search_test.rs                   # MODIFIED: workspace-scoped history recording/listing,
                                      # dedup-on-rerun, get_search_history without alias
```

**Structure Decision**: Follows the existing desktop-app layout from
001/002/003 — frontend changes stay under `src/{components,hooks,ipc,pages}`,
backend changes stay under `src-tauri/src/{persistence,commands}` and
`src-tauri/tests/`. No new top-level directories. The two new components and
two new hooks are split out per Principle III's 200-line TSX limit and to
keep each new responsibility (results list+nav, history overlay, per-alias
UI state, history data) independently testable.

## Complexity Tracking

> No Constitution Check violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
