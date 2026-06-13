# Tasks: Redesigned Search Results UX

**Input**: Design documents from `/specs/004-redesign-search-results-ux/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ipc-commands.md, quickstart.md

**Tests**: MANDATORY per the project constitution (Principle IV — Test-First Quality Gates). Each task that adds or changes behavior is preceded by a failing-test task in the same phase: Vitest + React Testing Library (mocked Tauri IPC) for frontend files, `cargo test` (Tauri mock runtime / in-memory `Connection`) for backend files.

**Organization**: Tasks are grouped by user story (US1–US4, per spec.md priorities) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependency on another task in flight)
- **[Story]**: Maps the task to a user story (US1–US4) for traceability
- All file paths are relative to the repository root

## Path Conventions (from plan.md)

- Frontend: `src/{components,hooks,ipc,pages}` — Tauri v2 + React 19 + TypeScript, existing Vitest/RTL setup
- Backend: `src-tauri/src/{persistence,commands}`, `src-tauri/tests/` — Rust, `cargo test`
- No new top-level directories (plan.md "Structure Decision")

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: N/A — no new dependencies, build configuration, or project structure changes are needed. `zustand` is already declared in `package.json` (research.md §2) and this is its first real usage. Proceed directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Introduce the per-alias `useSearchUiStore` (data-model.md "Frontend-only state") and the two new `LogViewer` props (`scrollToLine`, `searchMatchLines`, research.md §6) that every user story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T001 [P] In `src/hooks/useSearchUiStore.test.ts` (new), write failing tests for the new per-alias Zustand store described in data-model.md "Frontend-only state: `SearchUiState`": (1) two different aliases have independent slices (FR-016) — an action on alias `"a"` does not affect alias `"b"`'s slice; (2) a not-yet-seen alias defaults to `{ query: "", searchType: "logical", timeFrom: null, timeTo: null, results: [], truncated: false, panelOpen: false, currentMatchIndex: -1, scrollNonce: 0 }`; (3) `setResults(alias, results, truncated)` (the "run search" transition) sets `results`/`truncated`, `panelOpen = true`, `currentMatchIndex = results.length > 0 ? 0 : -1`, and increments `scrollNonce`; (4) `selectMatch(alias, i)` sets `currentMatchIndex = i` and increments `scrollNonce`; (5) `nextMatch`/`prevMatch` wrap around per FR-017 (`(i + 1) % results.length` / `(i - 1 + results.length) % results.length`); (6) `closePanel(alias)` sets `panelOpen = false` and leaves `query`, `results`, `currentMatchIndex` unchanged (FR-008); (7) the `searchMatchLines(alias)` selector returns `results.map(r => r.line_index)` when `panelOpen` is true and `[]` otherwise; (8) the `scrollToLine(alias)` selector returns `{ lineIndex, nonce: scrollNonce }` of the current match when `panelOpen && currentMatchIndex >= 0`, and `null` otherwise
- [ ] T002 In `src/hooks/useSearchUiStore.ts` (new), implement the Zustand store from T001: a map of `alias -> SearchUiState` (fields per data-model.md: `query`, `searchType`, `timeFrom`, `timeTo`, `results: SearchMatchEntry[]`, `truncated`, `panelOpen`, `currentMatchIndex`, `scrollNonce`), lazily initialized per alias with the defaults above, plus actions `setQuery`, `setSearchType`, `setTimeRange`, `setResults`, `selectMatch`, `nextMatch`, `prevMatch`, `closePanel`, and the derived selectors `searchMatchLines(alias)` / `scrollToLine(alias)` — all per the transitions in T001 (depends on T001)
- [ ] T003 [P] In `src/components/LogViewer.test.tsx`, add failing tests for two new optional props: `searchMatchLines?: number[]` — lines whose 1-based index is in the array get an additional `bg-search-match` class on their row (combinable with the existing `bg-accent` star-highlight class so both remain visually distinct, per the spec's Assumptions); `scrollToLine?: { lineIndex: number; nonce: number } | null` — when this prop is provided and its `nonce` changes (including re-renders with the same `lineIndex` but a new `nonce`), the virtualizer's `scrollToIndex(lineIndex - 1, { align: "center" })` is called (research.md §6)
- [ ] T004 In `src/App.css`, add a `--search-match` custom property (and `--color-search-match` entry in the `@theme inline` block, alongside `--accent`/`--muted`) per research.md §3 — a gray tone visually distinct from `--accent` in both light and dark mode. In `src/components/LogViewer.tsx`, implement the `searchMatchLines` and `scrollToLine` props from T003: apply `bg-search-match` (via `cn(...)`) to rows whose line index is in `searchMatchLines`, and add an effect that calls `virtualizer.scrollToIndex(scrollToLine.lineIndex - 1, { align: "center" })` whenever `scrollToLine?.nonce` changes (depends on T003)

**Checkpoint**: `useSearchUiStore` and the new `LogViewer` props are ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Jump to a match from the results list (Priority: P1) 🎯 MVP

**Goal**: After a search, a results panel below the search bar lists only the matching lines (no context). Clicking a line scrolls the main log view to reveal it. The panel has a close control (FR-001–FR-004, FR-008).

**Independent Test**: Run a search that returns multiple matches, click any result entry, and verify the main log view scrolls so that line is visible.

### Tests for User Story 1 (MANDATORY per constitution) ⚠️

- [X] T005 [P] [US1] In `src/components/SearchResultsPanel.test.tsx` (new), write failing tests for a `SearchResultsPanel` component: given `results: SearchMatchEntry[]` (`{ line_index, content }`, FR-001) it renders one row per match showing the line number and content (no `before`/`after` context); each row is a `<button>` (or has `role="button"`) that calls an `onSelectMatch(index)` callback when clicked (FR-002/FR-003); when `truncated` is true it shows "Showing the first N matches." (existing wording); when `results` is empty it shows a "no matches" message instead of an empty list (Edge Cases); it renders a close button that calls `onClose` (FR-004)
- [X] T006 [P] [US1] In `src/hooks/useSearch.test.ts`, rewrite the existing tests for the planned `useSearch` changes (research.md §1): running a search now calls the `search` IPC wrapper (not `searchWithContext`), and on each `SearchMatchBatch` it calls `useSearchUiStore.getState().setResults(alias, batch.matches, batch_truncated)` for the active alias, instead of returning `results`/`truncated`/`history` directly from the hook

### Implementation for User Story 1

- [X] T007 [US1] Rewrite `src/hooks/useSearch.ts`: replace the `searchWithContext` call with the `search` IPC wrapper from `src/ipc/search.ts` (research.md §1), and on each streamed `SearchMatchBatch` call `useSearchUiStore`'s `setResults(alias, batch.matches, batch.truncated)`. Drop the hook's own `results`/`truncated`/`history` state (now owned by the store / `useSearchHistory`, the latter added in US4); keep `runSearch`, `isSearching`, and `error` (depends on T002, T006)
- [X] T008 [P] [US1] Create `src/components/SearchResultsPanel.tsx` per T005: reads `results`, `truncated`, and `panelOpen` for `alias` from `useSearchUiStore`, renders the matches-only list (FR-001), wires each row's click to `selectMatch(alias, index)` (FR-002/FR-003), shows the truncation notice, the "no matches" state, and a close button wired to `closePanel(alias)` (FR-004) (depends on T002, T005)
- [X] T009 [US1] In `src/pages/WorkspacePage.tsx`: render `<SearchResultsPanel alias={selectedAlias} />` below `SearchBar` when `useSearchUiStore`'s `panelOpen` is true for `selectedAlias` (FR-016 — only for the *currently selected* alias's slice), and pass `scrollToLine={useSearchUiStore.scrollToLine(selectedAlias) ?? null}` to `LogViewer` (depends on T004, T007, T008)
- [X] T010 [US1] Rewrite `src/components/SearchBar.tsx`: remove the inline `results`/`ContextMatch` list rendering (now `SearchResultsPanel`'s job) and remove the standalone "History" section, `handleHistorySelect`, and the `history` usage from `useSearch` (FR-009 — satisfied early so the file keeps compiling cleanly; US4 adds the new autocomplete/clock-icon replacement). Bind the `query`/`searchType`/time-range inputs to `useSearchUiStore`'s `setQuery`/`setSearchType`/`setTimeRange` for `alias` (so they survive panel close per FR-008) and call the rewritten `useSearch(alias).runSearch` on submit. Keep the existing `toDatetimeLocalValue`/`fromDatetimeLocalValue` helpers for the time-range `<input type="datetime-local">` fields (depends on T002, T007)
- [X] T011 [P] [US1] Update `src/components/SearchBar.test.tsx` and `src/pages/WorkspacePage.test.tsx` for T009/T010: `SearchBar` no longer renders an inline results list or "History" section; `WorkspacePage` renders `SearchResultsPanel` and clicking one of its rows causes `LogViewer` to receive an updated `scrollToLine` prop (depends on T009, T010)

**Checkpoint**: User Story 1 is fully functional and independently testable — a search populates the results panel, and clicking a row scrolls the main view to that line.

---

## Phase 4: User Story 2 - Browse all matches highlighted in the main view (Priority: P2)

**Goal**: While the results panel is open, every matching line in the main view gets a gray `bg-search-match` background, and a header with match count plus prev/next controls (in the results-panel header, FR-006 clarification) steps through matches in line-number order with wrap-around (FR-005–FR-007, FR-017).

**Independent Test**: With the results panel open, verify every matching line in the main log view has a gray background, and that the up/down controls move to the previous/next match (wrapping at the ends).

### Tests for User Story 2 (MANDATORY per constitution) ⚠️

- [X] T012 [P] [US2] Extend `src/components/SearchResultsPanel.test.tsx`: the panel header shows the match count (e.g. "2 of 5") and "previous match"/"next match" buttons next to the close button; clicking "next"/"previous" calls `useSearchUiStore`'s `nextMatch(alias)`/`prevMatch(alias)` (FR-006); from the last match, "next" wraps to the first, and from the first match, "previous" wraps to the last (FR-017)
- [X] T013 [P] [US2] Extend `src/pages/WorkspacePage.test.tsx`: when `panelOpen` is true for `selectedAlias`, `LogViewer` receives a `searchMatchLines` prop equal to `results.map(r => r.line_index)`, resulting in every match line rendering with `bg-search-match` (FR-005), distinct from any `bg-accent` star-highlighted lines (Assumptions)

### Implementation for User Story 2

- [X] T014 [US2] In `src/components/SearchResultsPanel.tsx`, add the header from T012: match count display, and "previous match"/"next match" `<button>`s wired to `useSearchUiStore`'s `prevMatch(alias)`/`nextMatch(alias)` (already implemented in T002, including wrap-around), positioned alongside the existing close button (FR-006 clarification: header area, like a browser find-in-page bar) (depends on T008, T012)
- [X] T015 [US2] In `src/pages/WorkspacePage.tsx`, pass `searchMatchLines={useSearchUiStore.searchMatchLines(selectedAlias)}` to `LogViewer` from T009 (depends on T004, T009, T013)

**Checkpoint**: User Stories 1 AND 2 both work independently — the results panel shows match count + prev/next controls, and every match line is gray-highlighted in the main view while the panel is open.

---

## Phase 5: User Story 3 - Close the results panel (Priority: P2)

**Goal**: Closing the results panel hides it, removes the gray match highlighting and prev/next controls from the main view, and leaves the search query in the search field (FR-007/FR-008).

**Independent Test**: With a search active and the results panel open, click the close control and verify the panel disappears, the gray highlighting is removed from the main view, the prev/next controls disappear, and the search field still shows the query.

### Tests for User Story 3 (MANDATORY per constitution) ⚠️

- [X] T016 [P] [US3] Extend `src/pages/WorkspacePage.test.tsx` and `src/components/SearchResultsPanel.test.tsx`: clicking the close button (from T008/T014) sets `panelOpen = false` for `alias`, after which `SearchResultsPanel` (and its prev/next controls) is no longer rendered, `LogViewer` no longer receives a non-empty `searchMatchLines` or a non-null `scrollToLine` (FR-007), and `SearchBar`'s query input still shows the previously entered query (FR-008)

### Implementation for User Story 3

- [X] T017 [US3] Verify T009/T015's conditionals in `src/pages/WorkspacePage.tsx` correctly gate `SearchResultsPanel` rendering and the `searchMatchLines`/`scrollToLine` props passed to `LogViewer` on `panelOpen` (so closing — already wired to `closePanel` via T008/T014 — removes all three per FR-007), and that `closePanel` (T002) never clears `query`/`results` (FR-008). Adjust `WorkspacePage.tsx` if T016 finds any gap (depends on T014, T015, T016)

**Checkpoint**: All of US1–US3 are independently functional — results panel, gray highlighting/navigation, and close-to-dismiss all work together.

---

## Phase 6: User Story 4 - Reuse recent and past searches (Priority: P3)

**Goal**: The standalone "History" section is gone (already done in T010/FR-009). The search field offers autocomplete suggestions from the workspace's full search history (filtered, most-recent-first, capped at 5, FR-010) and a clock icon opens a scrollable overlay of every search made in the workspace (FR-011/FR-012). History is now stored per-workspace (not per-file), deduplicated, persisted across restarts, with existing per-file history migrated on upgrade (FR-013/FR-014/FR-019).

**Independent Test**: Perform several searches, reload/restart the app, then verify the 5 most recent searches appear as suggestions and the clock icon opens an overlay listing all past searches for the workspace.

### Backend: schema, repo, command tests (MANDATORY per constitution) ⚠️

- [X] T018 [P] [US4] In `src-tauri/src/persistence/schema.rs`'s `#[cfg(test)]` module, add failing tests for the migration in data-model.md "Migration (FR-019)": starting from a connection with the *old* `search_history_entries` schema (`file_id`-based, no `last_used_at`/`UNIQUE` dedup index) populated with rows — including two rows that should dedup into one — running `migrate` produces a `search_history_entries` table with columns `id, workspace_id, query, search_type, time_from, time_to, last_used_at`, a `UNIQUE` index on `(workspace_id, query, search_type, COALESCE(time_from, <sentinel>), COALESCE(time_to, <sentinel>))`, each migrated row's `workspace_id` resolved via the old row's `log_file_entries.workspace_id`, duplicate `(workspace_id, query, search_type, time_from, time_to)` groups collapsed into one row with `last_used_at = MAX(executed_at)` of the group, and the old table dropped
- [X] T019 [P] [US4] In `src-tauri/src/persistence/repo/search_history.rs`'s `#[cfg(test)]` module, rewrite `record_and_list` and add new tests for: `record(conn, workspace_id, query, search_type, time_from, time_to)` inserting a new row when no matching `(workspace_id, query, search_type, time_from, time_to)` exists; calling `record` again with the same key updates that row's `last_used_at` (to "now") instead of inserting a duplicate (FR-010/FR-012 dedup); `list_for_workspace(conn, workspace_id)` returns rows ordered by `last_used_at DESC`, most-recently-updated first
- [X] T020 [P] [US4] In `src-tauri/tests/search_test.rs`, update `search_logical_streams_matching_lines_and_records_history` and `search_with_context_returns_surrounding_lines_and_records_history` to assert `history[0].workspace_id` (not `file_id`) equals the active workspace's id, and add a test calling `search::get_search_history(state.clone())` with **no** `alias` argument, returning the active workspace's history regardless of which file's `search`/`search_with_context` recorded it (FR-013)

