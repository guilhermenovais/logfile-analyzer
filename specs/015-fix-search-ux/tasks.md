# Tasks: Fix Search UX

**Input**: Design documents from `/specs/015-fix-search-ux/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Tests are MANDATORY per the project constitution (Test-First Quality Gates). Write tests for each user story before implementing it, and ensure they fail before implementation begins.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the shared CSS utility class needed by multiple user stories

- [x] T001 Add `.scrollbar-visible` CSS utility class with `-webkit-scrollbar` styling (thin width, themed track/thumb using CSS vars) in `src/App.css`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No foundational blocking tasks — all user stories modify independent aspects of existing components

**Checkpoint**: Setup ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Search results panel breaks page layout (Priority: P1) :dart: MVP

**Goal**: Prevent the search results panel from pushing toolbar controls off-screen when it opens. All search bar and results panel controls must remain visible and clickable at any reasonable viewport width (minimum 800px).

**Independent Test**: Perform any search that returns results and verify all toolbar and panel controls remain visible and clickable within the viewport.

### Tests for User Story 1 (MANDATORY per constitution)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T002 [P] [US1] Add test in `src/components/SearchBar.test.tsx` asserting the outer wrapper div has `shrink-0` class and the input wrapper div has `min-w-0` class
- [x] T003 [P] [US1] Add test in `src/components/SearchResultsPanel.test.tsx` asserting the outer wrapper div has `shrink-0` class

### Implementation for User Story 1

- [x] T004 [P] [US1] Add `shrink-0` to the outer `<div>` of `SearchBar` in `src/components/SearchBar.tsx` (line 57: `className="flex flex-col gap-2 border-b p-2"` → add `shrink-0`) and add `min-w-0` to the input's relative wrapper `<div>` (line 59: `className="relative flex-1"` → add `min-w-0`)
- [x] T005 [P] [US1] Add `shrink-0` to the outer `<div>` of `SearchResultsPanel` in `src/components/SearchResultsPanel.tsx` (line 44: `className="flex flex-col gap-2 border-b p-2"` → add `shrink-0`)

**Checkpoint**: At this point, the layout overflow should be fixed. All search bar and panel controls remain visible when the results panel is open.

---

## Phase 4: User Story 2 — Click search result to navigate main view (Priority: P2)

**Goal**: Clicking a search result line scrolls the main log viewer to center that line in view.

**Independent Test**: Perform a search, click on any result entry, and verify the main log viewer scrolls to center that line in view.

### Tests for User Story 2

> **NOTE: No new tests needed**

Research confirmed that click-to-navigate **already works** via the existing `selectMatch` → `scrollNonce` → `virtualizer.scrollToIndex` chain. The issue reported was a side-effect of the layout overflow (Story 1) making the results panel unclickable or the scroll target invisible because the LogViewer was squeezed. Fixing Story 1 resolves this. No code changes required.

**Checkpoint**: With Story 1 fixed, click-to-navigate should work end-to-end. Verify manually.

---

## Phase 5: User Story 3 — Search results panel needs a scrollbar (Priority: P3)

**Goal**: Display a visible, draggable scrollbar in the search results panel consistent with the app's theme when results exceed the visible area.

**Independent Test**: Perform a search that returns many results (more than fit in the panel) and verify a visible scrollbar appears that can be dragged.

### Tests for User Story 3 (MANDATORY per constitution)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T006 [US3] Add test in `src/components/SearchResultsPanel.test.tsx` asserting the results `<ul>` element has the `scrollbar-visible` class when results are present

### Implementation for User Story 3

- [x] T007 [US3] Add `scrollbar-visible` class to the `<ul>` in `src/components/SearchResultsPanel.tsx` (line 90: `className="flex max-h-48 flex-col gap-1 overflow-auto text-xs"` → add `scrollbar-visible`)

**Checkpoint**: Visible scrollbar appears in the search results panel when results overflow.

---

## Phase 6: User Story 4 — Consistent line margins in search results (Priority: P4)

**Goal**: Eliminate text shift when selecting/deselecting search result lines by applying a constant-width border (transparent when unselected, colored when selected), matching the pattern in `LogLine.tsx`.

**Independent Test**: Click on different search result lines and verify that the text content does not shift position when the selection border appears or disappears.

### Tests for User Story 4 (MANDATORY per constitution)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T008 [US4] Add test in `src/components/SearchResultsPanel.test.tsx` asserting that result buttons always have `border-2` class, have `border-transparent` when not selected, and have `border-selected-line` when selected (the current code only applies `border-2 border-selected-line` conditionally when selected)

### Implementation for User Story 4

- [x] T009 [US4] Update the button `className` logic in `src/components/SearchResultsPanel.tsx` (lines 102-105) to always include `border-2` and toggle between `border-selected-line` (when `match.line_index === selectedLine`) and `border-transparent` (otherwise), matching the pattern in `LogLine.tsx` lines 39-48

**Checkpoint**: No text shift occurs when clicking search result lines. Border is always present (transparent or colored).

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validation and quality gates

- [x] T010 Run `pnpm exec tsc --noEmit` to verify no type errors
- [x] T011 Run `pnpm exec eslint .` to verify no lint errors
- [x] T012 Run `pnpm test` to verify all tests pass (including new assertions)
- [ ] T013 Manual visual verification per `specs/015-fix-search-ux/quickstart.md` testing strategy: load a file, search, verify all 4 stories

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Empty — no blocking prerequisites
- **User Story 1 (Phase 3)**: Depends on Setup for `shrink-0` (no CSS dependency, can start in parallel with Phase 1)
- **User Story 2 (Phase 4)**: No code changes — resolved by Story 1's layout fix
- **User Story 3 (Phase 5)**: Depends on Phase 1 (needs `.scrollbar-visible` class from `App.css`)
- **User Story 4 (Phase 6)**: No dependencies on other stories — can run in parallel with Phase 3 and Phase 5
- **Polish (Phase 7)**: Depends on all stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent — only touches `SearchBar.tsx`, `SearchResultsPanel.tsx` (layout classes)
- **User Story 2 (P2)**: Already working — depends on Story 1 layout fix for usability
- **User Story 3 (P3)**: Depends on Phase 1 (`App.css` utility) — touches `SearchResultsPanel.tsx` (different attribute than US1)
- **User Story 4 (P4)**: Independent — touches `SearchResultsPanel.tsx` (button className, different from US1/US3 changes)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- CSS utility before component changes (for US3)
- Implementation before integration testing

### Parallel Opportunities

- T002, T003 can run in parallel (different test files)
- T004, T005 can run in parallel (different source files)
- T006 and T008 can run in parallel (both add tests to the same file but for different behaviors)
- US1, US3, and US4 implementation can proceed in parallel (different concerns in the same files, non-overlapping lines)

---

## Parallel Example: User Story 1

```bash
# Launch tests for US1 together:
Task T002: "Test SearchBar shrink-0 and min-w-0 classes in src/components/SearchBar.test.tsx"
Task T003: "Test SearchResultsPanel shrink-0 class in src/components/SearchResultsPanel.test.tsx"

