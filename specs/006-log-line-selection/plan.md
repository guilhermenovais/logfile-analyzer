# Implementation Plan: Selectable Log Lines

**Branch**: `006-log-line-selection` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-log-line-selection/spec.md`

## Summary

Make log lines clickable and keep exactly one "selected line" per open file,
shown with a blue border in both the main `LogViewer` and (when relevant)
`SearchResultsPanel`. A plain click selects a line; click-and-drag still
produces normal multi-line text selection without changing the selected
line. Ctrl/Cmd+C copies the highlighted text if any, otherwise the selected
line's full content. Search prev/next/select-match navigation sets the
selected line (and vice versa for clicks on matching lines); Up/Down arrow
keys move the selection by one line (clamped to file bounds), scrolling the
main view and, when the new line is itself a search match, the results
panel. All of this is new frontend-only view state — a per-alias Zustand
store (`useLineSelectionStore`) mirroring the existing `useSearchUiStore`
pattern, a shared `LogLine` row component extracted from `LogViewer` to stay
under the 200-line guideline, and a small keyboard hook for arrow-key/Ctrl+C
handling. No IPC, backend, or schema changes.

## Technical Context

**Language/Version**: TypeScript 5.8 (`strict: true`) + React 19 — unchanged from 001/004/005; no Rust/backend changes in this feature
**Primary Dependencies**: Existing stack only. `zustand` (new `useLineSelectionStore`, mirroring `useSearchUiStore`'s per-alias slice pattern, research.md §1); `@tanstack/react-virtual`'s `scrollToIndex({ align: "auto" })` for arrow-key scroll-follow (research.md §6, the existing search-match scroll effect's `align: "center"` is unchanged); `@tauri-apps/plugin-clipboard-manager`'s `writeText` for Ctrl+C line-copy — already a dependency, already capability-granted (`clipboard-manager:allow-write-text`), already used in `AgentInstructionsDialog.tsx` (research.md §9). No new packages, no new capabilities.
**Storage**: N/A — selection state is transient frontend view state, not persisted (spec Assumptions)
**Testing**: Vitest + React Testing Library for the new `useLineSelectionStore` (per-alias isolation, `selectLine`/`moveSelection` clamping), new `LogLine` component (click-vs-drag via `window.getSelection`, star `stopPropagation`, selected/highlight/search-match class composition), new `useLineSelectionKeyboard` hook (arrow-key clamping/fallback, Ctrl+C copy/no-op paths, text-input bail-out), plus updated `LogViewer.test.tsx`, `SearchResultsPanel.test.tsx`, and `useSearchUiStore.test.ts`. No `cargo test` changes (no backend code touched).
**Target Platform**: Desktop — Linux, macOS, Windows (Tauri v2 supported matrix), unchanged
**Project Type**: Desktop app (Tauri: Rust backend + React/TS webview frontend), unchanged — this feature is frontend-only
**Performance Goals**: N/A — no new IPC, no new hot paths; reuses the existing virtualizer and the existing capped search-results array
**Constraints**: TSX files stay under the 200-line guideline (Principle III) — `LogViewer.tsx` is already at 211 lines before this feature; its two row-rendering branches are extracted into a shared `LogLine.tsx` (research.md §4) to absorb the new selection/click/keyboard logic without growing further
**Scale/Scope**: Frontend only. 3 new files (`useLineSelectionStore.ts`, `useLineSelectionKeyboard.ts`, `LogLine.tsx`) + 3 test files; `LogViewer.tsx`, `SearchResultsPanel.tsx`, `useSearchUiStore.ts`, and `src/App.css` modified. No bindings regeneration, no new Tauri commands/capabilities, no `WorkspacePage.tsx` changes (both `LogViewer` and `SearchResultsPanel` already receive `alias` and can read `useLineSelectionStore` directly).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Type-Safe IPC & Shared Contracts | PASS (N/A) | No new/changed Tauri commands, IPC payloads, or `src/bindings` types — this feature is pure frontend view state. |
| II | Security & Least Privilege | PASS | Clipboard write reuses the already-granted `clipboard-manager:allow-write-text` capability (research.md §9) and the already-used `@tauri-apps/plugin-clipboard-manager` `writeText` — no new capability entries, no new untrusted-input surface. |
| III | Simplicity & Minimal Footprint | PASS | `useLineSelectionStore` mirrors the existing `useSearchUiStore` per-alias slice pattern instead of inventing a new state mechanism (research.md §1); `LogLine` extraction directly fixes `LogViewer.tsx` already exceeding the 200-line guideline while removing duplication between its two render branches (research.md §4); click-vs-drag uses `window.getSelection()` instead of new mousedown/mouseup tracking state (research.md §2); clipboard and scroll mechanisms reuse existing dependencies (research.md §6/§9). No new dependencies. |
| IV | Test-First Quality Gates | PASS | New Vitest+RTL coverage for `useLineSelectionStore`, `LogLine`, `useLineSelectionKeyboard`, plus updated `LogViewer`, `SearchResultsPanel`, `useSearchUiStore` tests (Technical Context, Testing). No backend changes, so the existing `cargo test`/`clippy`/`fmt` gates are unaffected (must still pass). |
| V | Accessible, Native-Feeling Desktop UI | **DEVIATION** | The log-line row (`LogLine`) remains a `<div>` with a click handler rather than a `<button>`/`<a>`, to preserve native click-and-drag multi-line text selection (FR-004), which `<button>` elements don't support. Keyboard parity is provided by Up/Down arrow-key navigation (FR-011/FR-019), active whenever a file is open, so the row doesn't need its own tab stop. The star highlight-toggle remains a proper `<button>` with `stopPropagation` (FR-018). See Complexity Tracking. |
| VI | Performance for Large Log Volumes | PASS | No new IPC/Channels, no new payload shapes. Arrow-key scroll-follow reuses the existing virtualizer's `scrollToIndex` (research.md §6); `SearchResultsPanel`'s scroll-into-view targets its existing small, non-virtualized match list. Selection state is O(1) per alias. |

**Result**: One documented deviation (Principle V), justified below. All other gates PASS.

## Project Structure

### Documentation (this feature)

```text
specs/006-log-line-selection/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # /speckit-tasks output (NOT created here)
```

No `contracts/` directory — this feature adds/changes no Tauri commands, IPC
payloads, or other external interfaces (Phase 1 step 2 is skipped, per the
"skip if purely internal" rule, since the only "interface" here is internal
React component/store wiring).

### Source Code (repository root)

```text
src/
├── components/
│   ├── LogLine.tsx                  # NEW: shared per-line row (star button, content,
│   │                                #   label) used by both LogViewer render branches
│   │                                #   (FR-001-FR-004, FR-015, FR-017, FR-018,
│   │                                #   research.md §2-4/§8)
│   ├── LogLine.test.tsx             # NEW
│   ├── LogViewer.tsx                # MODIFIED: extracts row markup into LogLine;
│   │                                #   reads useLineSelectionStore for `alias`; adds
│   │                                #   useLineSelectionKeyboard; adds the navNonce
│   │                                #   scroll-follow effect (FR-002/FR-003/FR-011-
│   │                                #   FR-014/FR-017, research.md §5/§6)
│   ├── LogViewer.test.tsx           # MODIFIED
│   ├── SearchResultsPanel.tsx       # MODIFIED: reads useLineSelectionStore for
│   │                                #   `alias`; shows border-selected-line on the
│   │                                #   matching entry (FR-008/FR-009); scrolls the
│   │                                #   active entry into view on navNonce changes
│   │                                #   when it's a match (FR-013)
│   └── SearchResultsPanel.test.tsx  # MODIFIED
├── hooks/
│   ├── useLineSelectionStore.ts     # NEW: per-alias { selectedLine, navNonce } +
│   │                                #   selectLine/moveSelection (FR-016, data-model.md)
│   ├── useLineSelectionStore.test.ts # NEW
│   ├── useLineSelectionKeyboard.ts  # NEW: window keydown listener — Up/Down
│   │                                #   (moveSelection, FR-011/FR-014/FR-019) and
│   │                                #   Ctrl/Cmd+C (clipboard writeText, FR-005-FR-007/
│   │                                #   FR-019), bailing out when focus is in a text
│   │                                #   input (data-model.md)
│   ├── useLineSelectionKeyboard.test.ts # NEW
│   └── useSearchUiStore.ts          # MODIFIED: setResults/selectMatch/nextMatch/
│                                     #   prevMatch also call
│                                     #   useLineSelectionStore.getState().selectLine()
│                                     #   for the resulting match (FR-010, research.md §7)
│   └── useSearchUiStore.test.ts     # MODIFIED
└── App.css                          # MODIFIED: + --selected-line / --color-selected-line
                                      #   tokens, light+dark (FR-002/FR-008, research.md §8)
