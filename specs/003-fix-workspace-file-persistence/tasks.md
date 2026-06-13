# Tasks: Workspace and Log File Session Restore

**Input**: Design documents from `/specs/003-fix-workspace-file-persistence/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: MANDATORY per the project constitution (Principle IV — Test-First Quality Gates). Each user story phase writes failing `cargo test` coverage first (Tauri mock runtime + in-memory `Connection`, per `src-tauri/tests/workspace_persistence_test.rs`'s existing `mock_app()` pattern), then implements until they pass.

**Organization**: Tasks are grouped by user story (US1–US3, per spec.md priorities) to enable independent implementation and testing of each story. This is a backend-only fix — no frontend files change (plan.md "Project Structure").

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependency on another task in flight)
- **[Story]**: Maps the task to a user story (US1–US3) for traceability
- All file paths are relative to the repository root

## Path Conventions (from plan.md)

- Backend only: `src-tauri/src/{lib.rs,commands/workspace.rs,persistence/repo/settings.rs}`, `src-tauri/tests/workspace_persistence_test.rs`
- No `contracts/` directory and no new/changed Tauri commands — `get_active_workspace`'s response shape is unchanged

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: N/A — no new dependencies, build configuration, or project structure changes are needed (plan.md Technical Context: "Existing stack only ... no new dependencies"). Proceed directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extract the per-file load/availability loop currently inside `open_workspace` into a shared helper so both `open_workspace` and `setup()` use the exact same logic (research.md §4, data-model.md "Session file load").

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T001 In `src-tauri/src/commands/workspace.rs`, extract the per-entry loop inside `open_workspace` (the `for entry in entries { ... }` block that opens the mmap, builds a `FileRuntime`, inserts into `state.files`, spawns `index_and_detect_timestamps`, and builds each `LogFileSummary`) into a new `pub fn load_workspace_files(state: &Arc<AppState>, entries: Vec<LogFileEntry>) -> Vec<LogFileSummary>`. Update `open_workspace` to call `load_workspace_files(&state, entries)` after setting `active_workspace_id` and clearing `state.files`, and to use its return value as `summaries`. No behavior change — the existing test `open_workspace_marks_missing_files_unavailable_and_loads_available_ones` in `src-tauri/tests/workspace_persistence_test.rs` must continue to pass unchanged.

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Unsaved workspace files survive a restart (Priority: P1) 🎯 MVP

**Goal**: On startup, the active workspace's files (today always the draft, via `get_or_create_draft`) are loaded into `state.files` through `load_workspace_files`, so files still present on disk no longer show as `FileUnavailable` after a restart (FR-001/FR-002).

**Independent Test**: Open the app, add one or more log files without saving the workspace, close the app, reopen it, and confirm the files are loaded and readable without any "file unavailable" indicator.

### Tests for User Story 1 (MANDATORY per constitution) ⚠️

- [X] T002 [P] [US1] In `src-tauri/tests/workspace_persistence_test.rs`, add tests that simulate startup restore by building an `AppState` whose `state.files` is empty (mirroring `setup()` right after `AppState::new`) and calling `workspace::load_workspace_files(&state, entries)` with `entries` from `log_file_entry::list_for_workspace`: (1) all referenced files present on disk → every entry is inserted into `state.files` and every returned `LogFileSummary.available == true`; (2) one of two files missing → the present file is inserted into `state.files` and `available == true`, the missing file is absent from `state.files` but still returned with `available == false`; (3) all referenced files missing → `state.files` stays empty, all returned summaries have `available == false`, and the call does not error (FR-001/FR-002/FR-008)

### Implementation for User Story 1

- [X] T003 [US1] In `src-tauri/src/lib.rs` `setup()`, after `let state = Arc::new(AppState::new(db, active_workspace.id));`, fetch `persistence::repo::log_file_entry::list_for_workspace(&db, active_workspace.id)` (reusing the already-open `db` Connection before it moves into `AppState::new`, or re-locking `state.db` afterward) and call `commands::workspace::load_workspace_files(&state, entries)`, before `app.manage(state)` and before starting the MCP server (depends on T001, T002)

**Checkpoint**: User Story 1 is fully functional and independently testable — files added to the draft workspace survive a full app restart with no `FileUnavailable` indicator.

---

## Phase 4: User Story 2 - Application reopens to the last active saved workspace (Priority: P2)

**Goal**: The id of the workspace active at the moment the app closes is persisted (`app_settings.last_active_workspace_id`) and used on the next startup to restore that exact workspace (draft or saved), falling back to the draft if it no longer exists or was never recorded (FR-003/FR-004/FR-006/FR-009).

**Independent Test**: Open (or create and save) a named workspace containing at least one log file, close the application while that workspace is active, reopen the application, and confirm it opens directly into that same saved workspace with its files loaded.

### Tests for User Story 2 (MANDATORY per constitution) ⚠️

- [X] T004 [P] [US2] In `src-tauri/src/persistence/repo/settings.rs`, add unit tests for `get_last_active_workspace`/`set_last_active_workspace` mirroring the existing `mcp_port` tests: returns `None` when the `last_active_workspace_id` key is absent; set-then-get returns the persisted id; a second `set` overwrites the previous id
- [X] T005 [P] [US2] In `src-tauri/tests/workspace_persistence_test.rs`, add tests for `resolve_startup_workspace(db)`: (1) when `last_active_workspace_id` refers to an existing saved workspace, returns that workspace; (2) when it refers to an existing draft workspace, returns the draft; (3) when it refers to a workspace id that no longer exists (deleted between sessions), falls back to `get_or_create_draft` (FR-006); (4) when no `last_active_workspace_id` row exists, falls back to `get_or_create_draft` (FR-009); (5) across five repeated `set_last_active_workspace` + `resolve_startup_workspace` round trips for the same saved workspace id, each call returns that same workspace (FR-007/SC-003)

### Implementation for User Story 2

- [X] T006 [US2] In `src-tauri/src/persistence/repo/settings.rs`, add `get_last_active_workspace(conn: &Connection) -> Result<Option<i64>>` and `set_last_active_workspace(conn: &Connection, workspace_id: i64) -> Result<()>` for a new `last_active_workspace_id` key in `app_settings`, using the same `INSERT ... ON CONFLICT (key) DO UPDATE` upsert pattern as `set_mcp_port` (depends on T004)
- [X] T007 [US2] In `src-tauri/src/commands/workspace.rs`, add `pub fn resolve_startup_workspace(db: &Connection) -> Result<workspace::Workspace>` per research.md §3: read `get_last_active_workspace(db)`; if `Some(id)` and `workspace::get(db, id)` returns `Some(ws)`, return `ws`; otherwise return `workspace::get_or_create_draft(db)` (depends on T005, T006)
- [X] T008 [US2] In `src-tauri/src/lib.rs` `setup()`, replace `persistence::repo::workspace::get_or_create_draft(&db)` with `commands::workspace::resolve_startup_workspace(&db)` so the restored workspace (draft or saved) becomes `active_workspace` (depends on T003, T007)
- [X] T009 [US2] In `src-tauri/src/lib.rs`'s `.run(|app_handle, event| { ... })` closure, on `tauri::RunEvent::Exit`, read `*state.active_workspace_id.lock().unwrap()` from the managed `Arc<AppState>` and call `persistence::repo::settings::set_last_active_workspace(&state.db.lock().unwrap(), id)`, alongside the existing MCP shutdown logic (depends on T006)

**Checkpoint**: User Stories 1 AND 2 both work independently — the app restores the exact workspace (draft or saved) that was active at last close, with its files loaded, falling back safely if that workspace was deleted.

---

## Phase 5: User Story 3 - Missing files don't block restoring the rest of a workspace (Priority: P3)

**Goal**: Confirm that startup restore of a *saved* workspace (US2's path) handles missing files the same way `open_workspace` already does — only the missing file(s) are flagged unavailable, and the workspace still opens even if every file is missing (FR-008/SC-004). The draft-workspace case is already covered by T002; this phase extends that coverage to saved workspaces restored via `resolve_startup_workspace` + `load_workspace_files`.

**Independent Test**: Add two log files to a workspace, delete or move one of the files on disk, close and reopen the application, and confirm the workspace loads with the remaining file fully accessible and the missing file clearly marked as unavailable (without an application error).

### Tests for User Story 3 (MANDATORY per constitution) ⚠️

- [X] T010 [US3] In `src-tauri/tests/workspace_persistence_test.rs`, add tests that simulate startup restore of a *saved* workspace (via `resolve_startup_workspace` followed by `load_workspace_files` on its entries): (1) one of two referenced files has been deleted from disk → the workspace resolves successfully, the present file is loaded with `available == true`, the missing file is returned with `available == false` (Acceptance Scenario 1); (2) both referenced files have been deleted → the workspace still resolves successfully and both summaries have `available == false`, with no error (Acceptance Scenario 2) (depends on T001, T007)

**Checkpoint**: All three user stories are independently functional — restart restores the correct workspace and files for both draft and saved workspaces, with missing files degrading gracefully rather than blocking the restore.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all user stories.

- [X] T011 [P] Run `cargo fmt --check` and `cargo clippy -- -D warnings` for the `src-tauri` crate
- [X] T012 [P] Run `cargo test -p logfile-analyzer` (full suite, including `workspace_persistence_test.rs` and `persistence::repo::settings` unit tests) to confirm all new and existing tests pass
- [ ] T013 Run the quickstart.md manual verification steps for US1–US3 (plus the "Deleted last active saved workspace", "First-ever launch", and "Repeated empty restarts" edge cases) against `pnpm tauri dev`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No tasks — nothing to do
- **Foundational (Phase 2)**: No dependency on Setup; BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (T001) — no dependency on other stories
- **User Story 2 (Phase 4)**: Depends on Foundational (T001) and on US1's `setup()` edit (T003), which T008 further modifies
- **User Story 3 (Phase 5)**: Depends on Foundational (T001) and on `resolve_startup_workspace` (T007) — adds test coverage only, no new implementation
- **Polish (Phase 6)**: Depends on all three user stories being complete

### Within Each User Story

- Tests are written and expected to fail before implementation
- Repo layer (`persistence::repo::settings`) before command-layer helpers (`commands::workspace`) before `lib.rs` wiring
- Story complete before moving to the next priority

### Parallel Opportunities

- T002 (US1 tests) can be written in parallel with T001 (Foundational) but must pass only after T001 lands
- T004 and T005 (US2 tests) can run in parallel — different files
- T011 and T012 (Polish) can run in parallel

---

## Parallel Example: User Story 2

```bash
# Launch both US2 test tasks together:
Task: "Unit tests for get_last_active_workspace/set_last_active_workspace in src-tauri/src/persistence/repo/settings.rs"
Task: "Integration tests for resolve_startup_workspace in src-tauri/tests/workspace_persistence_test.rs"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
2. Complete Phase 3: User Story 1
3. **STOP and VALIDATE**: Run the US1 quickstart steps independently — a full restart no longer shows `FileUnavailable` for draft-workspace files
4. Deploy/demo if ready — this alone fixes the most common reported symptom

### Incremental Delivery

1. Complete Foundational → Foundation ready
2. Add User Story 1 → Validate independently → Demo (MVP!)
3. Add User Story 2 → Validate independently (restart returns to the last active saved workspace) → Demo
4. Add User Story 3 → Validate independently (missing-file handling on restore) → Demo
5. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
