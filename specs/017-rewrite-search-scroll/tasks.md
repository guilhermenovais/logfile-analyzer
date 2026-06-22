# Tasks: Rewrite Search-to-Scroll Navigation

**Input**: Design documents from `/specs/017-rewrite-search-scroll/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are MANDATORY per the project constitution (Test-First Quality Gates). Write tests for each user story before implementing it, and ensure they fail before implementation begins.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Verify dev environment and existing codebase state before making changes

- [x] T001 Verify dev environment builds cleanly: run `pnpm install`, `pnpm tauri dev` (confirm specta generates bindings), and all quality gates (`npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `cargo clippy -- -D warnings`, `cargo fmt --check`, `cargo test`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend IPC command and frontend wrapper that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Implement `resolve_view_row` Tauri command in `src-tauri/src/commands/viewing.rs` — accepts `alias: String` and `line_index: u32`, returns `Result<u32>` using binary search on `FileRuntime.view_filter` per contract `contracts/resolve-view-row.md`
- [x] T003 Register `viewing::resolve_view_row` in `specta_builder()` invoke handler chain in `src-tauri/src/lib.rs`
- [x] T004 Add unit tests for `resolve_view_row` in `src-tauri/src/commands/viewing.rs` inline `#[cfg(test)]` module — cover: identity mapping (no filter), correct view-row with filter active, `LineOutOfRange` error when line not in filter
- [x] T005 Run `pnpm tauri dev` to regenerate specta bindings in `src/bindings/index.ts` — verify `resolveViewRow` appears in generated commands
- [x] T006 Add `resolveViewRow` IPC wrapper function in `src/ipc/viewing.ts` — typed `(alias: string, lineIndex: number) => Promise<number>`, alongside existing `streamLines` and `setViewTimeRange`

**Checkpoint**: Backend command tested, IPC wrapper ready — user story implementation can begin

---

## Phase 3: User Story 1 — Click Search Result Scrolls to Correct Line (Priority: P1) MVP

**Goal**: Clicking any search result reliably scrolls the log viewer to the correct line, centered in the viewport, regardless of distance from current position

**Independent Test**: Perform a search, click results at varying distances (near, far, extreme ends of a 100K+ line file), verify target line is visible and centered each time

### Tests for User Story 1 (MANDATORY per constitution)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T007 [US1] Write hook tests in `src/hooks/useScrollToLine.test.ts` — cover: resolves view row via IPC and calls `scrollToIndex` with correct 0-based index and `align: "center"`, correction pass fires after `requestAnimationFrame`, cancellation via generation counter on rapid successive calls, re-scroll on same line with new nonce
- [x] T008 [US1] Write/update component tests in `src/components/LogViewer.test.tsx` — cover: clicking a search result triggers scroll via `useScrollToLine` (not old effect), old `scrollToLine` effect logic is removed

### Implementation for User Story 1

- [x] T009 [US1] Create `useScrollToLine` hook in `src/hooks/useScrollToLine.ts` — accepts `alias`, `virtualizer`, `scrollTarget`, `totalLines`; implements two-pass scroll with generation counter for cancellation per `data-model.md` section 3
- [x] T010 [US1] Integrate `useScrollToLine` into `src/components/LogViewer.tsx` — replace the existing `scrollToLine` effect (lines ~167-178) with a call to `useScrollToLine`, passing the required arguments from existing component state
- [x] T011 [US1] Remove the old `scrollToLine` effect body from `src/components/LogViewer.tsx` — ensure `findViewRow` function is preserved (still used by `navNonce` effect for arrow navigation)
- [x] T012 [US1] Run all quality gates: `npx tsc --noEmit`, `npx vitest run`, `cargo test`, `cargo clippy -- -D warnings`

**Checkpoint**: Clicking any search result scrolls to the correct line. US1 is fully functional and independently testable.

---

## Phase 4: User Story 2 — Navigation Arrows Scroll Correctly (Priority: P2)

**Goal**: Next/previous match arrow navigation reliably scrolls to each match, including when consecutive matches are thousands of lines apart

**Independent Test**: Search with multiple results spread across the file, press next/previous arrows repeatedly, verify each navigation scrolls to the correct line including wrap-around

### Tests for User Story 2 (MANDATORY per constitution)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T013 [US2] Write/update tests in `src/components/LogViewer.test.tsx` for arrow navigation — cover: `navNonce` effect scrolls to correct line when next match is far from viewport, wrap-around from last match to first and vice versa

### Implementation for User Story 2

- [x] T014 [US2] Evaluate the existing `navNonce` effect in `src/components/LogViewer.tsx` (lines ~181-194) — if the target match is always near the viewport (already loaded), confirm `findViewRow` path is sufficient; if distant matches are possible, update effect to use `resolveViewRow` IPC and two-pass scroll
- [x] T015 [US2] If changes are needed to the `navNonce` effect, implement them in `src/components/LogViewer.tsx` — ensure arrow navigation triggers the same reliable scroll mechanism as click-to-scroll
- [x] T016 [US2] Run all quality gates: `npx tsc --noEmit`, `npx vitest run`, `cargo test`

**Checkpoint**: Arrow navigation works reliably for all match distances. US1 and US2 both independently functional.

---

## Phase 5: User Story 3 — Scroll Works with Filtered Views (Priority: P3)

**Goal**: Search-result click-to-scroll works correctly when a time-range filter is active and visible row positions differ from file line numbers

**Independent Test**: Apply a time-range filter, perform a search, click results, verify the correct filtered-view line is displayed