```

No changes to `src-tauri/`, `src/bindings/index.ts`, `src/ipc/`, or
`src/pages/WorkspacePage.tsx` (both `LogViewer` and `SearchResultsPanel`
already receive the `alias` prop needed to read their own
`useLineSelectionStore` slice).

**Structure Decision**: Follows the existing desktop-app layout from
001/004/005 — all changes stay under `src/{components,hooks}` and
`src/App.css`. `LogLine`, `useLineSelectionStore`, and
`useLineSelectionKeyboard` are split into their own files both because each
is an independently testable responsibility and because `LogViewer.tsx` is
already over the 200-line guideline and must not grow further.

## Complexity Tracking

> Constitution Check has one violation, justified below.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| `LogLine`'s row is a `<div onClick>`, not a `<button>`/`<a>` (Principle V) | FR-004 requires native click-and-drag text selection within and across log lines, which is incompatible with `<button>` elements (browsers generally disable drag-text-selection inside them). Click-to-select (FR-001) and the star toggle (FR-018, still a real `<button>` with `stopPropagation`) are layered on top via `window.getSelection()`-based click handling (research.md §2-3). | Making the row a focusable `role="option"`/`tabIndex` div still wouldn't restore native drag-text-selection inside a widget styled as a control, and would introduce a second, redundant keyboard-interaction model alongside the Up/Down arrow-key navigation (FR-011/FR-019) that already gives full keyboard parity for selecting a line. |