# Launch implementation for US1 together:
Task T004: "Add shrink-0 and min-w-0 to SearchBar in src/components/SearchBar.tsx"
Task T005: "Add shrink-0 to SearchResultsPanel in src/components/SearchResultsPanel.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (`.scrollbar-visible` CSS class)
2. Complete Phase 3: User Story 1 (layout overflow fix)
3. **STOP and VALIDATE**: Verify all toolbar controls remain visible, click-to-navigate works (Story 2 resolved)
4. This alone fixes the blocking issue that renders search unusable

### Incremental Delivery

1. Phase 1 → CSS utility ready
2. Add User Story 1 → Layout fixed, click-to-navigate works → **MVP complete**
3. Add User Story 3 → Visible scrollbar in results panel
4. Add User Story 4 → No text shift on selection
5. Phase 7 → Quality gates pass

### Notes

- User Story 2 requires zero code changes — it's already implemented and will work once Story 1's layout fix restores panel interactivity
- All 4 files touched: `src/App.css`, `src/components/SearchResultsPanel.tsx`, `src/components/SearchBar.tsx` (no changes needed in `src/pages/WorkspacePage.tsx` — the existing `flex-1 overflow-hidden` on the LogViewer wrapper is sufficient)
- Total changes are minimal: ~15 lines of CSS, ~5 lines of className adjustments
