# Implementation Plan: Highlight Click Navigation

**Branch**: `019-highlight-click-navigation` | **Date**: 2026-06-22 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/019-highlight-click-navigation/spec.md`

## Summary

Add click-to-navigate behavior to the highlights panel so clicking a highlight entry selects the line across all panels and scrolls the main log view to it — mirroring the search results panel pattern. Additionally, hovering over the star icon (★) on a highlighted line in the main view shows a native tooltip with the highlight's label. This is a pure frontend feature: no Rust/IPC changes, no new stores, no new files.

## Technical Context

**Language/Version**: TypeScript (strict mode), React 19, Vite  
**Primary Dependencies**: Zustand (state), TanStack Virtual (virtualization), Tailwind CSS (styling)  
**Storage**: N/A (no persistence changes)  
**Testing**: Vitest + React Testing Library  
**Target Platform**: Desktop (Tauri v2)  
**Project Type**: Desktop app  
**Performance Goals**: Click-to-scroll must feel instant; no additional IPC calls  
**Constraints**: Reuse existing scroll infrastructure (`useScrollToLine` hook); no new Zustand stores  
**Scale/Scope**: 4 files modified, ~50 lines changed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Pre-Phase 0 | Post-Phase 1 | Notes |
|-----------|-------------|--------------|-------|
| I. Type-Safe IPC & Shared Contracts | PASS | PASS | No new IPC — feature is frontend-only |
| II. Security & Least Privilege | PASS | PASS | No new capabilities, no user input boundaries |
| III. Simplicity & Minimal Footprint | PASS | PASS | Reuses existing stores, hooks, and scroll patterns; no new files or abstractions |
| IV. Test-First Quality Gates | PASS | PASS | Vitest tests required for click handler and tooltip |
| V. Accessible Desktop UI | PASS | PASS | Highlight entries become `<button>` elements (not `<div onClick>`); keyboard accessible |
| VI. Performance for Large Log Volumes | PASS | PASS | No additional IPC; scroll uses existing virtualizer; highlight click is O(1) state update |

**No violations. No entries needed in Complexity Tracking.**

## Project Structure

### Documentation (this feature)

```text
specs/019-highlight-click-navigation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (files to modify)

```text
src/
├── components/
│   ├── HighlightPanel.tsx   # Add click handler, alias prop, selection styling
│   ├── LogLine.tsx          # Add title attribute to star button
│   └── LogViewer.tsx        # Add highlightScrollToLine prop + second useScrollToLine call
└── pages/
    └── WorkspacePage.tsx    # Wire highlight scroll state and callbacks
```

## Design

### Architecture: Scroll Signal Pattern

The existing search-to-scroll flow uses a `{ lineIndex, nonce }` signal:

```
SearchResultsPanel click
  → useSearchUiStore.selectMatch() bumps scrollNonce
  → WorkspacePage reads scrollToLine(alias)
  → LogViewer receives scrollToLine prop
  → useScrollToLine hook watches nonce, scrolls virtualizer
```

Highlight navigation adds a parallel signal path:

```
HighlightPanel click
  → WorkspacePage handler calls selectLine() + bumps local nonce
  → LogViewer receives highlightScrollToLine prop
  → Second useScrollToLine hook watches nonce, scrolls virtualizer
```

Both paths share `useLineSelectionStore.selectLine()` for cross-panel selection. Both use `useScrollToLine` for scrolling. They operate independently — no merging or priority logic needed.

### Component Changes

#### 1. LogLine.tsx — Star Tooltip (FR-004, FR-005)

Add `title={highlight?.label ?? undefined}` to the star `<button>`. When `label` is null/undefined, no `title` attribute is rendered (no empty tooltip). Native browser tooltip behavior — zero new dependencies.

#### 2. HighlightPanel.tsx — Click Navigation (FR-001, FR-002, FR-003, FR-006, FR-007)

**New props**: `alias: string`, `onSelect: (lineIndex: number) => void`

**Store subscriptions**: `selectedLine` and `navNonce` from `useLineSelectionStore` (same pattern as SearchResultsPanel).

**Entry rendering**: Each highlight's line-number + content becomes a `<button>` with:
- `border-selected-line` when `selectedLine === highlight.line_index`
- `border-transparent` otherwise
- `hover:bg-accent` for interactivity feedback
- Click calls `onSelect(highlight.line_index)`

The label `<input>` and remove `×` button remain outside the clickable button to avoid interaction conflicts.

**Scroll-follow**: `useEffect` watching `navNonce` calls `entryRefs.current.get(selectedLine)?.scrollIntoView({ block: "nearest" })` for keyboard navigation sync.

#### 3. LogViewer.tsx — Second Scroll Target (FR-002)

**New prop**: `highlightScrollToLine?: { lineIndex: number; nonce: number } | null`

Add a second `useScrollToLine` call with `highlightScrollToLine` as `scrollTarget`. Each hook instance has its own `generationRef` and watches its own nonce — no interference.

#### 4. WorkspacePage.tsx — Wiring

**Local state**:
- `highlightScrollNonce = useRef(0)` — monotonically increasing counter
- `highlightScrollTarget = useState(null)` — `{ lineIndex, nonce } | null`

**Handler**: `handleHighlightSelect(lineIndex)` calls `selectLine(alias, lineIndex)` and bumps the scroll target.

**Props**: Pass `alias` and `onSelect` to `HighlightPanel`; pass `highlightScrollToLine` to `LogViewer`.

## Complexity Tracking

> No violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
