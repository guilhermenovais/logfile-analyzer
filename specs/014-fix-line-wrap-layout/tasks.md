# Tasks: Fix Line Wrap Layout

**Input**: Design documents from `/specs/014-fix-line-wrap-layout/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Tests are MANDATORY per the project constitution (Test-First Quality Gates). Write tests for each user story before implementing it, and ensure they fail before implementation begins.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No new files or dependencies — this phase is intentionally empty. All changes are to existing files.

*(No tasks — the project is already initialized and no new infrastructure is needed for this bug fix.)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No foundational/blocking prerequisites. Both user stories modify independent files and can begin immediately.

*(No tasks — no shared infrastructure changes are required.)*

**Checkpoint**: Foundation ready — user story implementation can begin

---

## Phase 3: User Story 1 — Wrapped Lines Display Without Overlapping (Priority: P1) 🎯 MVP

**Goal**: Enable dynamic row height measurement so wrapped lines expand their containers and never overlap adjacent lines.

**Independent Test**: Open any log file with long lines, toggle wrap on, verify no text overlaps between adjacent lines. Resize the window while wrapped — lines re-wrap without overlap.

### Tests for User Story 1 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T001 [US1] Write test: virtualizer uses `measureElement` ref callback when wrap is enabled in `src/components/LogViewer.test.tsx`
- [X] T002 [US1] Write test: virtual items include `data-index` attribute matching `item.index` in `src/components/LogViewer.test.tsx`
- [X] T003 [US1] Write test: virtual items do NOT have fixed `height` style when wrap is enabled in `src/components/LogViewer.test.tsx`
- [X] T004 [US1] Write test: `virtualizer.measure()` is called when `wrap` prop changes in `src/components/LogViewer.test.tsx`

### Implementation for User Story 1

- [X] T005 [US1] Enable `measureElement` on `useVirtualizer` — pass `measureElement` callback from virtualizer to each virtual item's wrapper `ref` in `src/components/LogViewer.tsx`
- [X] T006 [US1] Add `data-index={item.index}` attribute to each virtual item wrapper in `src/components/LogViewer.tsx`
- [X] T007 [US1] Remove fixed `height: ${item.size}px` from virtual item inline styles (let DOM determine height, virtualizer measures it) in `src/components/LogViewer.tsx`
- [X] T008 [US1] Add `useEffect` that calls `virtualizer.measure()` when `wrap` prop changes to invalidate cached row heights in `src/components/LogViewer.tsx`

**Checkpoint**: Wrapped lines should display without overlapping. Scrolling should remain smooth. Toggle wrap off — lines return to fixed-height single rows.

---

## Phase 4: User Story 2 — Selected Line Border Does Not Shift Content (Priority: P2)

**Goal**: Replace conditional border with a permanent transparent border that swaps color on selection, eliminating the 4px layout shift.

**Independent Test**: Click any log line to select it — verify text does not shift horizontally or vertically. Click another line — verify the previously selected line's text also does not shift back.

### Tests for User Story 2 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T009 [US2] Write test: unselected LogLine renders with `border-2 border-transparent` classes in `src/components/LogLine.test.tsx`
- [X] T010 [US2] Write test: selected LogLine renders with `border-2 border-selected-line` classes (not conditional `border-2`) in `src/components/LogLine.test.tsx`

### Implementation for User Story 2

- [X] T011 [US2] Change LogLine to always apply `border-2` — use `border-transparent` as default, swap to `border-selected-line` when `isSelected` is true in `src/components/LogLine.tsx`

**Checkpoint**: Selecting and deselecting lines should produce zero pixel shift of text content.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Verify both fixes work together and pass manual validation

- [X] T012 Run quickstart.md manual verification steps (wrap overlap, selection border, resize, toggle, scroll performance)
- [X] T013 Run existing test suite (`npm test`) to confirm no regressions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Empty — no setup needed
- **Foundational (Phase 2)**: Empty — no blocking prerequisites
- **User Story 1 (Phase 3)**: Can start immediately — modifies `src/components/LogViewer.tsx`
- **User Story 2 (Phase 4)**: Can start immediately — modifies `src/components/LogLine.tsx`
- **Polish (Phase 5)**: Depends on both user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent — changes only `LogViewer.tsx` and `LogViewer.test.tsx`
- **User Story 2 (P2)**: Independent — changes only `LogLine.tsx` and `LogLine.test.tsx`
- US1 and US2 modify **different files** and have **no cross-dependencies**, so they can be implemented in parallel

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Implementation tasks within each story are sequential (same file)

### Parallel Opportunities

- US1 tests (T001–T004) can run in parallel with US2 tests (T009–T010) — different files
- US1 implementation (T005–T008) can run in parallel with US2 implementation (T011) — different files
- Within US1: T001–T004 are all in the same test file, so they should be done sequentially
- Within US2: T009–T010 are in the same test file, so they should be done sequentially

---

## Parallel Example: Both User Stories

```bash
# These can run in parallel (different files):
Task: US1 tests in src/components/LogViewer.test.tsx (T001–T004)
Task: US2 tests in src/components/LogLine.test.tsx (T009–T010)

# Then in parallel:
Task: US1 implementation in src/components/LogViewer.tsx (T005–T008)
Task: US2 implementation in src/components/LogLine.tsx (T011)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Skip Setup & Foundational (empty)
2. Complete Phase 3: User Story 1 (dynamic row heights)
3. **STOP and VALIDATE**: Toggle wrap on, verify no overlap
4. Continue to User Story 2 or ship MVP

### Incremental Delivery

1. Add User Story 1 → Test: no overlap → validates core fix
2. Add User Story 2 → Test: no shift → validates polish fix
3. Run full quickstart.md validation
4. Both stories are independently valuable and can ship separately
