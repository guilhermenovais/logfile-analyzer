# Tasks: Search UX Improvements

**Input**: Design documents from `/specs/020-search-ux-improvements/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Tests are MANDATORY per the project constitution (Test-First Quality Gates). Write tests for each user story before implementing it, and ensure they fail before implementation begins.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new project setup required. This feature adds incremental changes to an existing Tauri + React codebase with no new dependencies.

*(No tasks — existing project structure and dependencies are sufficient.)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No cross-cutting infrastructure changes block user story work. All backend changes are scoped to US6 (Pagination). User stories can begin immediately.

*(No tasks — all prerequisites are scoped within individual user story phases.)*

**Checkpoint**: All user stories can begin immediately, in priority order or in parallel.

---

## Phase 3: User Story 1 - Horizontal Scrolling in Search Results (Priority: P1) :dart: MVP

**Goal**: Allow users to scroll horizontally within the search results list to read full content of long matching lines.

**Independent Test**: Search a file with lines exceeding the panel width and verify horizontal scrolling appears and works.

### Tests for User Story 1 (MANDATORY per constitution) :warning:

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T001 [US1] Add tests for horizontal scrolling CSS (verify `overflow-x-auto` present, `truncate` class removed from result line content) in src/components/SearchResultsPanel.test.tsx

### Implementation for User Story 1

- [X] T002 [US1] Replace `truncate` class on result line content with `whitespace-pre overflow-x-auto` on the results list container in src/components/SearchResultsPanel.tsx

**Checkpoint**: Search results with long lines show a horizontal scrollbar. Short lines show no scrollbar.

---

## Phase 4: User Story 2 - Larger Navigation and Close Buttons with Tooltips (Priority: P1)

**Goal**: Increase click targets on Previous/Next/Close buttons to at least 28x28px and add descriptive tooltips with keyboard shortcut hints.

**Independent Test**: Hover over each button to see tooltips; verify increased button size visually.

### Tests for User Story 2 (MANDATORY per constitution) :warning:

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T003 [US2] Add tests for button sizes (`min-w-7`, `min-h-7` classes) and tooltip `title` attributes ("Previous match (Shift+Up)", "Next match (Shift+Down)", "Close search results") in src/components/SearchResultsPanel.test.tsx

### Implementation for User Story 2

- [X] T004 [US2] Add `min-w-7 min-h-7 flex items-center justify-center rounded hover:bg-accent` to Previous/Next/Close buttons and add `title` attributes in src/components/SearchResultsPanel.tsx

**Checkpoint**: Buttons are visibly larger (>=28x28px). Hovering shows correct tooltips with shortcut hints.

---

## Phase 5: User Story 4 - Keyboard Shortcuts for Result Navigation (Priority: P1)

**Goal**: Enable Shift+Up/Down keyboard shortcuts to navigate previous/next search match, working globally regardless of focus.

**Independent Test**: Perform a search, press Shift+Down/Up to navigate through results. Verify it works even when focused on the search input.

### Tests for User Story 4 (MANDATORY per constitution) :warning:

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T005 [US4] Add tests for Shift+Down calling nextMatch, Shift+Up calling prevMatch, working when focused on text input, and no-op when search panel is not open in src/hooks/useLineSelectionKeyboard.test.ts

### Implementation for User Story 4

- [X] T006 [US4] Add Shift+Up/Down handler before the `isTextInput()` early-return guard that calls `useSearchUiStore.getState().nextMatch(alias)` / `.prevMatch(alias)` when search results are visible in src/hooks/useLineSelectionKeyboard.ts

**Checkpoint**: Shift+Down selects next match, Shift+Up selects previous match. Works from any focus context. Wraps around at boundaries.

---

## Phase 6: User Story 3 - Search History Button Tooltip (Priority: P2)

**Goal**: Add a tooltip to the search history clock icon button so users understand its purpose on hover.

**Independent Test**: Hover over the clock icon button in the search bar and verify "Search history" tooltip appears.

### Tests for User Story 3 (MANDATORY per constitution) :warning:

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T007 [US3] Add test verifying the search history button has `title="Search history"` attribute in src/components/SearchBar.test.tsx

### Implementation for User Story 3

- [X] T008 [US3] Add `title="Search history"` to the clock icon button in src/components/SearchBar.tsx

**Checkpoint**: Hovering over the search history button shows "Search history" tooltip.

---

## Phase 7: User Story 5 - Wrap Lines Option for Search Results (Priority: P2)

**Goal**: Add a toggle to switch between horizontal scrolling and line wrapping in search results. Default OFF (horizontal scrolling).

**Independent Test**: Toggle the wrap lines option and verify long lines either wrap or scroll horizontally.

### Tests for User Story 5 (MANDATORY per constitution) :warning:

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T009 [P] [US5] Add tests for `wrapLines` state default (false), `toggleWrapLines` action, and persistence across searches in src/hooks/useSearchUiStore.test.ts
- [X] T010 [P] [US5] Add tests for wrap toggle button visibility, conditional CSS classes (`whitespace-pre-wrap break-all` when ON, `whitespace-pre overflow-x-auto` when OFF), and horizontal scroll suppression when wrap is enabled in src/components/SearchResultsPanel.test.tsx

### Implementation for User Story 5

- [X] T011 [US5] Add `wrapLines: boolean` (default false) state and `toggleWrapLines(alias)` action to src/hooks/useSearchUiStore.ts
- [X] T012 [US5] Add wrap lines toggle button and apply conditional CSS (`whitespace-pre-wrap break-all` vs `whitespace-pre overflow-x-auto`) based on `wrapLines` state; bump `navNonce` after toggle to scroll selected match into view in src/components/SearchResultsPanel.tsx

**Checkpoint**: Wrap toggle switches between wrapped and scrolling display. Preference persists across searches within the session. Default is OFF.

---

## Phase 8: User Story 6 - Pagination for Large Result Sets (Priority: P2)

**Goal**: When search returns >500 matches, show pagination controls to navigate pages. Display total match count and loading indicator during page transitions.

**Independent Test**: Search for a term with >500 matches, verify page controls appear, click Next to load page 2 with spinner, counter shows global position.

### Tests for User Story 6 (MANDATORY per constitution) :warning:

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T013 [P] [US6] Add backend tests: search with `offset: Some(500)` returns second page, `offset: None` returns first page (backward compatible), `total_count` reflects full match count, `truncated` is false when offset + matches.len() >= total_count in src-tauri/tests/search_test.rs
- [X] T014 [P] [US6] Add tests for pagination store state: `currentPage`, `totalCount`, `isPageLoading` defaults, `setPageResults` action, page reset on new search (FR-016), `setPageLoading` action in src/hooks/useSearchUiStore.test.ts
- [X] T015 [P] [US6] Add tests for pagination controls visibility (shown when totalCount > 500, hidden otherwise), Previous/Next page buttons, page indicator text, and loading spinner during page transition in src/components/SearchResultsPanel.test.tsx

### Implementation for User Story 6

#### Backend

- [X] T016 [US6] Add `total_count: u32` field to `SearchMatchBatch` struct in src-tauri/src/commands/types.rs
- [X] T017 [US6] Add `offset: Option<u32>` parameter to `search` command, implement slice logic `match_indices[offset..offset+500]`, compute `total_count` from full match count, and update `truncated` logic in src-tauri/src/commands/search.rs

#### IPC Layer

- [X] T018 [US6] Add optional `offset` parameter to `search()` wrapper function and pass it to the Tauri invoke call in src/ipc/search.ts

#### Store

- [X] T019 [US6] Add `currentPage: number` (default 0), `totalCount: number` (default 0), `isPageLoading: boolean` (default false) state fields and `setPageResults(alias, results, truncated, totalCount, page)`, `setPageLoading(alias, loading)` actions; update `setResults` to accept `totalCount` and reset `currentPage` to 0 in src/hooks/useSearchUiStore.ts

#### Search Hook

- [X] T020 [US6] Update `runSearch` to accept and pass `offset` parameter to `ipc/search.ts`, handle `total_count` from response batch, call `setPageResults` for page changes and `setPageLoading` for transition state in src/hooks/useSearch.ts

#### UI

- [X] T021 [US6] Add pagination controls (Previous Page / Next Page buttons, "Page X of Y" indicator) below the results list when `totalCount > PAGE_SIZE`; add spinner overlay during page transitions (`isPageLoading`); update match counter to show global position (e.g., "503 of 1200") in src/components/SearchResultsPanel.tsx

**Checkpoint**: Searching with >500 matches shows pagination. Next/Previous page loads with spinner. Counter shows global position. New searches reset to page 1.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and verification across all user stories.

- [ ] T022 Run quickstart.md verification checklist in running app via `npm run tauri dev`
- [X] T023 Verify all tooltips appear correctly (Previous match, Next match, Close, Search history)
- [X] T024 Verify keyboard shortcuts work globally (Shift+Up/Down from search input and results)
- [X] T025 Verify wrap toggle + horizontal scroll interaction (wrap ON suppresses scrollbar, wrap OFF restores it)
- [ ] T026 Verify pagination edge cases (new search resets page, keyboard nav stays within page, loading indicator appears)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No tasks — existing project
- **Foundational (Phase 2)**: No tasks — no cross-cutting blockers
- **User Stories (Phases 3–8)**: Can begin immediately; see story dependencies below
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 - Horizontal Scrolling (P1)**: No dependencies — can start immediately
- **US2 - Larger Buttons + Tooltips (P1)**: No dependencies — can start immediately (touches different section of SearchResultsPanel.tsx than US1)
- **US4 - Keyboard Shortcuts (P1)**: No dependencies — can start immediately (different file: useLineSelectionKeyboard.ts)
- **US3 - Search History Tooltip (P2)**: No dependencies — can start immediately (different file: SearchBar.tsx)
- **US5 - Wrap Lines (P2)**: Soft dependency on US1 (wrap toggle interacts with horizontal scroll CSS). Recommended to implement after US1.
- **US6 - Pagination (P2)**: No dependencies on other stories. Backend tasks (T016–T017) must complete before IPC (T018), store (T019), hook (T020), and UI (T021) tasks.

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Backend before IPC before store before hook before UI (US6 only)
- Store before component changes (US5 only)

### Parallel Opportunities

- **US1, US2, US4, US3** can all run in parallel (P1 stories first, then P2; all touch different files or different sections)
- **US6 backend tasks** (T016, T017) can run in parallel with US1–US5 frontend work
- **US6 tests** (T013, T014, T015) can all run in parallel (different files)
- **US5 tests** (T009, T010) can run in parallel (different files)

---

## Parallel Example: P1 Stories

```bash
# All P1 stories can start in parallel (different files):
US1: T001 → T002  (SearchResultsPanel.tsx — result line styling)
US2: T003 → T004  (SearchResultsPanel.tsx — button sizing, different section)
US4: T005 → T006  (useLineSelectionKeyboard.ts)

