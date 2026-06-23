# Implementation Plan: Search UX Improvements

**Branch**: `020-search-ux-improvements` | **Date**: 2026-06-22 | **Spec**: `specs/020-search-ux-improvements/spec.md`
**Input**: Feature specification from `specs/020-search-ux-improvements/spec.md`

## Summary

Improve the search experience with six changes: horizontal scrolling for
result lines, larger navigation/close buttons with tooltips, a search
history button tooltip, Shift+Up/Down keyboard shortcuts for result
navigation, a wrap-lines toggle, and pagination for result sets exceeding
500 matches. Frontend changes live entirely in the existing React
components and Zustand store; the only backend change is adding `offset`
and `total_count` fields to the `search` command for pagination.

## Technical Context

**Language/Version**: Rust (stable, pinned via `rust-toolchain.toml`) + TypeScript (`strict: true`)
**Primary Dependencies**: Tauri v2, React 19, Zustand 5, TanStack Virtual, Tailwind 4, Radix UI (Dialog, Popover, DropdownMenu), Lucide icons, Rayon (Rust parallel scan)
**Storage**: SQLite (search history), memory-mapped files (log content)
**Testing**: Vitest + React Testing Library (frontend), `cargo test` (backend)
**Target Platform**: Linux desktop (Tauri v2)
**Project Type**: Desktop app (Tauri)
**Performance Goals**: Search scan is parallel via Rayon over mmap'd files; pagination re-scans per page (fast, <100ms for typical files)
**Constraints**: IPC payloads under ~100KB (Principle VI); 500 matches per page
**Scale/Scope**: Single-window app, files up to multi-GB

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Type-Safe IPC & Shared Contracts | PASS | New `offset`/`total_count` fields added to `SearchMatchBatch` (Specta auto-generates TS types). IPC wrapper in `src/ipc/search.ts` updated. No direct `invoke()` calls. |
| II. Security & Least Privilege | PASS | No new capabilities required. No new input surfaces. Offset/limit validated in Rust. |
| III. Simplicity & Minimal Footprint | PASS | No new dependencies for tooltips (native `title` attributes match existing pattern). Pagination uses stateless re-scan, no backend session state. `@radix-ui/react-tooltip` not added — native `title` is sufficient and consistent. |
| IV. Test-First Quality Gates | PASS | Each task includes tests. Existing test suites extended. |
| V. Accessible, Native-Feeling Desktop UI | PASS | All buttons already use `<button>` elements. Tooltips via native `title` attributes are accessible. Keyboard shortcuts (Shift+Up/Down) add keyboard-only navigation. |
| VI. Performance for Large Log Volumes | PASS | Pagination avoids sending >500 results per IPC payload. Re-scan per page is fast (Rayon parallel over mmap). Total count computed during same scan — no extra pass. |

**Post-Phase 1 re-check**: All principles satisfied. No violations requiring Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/020-search-ux-improvements/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── SearchBar.tsx              # Add title tooltip to history button (FR-006)
│   └── SearchResultsPanel.tsx     # Horizontal scroll, larger buttons, tooltips,
│                                  #   wrap toggle, pagination controls (FR-001–FR-005, FR-010–FR-017)
├── hooks/
│   ├── useSearchUiStore.ts        # Add wrapLines, pagination state (currentPage, totalCount)
│   ├── useSearch.ts               # Pass offset param, handle totalCount in response
│   └── useLineSelectionKeyboard.ts  # Add Shift+Up/Down handling (FR-007–FR-009)
├── ipc/
│   └── search.ts                  # Add offset parameter to search() wrapper
└── bindings/
    └── index.ts                   # Auto-generated (Specta rebuild)

src-tauri/src/
├── commands/
│   ├── search.rs                  # Add offset param, return total_count (FR-013–FR-017)
│   └── types.rs                   # Add total_count field to SearchMatchBatch
└── logfile/
    └── (no changes — scan_matches already returns all indices)
```

**Structure Decision**: Tauri desktop app with `src/` frontend and `src-tauri/src/` backend, following existing project layout. No new directories needed.

## Complexity Tracking

> No violations. All changes follow existing patterns and principles.