### Backend: schema, repo, command implementation

- [X] T021 [US4] In `src-tauri/src/persistence/schema.rs`, change the `search_history_entries` table definition to `(id, workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, query, search_type, time_from, time_to, last_used_at)` with the `UNIQUE` dedup index from data-model.md, and add the one-time migration (detect the old `file_id`-based table via `PRAGMA table_info`, resolve `workspace_id` per row via `log_file_entries`, group/dedup, insert into the new table with `last_used_at = MAX(executed_at)`, drop the old table) so T018 passes (depends on T018)
- [X] T022 [US4] In `src-tauri/src/persistence/repo/search_history.rs`, replace `record`/`list_for_file` with `record(conn, workspace_id, query, search_type, time_from, time_to)` (using `INSERT ... ON CONFLICT (...) DO UPDATE SET last_used_at = excluded.last_used_at` on the new dedup index, mirroring `persistence::repo::settings::set_mcp_port`'s upsert pattern) and `list_for_workspace(conn, workspace_id) -> Vec<SearchHistoryEntry>` (ordered by `last_used_at DESC`), updating `row_to_entry`/`SearchHistoryEntry` for the new columns, so T019 passes (depends on T019, T021)
- [X] T023 [US4] In `src-tauri/src/commands/types.rs`, change `SearchHistoryEntry` to `{ id: i32, workspace_id: i32, query: String, search_type: SearchType, time_from: Option<f64>, time_to: Option<f64>, last_used_at: String }` (was `file_id`/`executed_at`) (depends on T022)
- [X] T024 [US4] In `src-tauri/src/commands/search.rs`: change both `search` and `search_with_context`'s calls to `search_history::record` to pass `*state.active_workspace_id.lock().unwrap()` instead of `runtime.file_id`; change `get_search_history` to drop its `alias: String` parameter entirely and call `search_history::list_for_workspace(&db, *state.active_workspace_id.lock().unwrap())`, mapping to the new `SearchHistoryEntry` shape (`workspace_id`/`last_used_at`), so T020 passes (depends on T020, T023)
- [X] T025 [US4] Run `cargo test export_typescript_bindings` (from `src-tauri/`, per `src-tauri/tests/export_bindings.rs`) to regenerate `src/bindings/index.ts` with the new `SearchHistoryEntry` shape and `get_search_history`'s no-argument signature (depends on T024)

### Frontend: history hook, overlay, store, search bar — tests (MANDATORY per constitution) ⚠️

- [X] T026 [P] [US4] Update `src/ipc/search.ts`: change `getSearchHistory()` to take no arguments (matching the regenerated `commands.getSearchHistory()` from T025) and re-export the updated `SearchHistoryEntry` type (`workspace_id`/`last_used_at`) (depends on T025)
- [X] T027 [P] [US4] In `src/hooks/useSearchHistory.test.ts` (new), write failing tests for a `useSearchHistory()` hook: it fetches the workspace's history via `getSearchHistory()` with TanStack Query (cached, no params per FR-013); a `suggestions(queryText)` selector returns, most-recent-first, up to 5 entries whose `query` contains `queryText` as a substring (or the 5 most-recent entries when `queryText` is empty), per FR-010
- [X] T028 [US4] Implement `src/hooks/useSearchHistory.ts` per T027: a `useQuery` wrapper around `getSearchHistory()` (e.g. `queryKey: ["searchHistory"]`), exposing `history: SearchHistoryEntry[]`, `isLoading`, and a `suggestions(queryText: string): SearchHistoryEntry[]` selector implementing FR-010's filter/sort/cap rules (depends on T026, T027)
- [X] T029 [P] [US4] In `src/components/SearchHistoryOverlay.test.tsx` (new), write failing tests for a `SearchHistoryOverlay` component built on `@radix-ui/react-dialog` (consistent with existing dialog usage): given `entries: SearchHistoryEntry[]` it renders a scrollable list, most-recent-first (FR-012); when `entries` is empty it shows a "nothing to show yet" message (Edge Cases); clicking an entry calls an `onSelect(entry)` callback (FR-018)
- [X] T030 [US4] Implement `src/components/SearchHistoryOverlay.tsx` per T029: a Radix `Dialog` containing the scrollable, most-recent-first list from `useSearchHistory().history`, the empty state, and `onSelect(entry)` wiring (depends on T028, T029)
- [X] T031 [P] [US4] Extend `src/hooks/useSearchUiStore.test.ts`: a new `applyHistoryEntry(alias, entry)` action sets `query`, `searchType`, `timeFrom`, `timeTo` from `entry` and then performs the same transition as `setResults` would after a search runs (FR-018) — i.e. it's the entry point the UI calls before re-invoking `runSearch`
- [X] T032 [US4] In `src/hooks/useSearchUiStore.ts`, implement `applyHistoryEntry(alias, entry)` from T031: sets `query = entry.query`, `searchType = entry.search_type`, `timeFrom = entry.time_from`, `timeTo = entry.time_to` for `alias`'s slice (depends on T002, T031)
- [X] T033 [P] [US4] Extend `src/components/SearchBar.test.tsx`: an autocomplete combobox (using `role="combobox"`/`role="listbox"`/`role="option"` ARIA roles per Principle V) shows up to 5 suggestions from `useSearchHistory().suggestions(query)` — the 5 most recent when the field is empty, filtered as the user types (FR-010); a clock-icon `<button>` is rendered to the right of the search field (FR-011) and clicking it opens `SearchHistoryOverlay`; selecting a suggestion or an overlay entry calls `applyHistoryEntry` and immediately re-runs the search (FR-018); an empty-history state is shown when there are no suggestions/overlay entries yet (Edge Cases)

### Frontend: history hook, overlay, store, search bar — implementation

- [X] T034 [US4] In `src/components/SearchBar.tsx`: add the autocomplete combobox (ARIA `combobox`/`listbox`/`option`) backed by `useSearchHistory().suggestions(query)` (FR-010); add a clock-icon `<button>` (e.g. `lucide-react`'s `Clock`, matching the `FolderOpen`/`Settings` icon-button pattern already used in `WorkspacePage.tsx`/`AppToolbar.tsx`) to the right of the search field that opens `SearchHistoryOverlay` (FR-011); wire both the suggestion list and the overlay's `onSelect` to `useSearchUiStore`'s `applyHistoryEntry(alias, entry)` followed immediately by `runSearch(entry.query, entry.search_type, entry.time_from, entry.time_to)` (FR-018), so T033 passes (depends on T030, T032, T033)

**Checkpoint**: All four user stories are independently functional — search history is workspace-scoped, persisted, deduplicated, migrated from the old per-file format, and surfaced via autocomplete + the history overlay.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all user stories (Principle IV quality gates, quickstart.md).

- [X] T035 [P] Run `cargo fmt --check` and `cargo clippy -- -D warnings` from `src-tauri/`
- [X] T036 [P] Run `pnpm exec tsc --noEmit` and `pnpm exec eslint .`
- [X] T037 Run `pnpm test` (Vitest, all new/updated component and hook tests) and `cargo test` (full suite, including the migration, repo, and `search_test.rs` changes) to confirm everything passes
- [ ] T038 Run the `quickstart.md` manual verification steps for US1–US4, the file-switch isolation check (FR-016), and the pre-upgrade-database migration check (FR-019) against `pnpm tauri dev`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No tasks — nothing to do
- **Foundational (Phase 2)**: No dependency on Setup; BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (T002, T004) — no dependency on other stories
- **User Story 2 (Phase 4)**: Depends on Foundational (T002, T004) and on US1's `SearchResultsPanel`/`WorkspacePage` edits (T008, T009)
- **User Story 3 (Phase 5)**: Depends on US1 (T008, T009) and US2 (T014, T015) — adds verification/gap-fix only
- **User Story 4 (Phase 6)**: Depends on Foundational (T002) and on US1's `SearchBar.tsx` rewrite (T010), which already removed the old "History" section
- **Polish (Phase 7)**: Depends on all four user stories being complete

### Within Each User Story

- Tests are written and expected to fail before implementation
- Foundational store/selectors before components that consume them
- Backend schema → repo → command-layer → bindings regeneration, before any frontend code in US4 depends on the new IPC shape
- Story complete before moving to the next priority

### Parallel Opportunities

- T001 and T003 (Foundational tests, different files) can run in parallel
- T005 and T006 (US1 tests, different files) can run in parallel
- T008 and T007 can proceed in parallel once T002/T005/T006 are done (different files)
- T012 and T013 (US2 tests, different files) can run in parallel
- T018, T019, and T020 (US4 backend tests, different files) can run in parallel
- T026, T027, T029, T031 (US4 frontend tests/ipc update, different files) can largely run in parallel once T025 lands
- T035 and T036 (Polish) can run in parallel

---

## Parallel Example: User Story 4 backend tests

```bash
# Launch all three US4 backend test tasks together:
Task: "Migration tests in src-tauri/src/persistence/schema.rs"
Task: "record/list_for_workspace dedup tests in src-tauri/src/persistence/repo/search_history.rs"
Task: "Workspace-scoped history tests in src-tauri/tests/search_test.rs"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
2. Complete Phase 3: User Story 1
3. **STOP and VALIDATE**: Run a search, click a result row, confirm the main view scrolls to it
4. Deploy/demo if ready — this alone delivers the redesign's core value

### Incremental Delivery

1. Complete Foundational → `useSearchUiStore` + `LogViewer` props ready
2. Add User Story 1 → Validate independently → Demo (MVP!)
3. Add User Story 2 → Validate independently (gray highlighting + prev/next + wrap) → Demo
4. Add User Story 3 → Validate independently (close removes highlighting/nav, keeps query) → Demo
5. Add User Story 4 → Validate independently (autocomplete, history overlay, persistence, migration) → Demo
6. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- FR-009 ("History" section removed) is satisfied early, during US1's `SearchBar.tsx` rewrite (T010), to keep the file compiling cleanly across phases — US4 then adds the autocomplete/clock-icon/overlay replacement on top of that already-cleaned component
