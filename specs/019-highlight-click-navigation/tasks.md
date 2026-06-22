# Tasks: Highlight Click Navigation

**Input**: Design documents from `/specs/019-highlight-click-navigation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Tests are MANDATORY per the project constitution (Test-First Quality Gates). Write tests for each user story before implementing it, and ensure they fail before implementation begins.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new project setup needed — this feature modifies 4 existing files with no new dependencies. Phase intentionally empty.

**Checkpoint**: Ready to proceed to user story phases (no foundational blockers).

---

## Phase 2: User Story 1 — Click Highlight to Navigate (Priority: P1) 🎯 MVP

**Goal**: Clicking a highlight entry in the highlights panel selects the line across all panels and scrolls the main log view to it, mirroring the search results panel behavior.

**Independent Test**: Open a log with several highlighted lines, open the highlights panel, click entries — main view must scroll to the selected line with a visible selection border across all panels.

### Tests for User Story 1 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T001 [P] [US1] Write test for HighlightPanel click handler — clicking an entry calls onSelect with the correct lineIndex in src/components/__tests__/HighlightPanel.test.tsx
- [x] T002 [P] [US1] Write test for HighlightPanel selected entry styling — entry with matching selectedLine gets border-selected-line class in src/components/__tests__/HighlightPanel.test.tsx
- [x] T003 [P] [US1] Write test for LogViewer highlightScrollToLine prop — second useScrollToLine call triggers scroll when nonce changes in src/components/__tests__/LogViewer.test.tsx

### Implementation for User Story 1

- [x] T004 [P] [US1] Add `alias: string` and `onSelect: (lineIndex: number) => void` props to HighlightPanel, wrap each entry's line-number + content in a `<button>` with click handler calling `onSelect(highlight.line_index)` in src/components/HighlightPanel.tsx
- [x] T005 [P] [US1] Subscribe HighlightPanel to `useLineSelectionStore` for `selectedLine` and `navNonce`, apply `border-selected-line` / `border-transparent` styling on entries, and add `useEffect` scroll-follow on `navNonce` change using `entryRefs` Map in src/components/HighlightPanel.tsx
- [x] T006 [US1] Add `highlightScrollToLine?: { lineIndex: number; nonce: number } | null` prop to LogViewer and add second `useScrollToLine` call with it as `scrollTarget` in src/components/LogViewer.tsx
- [x] T007 [US1] Add `highlightScrollNonce` ref and `highlightScrollTarget` state to WorkspacePage, create `handleHighlightSelect` handler that calls `selectLine` + bumps nonce, pass `alias`/`onSelect` to HighlightPanel and `highlightScrollToLine` to LogViewer in src/pages/WorkspacePage.tsx

**Checkpoint**: User Story 1 fully functional — clicking highlight entries navigates main view and updates selection across all panels.

---

## Phase 3: User Story 2 — Hover Star to See Label (Priority: P2)

**Goal**: Hovering over the star icon (★) on a highlighted line in the main log view shows a native tooltip with the highlight's label text.

**Independent Test**: Add a labeled highlight, hover over the star icon in the main log view — a tooltip must appear showing the label text. Hover over an unlabeled highlight's star — no tooltip.

### Tests for User Story 2 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T008 [US2] Write test for LogLine star tooltip — star button has `title` attribute equal to highlight label when label exists, and no `title` when label is null in src/components/__tests__/LogLine.test.tsx

### Implementation for User Story 2

- [x] T009 [US2] Add `title={highlight?.label ?? undefined}` to the star `<button>` element in src/components/LogLine.tsx

**Checkpoint**: User Story 2 complete — star tooltips show labels on hover, no tooltip for unlabeled highlights.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Validation across both user stories and regression checks.

- [x] T010 Run `npm run typecheck` to verify no TypeScript errors across all modified files
- [x] T011 Run `npm run lint` to verify no linting issues across all modified files
- [x] T012 Run `npm run test` to verify all tests pass (new and existing)
- [ ] T013 Run quickstart.md manual testing checklist validation (all 8 items)

---

## Dependencies & Execution Order

### Phase Dependencies

- **User Story 1 (Phase 2)**: No blockers — can start immediately
- **User Story 2 (Phase 3)**: No blockers — can start immediately (independent of US1)
- **Polish (Phase 4)**: Depends on both user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Self-contained. T004/T005 modify the same file (HighlightPanel.tsx) so must be sequential. T006 and T007 modify different files but T007 depends on T006's prop being available.
- **User Story 2 (P2)**: Fully independent of US1. Only touches LogLine.tsx.

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- T001/T002/T003 can all run in parallel (different test files)
- T004 before T005 (same file, T005 builds on T004's button structure)
- T006 before T007 (T007 passes the prop that T006 adds)
- T008 before T009 (test-first)

### Parallel Opportunities

- US1 tests (T001, T002, T003) can all run in parallel
- US1 and US2 are fully independent — can be worked on in parallel
- T004 (HighlightPanel) and T006 (LogViewer) can run in parallel
- Polish tasks (T010, T011, T012) can run in parallel

---

## Parallel Example: User Story 1

```text
# Write all US1 tests in parallel:
T001: "HighlightPanel click handler test in src/components/__tests__/HighlightPanel.test.tsx"
T002: "HighlightPanel selected styling test in src/components/__tests__/HighlightPanel.test.tsx"
T003: "LogViewer highlightScrollToLine test in src/components/__tests__/LogViewer.test.tsx"

# Then implement — T004 + T006 in parallel (different files):
T004: "Add props and button wrapper in src/components/HighlightPanel.tsx"
T006: "Add highlightScrollToLine prop in src/components/LogViewer.tsx"

# Then sequential (same-file or cross-file dependencies):
T005: "Add selection store subscription in src/components/HighlightPanel.tsx"
T007: "Wire state and callbacks in src/pages/WorkspacePage.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Write US1 tests (T001–T003) — verify they fail
2. Implement US1 (T004–T007)
3. **STOP and VALIDATE**: Run tests, verify US1 works independently
4. Manual test: click highlight entries, verify scroll and selection

### Incremental Delivery

1. Complete User Story 1 → Test independently → Core navigation works (MVP!)
2. Complete User Story 2 → Test independently → Star tooltips added
3. Polish phase → Full validation across both stories
4. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No new files created — all changes are to existing components
- No Rust/IPC changes — pure frontend feature
- Reuses existing `useScrollToLine` hook and `useLineSelectionStore` — no new abstractions
- Total: ~50 lines of production code across 4 files
