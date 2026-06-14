# Tasks: Selectable Log Lines

**Input**: Design documents from `/specs/006-log-line-selection/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Tests are MANDATORY per the project constitution (Test-First Quality
Gates, Principle IV). Each user story's tests are written first and must fail
before that story's implementation tasks begin.

**Organization**: Tasks are grouped by user story (spec.md priorities P1-P3)
to enable independent implementation and testing of each story. This feature
is frontend-only (TypeScript/React/Vitest); no `src-tauri/`, `src/bindings/`,
or IPC changes are made by any task.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1-US4)
- Paths are relative to the repository root

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure required before any user story's
implementation tasks can be completed. (No separate "Setup" phase: this
feature adds no new dependencies, packages, or capabilities — research.md
§1/§9, plan.md Technical Context.)

- [X] T001 [P] Add `--selected-line` (light) / `--selected-line` (dark) theme
  variables and the `--color-selected-line` `@theme inline` mapping to
  `src/App.css`, following the existing `--search-match` /
  `--color-search-match` pattern (research.md §8, data-model.md "New theme
  tokens")

**Checkpoint**: `border-selected-line` is available as a Tailwind utility
class for all user stories below.

---

## Phase 2: User Story 1 - Select a log line by clicking it (Priority: P1) 🎯 MVP

**Goal**: Clicking a log line gives it a blue border (the "selected line");
clicking another line moves the border; click-and-drag still produces normal
multi-line text selection without changing the selected line. Applies in both
the normal and "Highlighted only" views (FR-017), and the star
highlight-toggle button does not change selection (FR-018).

**Independent Test**: Open a log file, click a line, verify the blue border
appears. Click a different line, verify the border moves. Click-and-drag
across text within/across lines, verify normal text selection occurs and the
blue border does not move. Click a line's star button, verify only the
highlight toggles.

### Tests for User Story 1 (write first, MUST fail before implementation) ⚠️

- [X] T002 [P] [US1] Write tests for the new per-alias `useLineSelectionStore`
  in `src/hooks/useLineSelectionStore.test.ts`: default slice (`selectedLine:
  null`), `selectLine(alias, lineIndex)` sets `selectedLine` for that alias
  only, and per-alias isolation (selecting in one alias doesn't affect
  another) (data-model.md `LineSelectionSlice`/`selectLine`)
- [X] T003 [P] [US1] Write tests for the new `LogLine` component in
  `src/components/LogLine.test.tsx`: a plain click (no selection via
  `window.getSelection()`) calls `onSelect(lineIndex)`; a click that follows a
  drag-selection (`window.getSelection()?.toString()` non-empty) does NOT call
  `onSelect`; clicking the star button calls `onToggleHighlight` and does NOT
  call `onSelect` (`stopPropagation`, FR-018); `isSelected` adds `border-2
  border-selected-line`; highlight (`bg-accent`) and search-match
  (`bg-search-match` / `ring-2 ring-inset ring-search-match`) classes still
  compose correctly alongside the selection border (FR-015, data-model.md
  `LogLineProps`, research.md §2-4)
- [X] T004 [P] [US1] Update `src/components/LogViewer.test.tsx` for the
  `LogLine`-based rendering: clicking a rendered line calls
  `useLineSelectionStore`'s `selectLine` for the viewer's `alias` and the
  clicked line then renders with `border-selected-line`; verify this works in
  both the normal (virtualized) view and the "Highlighted only" flat-list view
  (FR-001-FR-004, FR-017)

### Implementation for User Story 1

- [X] T005 [P] [US1] Create `src/hooks/useLineSelectionStore.ts`: Zustand
  store with per-alias `LineSelectionSlice` (`{ selectedLine: number | null }`
  for now), `DEFAULT_LINE_SELECTION_SLICE`, the `selectLine(alias,
  lineIndex)` action, and the non-reactive `getLineSelectionSlice(alias)`
  helper (mirroring `getSearchUiSlice` in `src/hooks/useSearchUiStore.ts`)
  (data-model.md `useLineSelectionStore`)
- [X] T006 [US1] Create `src/components/LogLine.tsx`: shared per-line row
  (star toggle `<button>` with `stopPropagation`, content `<span>` with
  `whiteSpace: wrap ? "pre-wrap" : "pre"`, optional highlight label) extracted
  from `LogViewer`'s two render branches, plus the new `onClick` handler that
  calls `onSelect(lineIndex)` only when `window.getSelection()?.toString()` is
  empty, and `className` composition adding `border-2 border-selected-line`
  when `isSelected` (depends on T005 for the `onSelect`/`selectLine` contract;
  data-model.md `LogLineProps`, research.md §2-4)
- [X] T007 [US1] Refactor `src/components/LogViewer.tsx` to render both the
  normal (virtualized) and "Highlighted only" (flat list) branches via
  `LogLine`, read `useLineSelectionStore` for this `alias`'s `selectedLine`,
  and pass `isSelected`/`onSelect={(lineIndex) =>
  useLineSelectionStore.getState().selectLine(alias, lineIndex)}` to each
  `LogLine` (depends on T006; plan.md notes this refactor must bring
  `LogViewer.tsx` back under the 200-line guideline)

**Checkpoint**: User Story 1 is fully functional and independently testable
(click-to-select with blue border, click-and-drag text selection unaffected,
star button doesn't change selection, works in both views).

---

## Phase 3: User Story 2 - Copy the selected line's content with Ctrl+C (Priority: P1)

**Goal**: Ctrl+C (Cmd+C) copies highlighted text if any is highlighted,
otherwise copies the full content of the selected line, otherwise does
nothing. Active whenever a file is open, except when keyboard focus is in a
text input (FR-019).

**Independent Test**: Click a line (no drag), press Ctrl+C, paste elsewhere —
the full line text appears. Click-drag to highlight a substring, press
Ctrl+C, paste — only the highlighted substring appears. With nothing selected
and nothing highlighted, press Ctrl+C — nothing is copied.

### Tests for User Story 2 (write first, MUST fail before implementation) ⚠️

- [X] T008 [P] [US2] Write tests for the new `useLineSelectionKeyboard` hook in
  `src/hooks/useLineSelectionKeyboard.test.ts` covering Ctrl/Cmd+C: when
  `window.getSelection()?.toString()` is non-empty, the hook does not call
  `writeText` (lets the browser's default copy run, FR-005); when it's empty
  and `selectedLine` is set, the hook calls `preventDefault()` and `writeText`
  (from `@tauri-apps/plugin-clipboard-manager`) with that line's full content
  via `getLineContent` (FR-006); when it's empty and `selectedLine` is `null`,
  the hook does nothing (FR-007); when `document.activeElement` is an
  `<input>`/`<textarea>`/contentEditable element, the hook does nothing for
  Ctrl/Cmd+C (FR-019)

### Implementation for User Story 2

- [X] T009 [US2] Create `src/hooks/useLineSelectionKeyboard.ts`: a hook that
  attaches a `window` `keydown` listener for its lifetime, taking `alias`,
  `selectedLine`, and `getLineContent(lineIndex)` (per
  `UseLineSelectionKeyboardOptions` in data-model.md, omitting the
  arrow-key-only fields for now); on Ctrl/Cmd+C, bails out if
  `document.activeElement` is a text input, otherwise implements the FR-005/
  FR-006/FR-007 logic described in T008 (research.md §5/§9)
- [X] T010 [US2] Wire `useLineSelectionKeyboard` into
  `src/components/LogViewer.tsx`, passing this view's `alias`, the current
  `selectedLine` (from `useLineSelectionStore`), and a `getLineContent`
  callback backed by the existing `lines` map from `useLogStream` (depends on
  T007, T009)

**Checkpoint**: User Stories 1 AND 2 both work independently (select a line,
Ctrl+C copies it; drag-selection still takes priority; no-op when nothing is
selected/highlighted).

---

## Phase 4: User Story 3 - Selected line stays in sync with the search results panel (Priority: P2)

**Goal**: Search "previous match"/"next match"/select-match navigation sets
the selected line; the search results panel shows the same
`border-selected-line` treatment on the entry matching `selectedLine`, and no
entry is indicated when `selectedLine` isn't a match (FR-008/FR-009/FR-010).

**Independent Test**: Run a search with multiple matches. Step through
next/previous match and verify the same line shows a blue border in both the
main view and the results panel. Click a main-view line that is also a match
and verify its results-panel entry becomes indicated as selected. Click a
main-view line that is not a match and verify no results-panel entry is
indicated.

### Tests for User Story 3 (write first, MUST fail before implementation) ⚠️

- [X] T011 [P] [US3] Update `src/hooks/useSearchUiStore.test.ts`: after
  `setResults`, `selectMatch`, `nextMatch`, and `prevMatch`,
  `useLineSelectionStore.getState().slices[alias].selectedLine` equals the
  resulting current match's `line_index` (FR-010, research.md §7)
- [X] T012 [P] [US3] Update `src/components/SearchResultsPanel.test.tsx`: the
  results-panel entry whose `match.line_index === selectedLine` (from
  `useLineSelectionStore`) renders with `border-2 border-selected-line`; when
  `selectedLine` is not among `results`, no entry renders that class
  (FR-008/FR-009)

### Implementation for User Story 3

- [X] T013 [P] [US3] Update `setResults`, `selectMatch`, `nextMatch`, and
  `prevMatch` in `src/hooks/useSearchUiStore.ts` to additionally call
  `useLineSelectionStore.getState().selectLine(alias, <resulting current
  match's line_index>)` (depends on T005; FR-010, research.md §7) — no-op call
  when `results` is empty (no current match to select)
- [X] T014 [P] [US3] Update `src/components/SearchResultsPanel.tsx` to read
  `useLineSelectionStore` for `alias` and apply `border-2
  border-selected-line` to the `<li>`/`<button>` of the entry whose
  `match.line_index === selectedLine` (depends on T005; FR-008/FR-009)

**Checkpoint**: User Stories 1-3 all work independently and together (search
navigation drives the same selection indicator shown in both the main view
and the results panel).

---

## Phase 5: User Story 4 - Move the selected line with the keyboard (Priority: P3)

**Goal**: Up/Down arrow keys move the selected line by one, clamped to file
bounds (no wraparound), with the main view scrolling to follow
(`scrollToIndex({ align: "auto" })`) and the search results panel scrolling to
follow only if the new selected line is a current match (FR-011-FR-014).

**Independent Test**: Select a line, press Down repeatedly — selection and
blue border move down one line at a time, main view scrolls as needed. Press
Up while the first line is selected, and Down while the last line is
selected — selection does not change. With the results panel open, verify it
scrolls to reveal the new selection only when that line is a listed match.
Click into the search field and press Up/Down — the text cursor moves, log
selection is unchanged.

### Tests for User Story 4 (write first, MUST fail before implementation) ⚠️

- [X] T015 [P] [US4] Extend `src/hooks/useLineSelectionStore.test.ts` for
  `navNonce` and `moveSelection(alias, delta, totalLines, fallbackLine)`:
  moving from a set `selectedLine` clamps `current ± 1` to `[1, totalLines]`
  and bumps `navNonce`; moving when `selectedLine` is `null` uses
  `fallbackLine` as the starting point; pressing at a bound (clamped result
  equals current) is a no-op that does not bump `navNonce` (data-model.md
  `moveSelection`, acceptance scenario 5)
- [X] T016 [P] [US4] Extend `src/hooks/useLineSelectionKeyboard.test.ts` for
  Up/Down: pressing Down/Up (when focus is not in a text input) calls
  `useLineSelectionStore.getState().moveSelection(alias, ±1, totalLines,
  firstVisibleLineRef.current)`; pressing Up/Down while
  `document.activeElement` is a text input does nothing (FR-011/FR-014/
  FR-019)
- [X] T017 [P] [US4] Extend `src/components/SearchResultsPanel.test.tsx`: when
  `navNonce` changes and the new `selectedLine` is among `results`, the
  matching entry's element receives a `scrollIntoView({ block: "nearest" })`
  call; when `navNonce` changes and the new `selectedLine` is NOT among
  `results`, no `scrollIntoView` call occurs and the rendered selection
  indicator is unchanged (FR-013)

### Implementation for User Story 4

- [X] T018 [P] [US4] Extend `src/hooks/useLineSelectionStore.ts`: add
  `navNonce: number` (default `0`) to `LineSelectionSlice` /
  `DEFAULT_LINE_SELECTION_SLICE`, and add the `moveSelection(alias, delta,
  totalLines, fallbackLine)` action implementing the clamping/no-op/bump rules
  from T015 (depends on T005; data-model.md `moveSelection`, research.md §5)
- [X] T019 [US4] Extend `src/hooks/useLineSelectionKeyboard.ts` to accept
  `totalLines` and `firstVisibleLineRef` (per `UseLineSelectionKeyboardOptions`
  in data-model.md), and on Up/Down keydown (when focus is not in a text
  input) call `useLineSelectionStore.getState().moveSelection(alias, delta,
  totalLines, firstVisibleLineRef.current)` and `preventDefault()` (depends on
  T009, T018; FR-011/FR-014/FR-019, research.md §5)
- [X] T020 [US4] In `src/components/LogViewer.tsx`: add a `firstVisibleLineRef`
  (updated from the virtualizer's first visible item index + 1) and
  `totalLines`/`getLineContent` wiring into `useLineSelectionKeyboard`
  (depends on T019); add a second `useEffect` that watches this alias's
  `navNonce` from `useLineSelectionStore` and calls
  `virtualizer.scrollToIndex(selectedLine - 1, { align: "auto" })` when it
  changes (depends on T018; research.md §6, FR-012)
- [X] T021 [P] [US4] Update `src/components/SearchResultsPanel.tsx`: on
  changes to this alias's `navNonce` (from `useLineSelectionStore`), if the
  new `selectedLine` is among `results`, call `scrollIntoView({ block:
  "nearest" })` on that entry's ref; otherwise do nothing (depends on T018;
  research.md §6, FR-013)

**Checkpoint**: All four user stories work independently and together — the
full feature described in spec.md is complete.

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Validate the complete feature across all user stories.

- [X] T022 Run the full Vitest suite (`npm test` or equivalent) and confirm all
  new/updated tests pass: `useLineSelectionStore.test.ts`, `LogLine.test.tsx`,
  `useLineSelectionKeyboard.test.ts`, `LogViewer.test.tsx`,
  `SearchResultsPanel.test.tsx`, `useSearchUiStore.test.ts`
- [X] T023 [P] Run `npm run lint` and `tsc --noEmit` (or the project's
  equivalent type-check script) and fix any errors in the new/modified files
  (`src/hooks/useLineSelectionStore.ts`, `src/hooks/useLineSelectionKeyboard.ts`,
  `src/components/LogLine.tsx`, `src/components/LogViewer.tsx`,
  `src/components/SearchResultsPanel.tsx`, `src/hooks/useSearchUiStore.ts`,
  `src/App.css`)
- [ ] T024 Run the manual verification walkthrough in
  `specs/006-log-line-selection/quickstart.md` end-to-end (`npm run tauri
  dev`), covering all four user stories and the Edge Cases / Cross-cutting
  checks sections

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — can start immediately. BLOCKS
  T006/T007 (US1) and T014/T021 (which apply `border-selected-line`).
- **User Story 1 (Phase 2)**: Depends on Phase 1 (T001). No dependencies on
  other user stories.
- **User Story 2 (Phase 3)**: Depends on US1 (`useLineSelectionStore` from T005
  and the refactored `LogViewer.tsx` from T007).
- **User Story 3 (Phase 4)**: Depends on US1 (`useLineSelectionStore.selectLine`
  from T005). Independent of US2.
- **User Story 4 (Phase 5)**: Depends on US1 (T005/T007) and US2 (T009, the
  `useLineSelectionKeyboard` hook it extends). Independent of US3, though both
  touch `SearchResultsPanel.tsx` (T014 and T021 — sequence T014 before T021 to
  avoid edit conflicts if implemented by the same person).
- **Polish (Final Phase)**: Depends on all four user stories being complete.

### Within Each User Story

- Tests (marked "write first") MUST be written and FAIL before that story's
  implementation tasks begin.
- Store/hook changes before the components that consume them.
- Story complete and checkpointed before moving to the next priority.

### Parallel Opportunities

- T001 (Phase 1) has no dependencies and can start immediately.
- Within US1: T002, T003, T004 (all tests, different files) can run in
  parallel; T005 can run in parallel with those tests (different file).
- Within US2: T008 (test) has no same-phase dependents to parallelize with;
  T009/T010 are sequential.
- Within US3: T011, T012 (tests) and T013, T014 (implementation) can all run
  in parallel — four different files, no inter-task dependencies beyond T005
  (already complete from US1).
- Within US4: T015, T016, T017 (tests) can run in parallel; T018 can run in
  parallel with those tests; T021 can run in parallel with T019/T020 (depends
  only on T018, different file).
- T023 (lint/typecheck) can run in parallel with T022 (test run).

---

## Parallel Example: User Story 1

```bash
# Tests (different files, run together):
Task: "Write useLineSelectionStore tests in src/hooks/useLineSelectionStore.test.ts"
Task: "Write LogLine component tests in src/components/LogLine.test.tsx"
Task: "Update LogViewer.test.tsx for LogLine-based rendering"

# Store implementation can start alongside the tests above:
Task: "Create src/hooks/useLineSelectionStore.ts"
```

## Parallel Example: User Story 3

```bash
# Tests (different files):
Task: "Update useSearchUiStore.test.ts for selectLine wiring (FR-010)"
Task: "Update SearchResultsPanel.test.tsx for border-selected-line on the active match"

# Implementation (different files, both depend only on US1's T005):
Task: "Wire selectLine into useSearchUiStore's setResults/selectMatch/nextMatch/prevMatch"
Task: "Apply border-selected-line to the active match entry in SearchResultsPanel"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (T001 — theme tokens)
2. Complete Phase 2: User Story 1 (T002-T007)
3. **STOP and VALIDATE**: Click-to-select with blue border works in both the
   normal and "Highlighted only" views; click-and-drag text selection and the
   star toggle are unaffected

### Incremental Delivery

1. Foundational (T001) → Theme tokens ready
2. User Story 1 (T002-T007) → Click-to-select MVP → validate independently
3. User Story 2 (T008-T010) → Ctrl+C line copy → validate independently
4. User Story 3 (T011-T014) → Search-results sync → validate independently
5. User Story 4 (T015-T021) → Keyboard navigation → validate independently
6. Polish (T022-T024) → full-suite test run, lint/typecheck, manual quickstart

### Notes

- All tasks are frontend-only (`src/**`); no `cargo` / `src-tauri/` /
  `src/bindings` changes anywhere in this feature (plan.md, Constitution
  Check row I).
- T007 (the `LogViewer.tsx` refactor) is the task that must bring the file
  back under the 200-line guideline (plan.md Constraints) — verify its line
  count after T007, T010, and T020.