### Tests for User Story 3 (MANDATORY per constitution)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T017 [US3] Add test cases in `src/hooks/useScrollToLine.test.ts` for filtered-view scrolling — cover: `resolveViewRow` returns a view-row different from the file line index, hook uses the view-row (not line index) for `scrollToIndex`
- [x] T018 [US3] Add test cases in `src/components/LogViewer.test.tsx` for filtered-view scrolling — cover: with filter active, clicking a search result passes correct alias and line index to the scroll mechanism

### Implementation for User Story 3

- [x] T019 [US3] Verify that `useScrollToLine` in `src/hooks/useScrollToLine.ts` correctly uses the resolved view-row from `resolveViewRow` IPC (not the raw file line index) — fix if any code path bypasses the IPC resolution
- [x] T020 [US3] Run all quality gates: `npx tsc --noEmit`, `npx vitest run`, `cargo test`

**Checkpoint**: Scroll-to-line works correctly under time-range filters. US1, US2, and US3 all independently functional.

---

## Phase 6: User Story 4 — Scroll Works with Line Wrapping Enabled (Priority: P3)

**Goal**: Search-result click-to-scroll works correctly when line wrapping is enabled and rows have variable heights

**Independent Test**: Enable line wrapping on a file with long lines, search, click results 5,000+ lines away, verify accurate scrolling without offset errors

### Tests for User Story 4 (MANDATORY per constitution)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T021 [US4] Add test cases in `src/hooks/useScrollToLine.test.ts` for variable-height scrolling — cover: the correction pass (second `scrollToIndex` after `requestAnimationFrame`) fires and re-scrolls to the same index

### Implementation for User Story 4

- [x] T022 [US4] Verify that the two-pass scroll mechanism in `src/hooks/useScrollToLine.ts` performs the correction pass via `requestAnimationFrame` — confirm the second `scrollToIndex` call uses measured row heights rather than estimated ones
- [x] T023 [US4] Run all quality gates: `npx tsc --noEmit`, `npx vitest run`, `cargo test`

**Checkpoint**: Scroll-to-line works correctly with line wrapping. All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all combinations and quality assurance

- [x] T024 [P] Run full backend quality gates: `cargo clippy -- -D warnings`, `cargo fmt --check`, `cargo test`
- [x] T025 [P] Run full frontend quality gates: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`
- [x] T026 Manual validation per `quickstart.md` section "Testing the Fix": open 100K+ line file, search, click distant results, enable time-range filter and repeat, enable line wrapping and repeat, rapid-click different results
- [x] T027 Verify no regressions in existing features: line selection highlighting, search match background highlighting, keyboard arrow-key navigation, search history, `viewVersion` reset on filter change, `wrap` re-measure

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phases 3-6)**: All depend on Foundational phase completion
  - US1 (Phase 3) should be completed first as MVP
  - US2 (Phase 4) can start after Foundational, but benefits from US1 completion
  - US3 (Phase 5) can start after Foundational, independent of other stories
  - US4 (Phase 6) can start after Foundational, independent of other stories
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — no dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) — may reuse `useScrollToLine` from US1 if navNonce effect needs updating
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) — independent, tests the IPC path
- **User Story 4 (P3)**: Can start after Foundational (Phase 2) — independent, tests the correction pass

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- IPC/model layer before hook/service layer
- Hook before component integration
- Core implementation before cross-story verification
- Story complete before moving to next priority

### Parallel Opportunities

- T002 and T004 can run in parallel (command impl + tests in same file, but logically separable)
- T007 and T008 (US1 tests) can run in parallel (different files)
- T013, T017, T021 (tests for US2, US3, US4) can each start after Phase 2
- T024 and T025 (final quality gates) can run in parallel

---

## Parallel Example: Foundational Phase

```bash
# After T002 (command implementation):
Task T003: "Register resolve_view_row in lib.rs"
Task T004: "Unit tests for resolve_view_row"

# After T005 (bindings generated):
Task T006: "Add resolveViewRow IPC wrapper"
```

## Parallel Example: User Story 1

```bash
# Tests first (can run in parallel):
Task T007: "Hook tests in src/hooks/useScrollToLine.test.ts"
Task T008: "Component tests in src/components/LogViewer.test.tsx"

# Implementation (sequential within story):
Task T009: "Create useScrollToLine hook"
Task T010: "Integrate into LogViewer"
Task T011: "Remove old scroll effect"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup verification
2. Complete Phase 2: Foundational (backend command + IPC wrapper)
3. Complete Phase 3: User Story 1 (core scroll rewrite)
4. **STOP and VALIDATE**: Test click-to-scroll independently with large files
5. This alone fixes the primary broken feature

### Incremental Delivery

1. Complete Setup + Foundational -> Backend ready
2. Add User Story 1 -> Click-to-scroll works (MVP!)
3. Add User Story 2 -> Arrow navigation verified/fixed
4. Add User Story 3 -> Filtered-view scroll verified
5. Add User Story 4 -> Line-wrapping scroll verified
6. Each story adds confidence without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- The `useScrollToLine` hook is the core deliverable — it addresses US1, US3, and US4 in one mechanism
- US2 may not require code changes if `navNonce` effect already handles distant matches correctly — T014 evaluates this
- Specta binding regeneration (T005) requires running `pnpm tauri dev` — must happen before frontend work
- `findViewRow` in LogViewer.tsx is preserved for the `navNonce` effect even after removing the old scroll effect