# Meanwhile, US3 (P2) can also start (different file):
US3: T007 → T008  (SearchBar.tsx)
```

## Parallel Example: US6 Pagination

```bash
# Launch all US6 tests together:
T013: Backend tests in src-tauri/tests/search_test.rs
T014: Store tests in src/hooks/useSearchUiStore.test.ts
T015: UI tests in src/components/SearchResultsPanel.test.tsx

# Backend implementation (sequential):
T016 → T017 (types.rs → search.rs)

# Then IPC + Store can run in parallel:
T018: src/ipc/search.ts
T019: src/hooks/useSearchUiStore.ts

# Then hook + UI (sequential, depends on IPC and store):
T020 → T021
```

---

## Implementation Strategy

### MVP First (P1 Stories Only)

1. Complete US1 (Horizontal Scrolling) — most impactful for daily use
2. Complete US2 (Larger Buttons + Tooltips) — improves core navigation
3. Complete US4 (Keyboard Shortcuts) — enables power-user workflow
4. **STOP and VALIDATE**: Test all P1 stories independently in running app

### Incremental Delivery

1. P1 Stories: US1 + US2 + US4 → Test → Deploy/Demo (MVP!)
2. P2 Quick Wins: US3 (tooltip) → Test
3. P2 Wrap Lines: US5 → Test (complements US1)
4. P2 Pagination: US6 → Test (backend + frontend, largest story)
5. Polish: Phase 9 cross-cutting validation
6. Each story adds value without breaking previous stories

### Single Developer Strategy

Work in priority order: US1 → US2 → US4 → US3 → US5 → US6 → Polish. Each story is a clean commit boundary.
