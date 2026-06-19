# Implementation Plan: Fix Search UX

**Branch**: `015-fix-search-ux` | **Date**: 2026-06-19 | **Spec**: `specs/015-fix-search-ux/spec.md`
**Input**: Feature specification from `specs/015-fix-search-ux/spec.md`

## Summary

Fix four search UX regressions: (1) layout overflow when the search results panel opens, pushing toolbar controls off-screen; (2) click-to-navigate from search results to the main log viewer; (3) missing visible scrollbar in the search results panel; (4) text shift on selection in search result lines due to missing border placeholder. All fixes are CSS/layout and minor React wiring changes — no Rust backend work required.

## Technical Context

**Language/Version**: TypeScript 5.8.3 (strict), React 19, Tailwind CSS 4.3.0, Vite
**Primary Dependencies**: Zustand (state), TanStack Virtual (virtualizer), TanStack Query, Radix UI, Tailwind CSS 4
**Storage**: N/A (frontend-only changes)
**Testing**: Vitest + React Testing Library (frontend), cargo test (backend — not needed for this feature)
**Target Platform**: Desktop (Tauri v2), minimum ~800px viewport width
**Project Type**: Desktop app (Tauri v2)
**Performance Goals**: Click-to-navigate within 500ms (SC-002)
**Constraints**: All fixes are CSS/layout-only or thin React event wiring; no IPC changes
**Scale/Scope**: 4 components touched (SearchResultsPanel, SearchBar, WorkspacePage, App.css)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Type-Safe IPC | ✅ PASS | No IPC changes; all work is frontend CSS/layout |
| II. Security | ✅ PASS | No new inputs or capabilities |
| III. Simplicity | ✅ PASS | Minimal CSS changes, no new abstractions |
| IV. Test-First Quality Gates | ✅ PASS | Existing test files for all touched components; tests will be updated |
| V. Accessible UI | ✅ PASS | All interactive elements already use `<button>`; border-placeholder pattern uses semantic markup |
| VI. Performance | ✅ PASS | No performance-impacting changes; scrollToIndex already exists |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/015-fix-search-ux/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
└── quickstart.md        # Phase 1 output
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── SearchResultsPanel.tsx   # Stories 2, 3, 4 — click nav, scrollbar, border placeholder
│   ├── SearchBar.tsx            # Story 1 — layout fix (flex shrink)
│   └── LogLine.tsx              # Reference for border-placeholder pattern
├── hooks/
│   ├── useSearchUiStore.ts      # selectMatch already wires scrollNonce — no changes needed
│   └── useLineSelectionStore.ts # selectLine already exists — no changes needed
├── pages/
│   └── WorkspacePage.tsx        # Story 1 — layout constraint for results panel
└── App.css                      # Story 3 — scrollbar CSS utility
```

## Complexity Tracking

> No Constitution Check violations — table left empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
