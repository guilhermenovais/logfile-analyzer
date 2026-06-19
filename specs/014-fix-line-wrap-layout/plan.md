# Implementation Plan: Fix Line Wrap Layout

**Branch**: `014-fix-line-wrap-layout` | **Date**: 2026-06-19 | **Spec**: `specs/014-fix-line-wrap-layout/spec.md`
**Input**: Feature specification from `specs/014-fix-line-wrap-layout/spec.md`

## Summary

Fix two layout bugs in the log viewer: (1) wrapped lines overlap because the virtualizer uses fixed 20px row heights — enable TanStack Virtual's `measureElement` API for dynamic row sizing; (2) the selection border shifts content because it's conditionally applied — use a permanent transparent border that swaps color on selection.

## Technical Context

**Language/Version**: TypeScript (strict), React 19, Vite
**Primary Dependencies**: `@tanstack/react-virtual` ^3.14.2, Tailwind CSS v4, Zustand
**Storage**: N/A (frontend-only fix)
**Testing**: Vitest + React Testing Library
**Target Platform**: Tauri v2 desktop (Linux, macOS, Windows)
**Project Type**: Desktop app (Tauri)
**Performance Goals**: Smooth scrolling with up to 100,000 lines when wrap is enabled (SC-003)
**Constraints**: No new dependencies; no changes to IPC or Rust backend
**Scale/Scope**: 2 files changed (LogLine.tsx, LogViewer.tsx) + test updates

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Type-Safe IPC & Shared Contracts | ✅ PASS | No IPC changes; frontend-only fix |
| II. Security & Least Privilege | ✅ PASS | No capability or CSP changes |
| III. Simplicity & Minimal Footprint | ✅ PASS | Uses existing TanStack Virtual API, no new abstractions |
| IV. Test-First Quality Gates | ✅ PASS | Existing tests updated for new behavior |
| V. Accessible, Native-Feeling Desktop UI | ✅ PASS | Fix improves usability — no accessibility regressions |
| VI. Performance for Large Log Volumes | ✅ PASS | `measureElement` uses shared `ResizeObserver`, negligible overhead (research.md R-004) |

**Pre-Phase 0 gate**: PASSED
**Post-Phase 1 gate**: PASSED — no violations introduced during design

## Project Structure

### Documentation (this feature)

```text
specs/014-fix-line-wrap-layout/
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
│   ├── LogViewer.tsx       # Virtualizer dynamic measurement
│   ├── LogViewer.test.tsx  # Updated tests
│   ├── LogLine.tsx         # Transparent border fix
│   └── LogLine.test.tsx    # Updated tests
└── hooks/
    └── useLogViewToolbarStore.ts  # Unchanged (wrap state already here)
```

**Structure Decision**: No new files or directories. Changes are confined to existing components in `src/components/`.

## Complexity Tracking

> No constitution violations — table intentionally left empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
