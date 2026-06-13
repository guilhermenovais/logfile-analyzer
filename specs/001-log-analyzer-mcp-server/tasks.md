# Tasks: Log Analyzer Desktop App with MCP Server

**Input**: Design documents from `/specs/001-log-analyzer-mcp-server/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mcp-tools.md, contracts/ipc-commands.md

**Tests**: MANDATORY per the project constitution (Principle IV — Test-First Quality Gates). Each user story phase below writes failing tests first (`cargo test` with Tauri mock runtime for backend, Vitest + RTL with mocked IPC for frontend), then implements until they pass.

**Organization**: Tasks are grouped by user story (US1–US6, per spec.md priorities) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependency on another task in flight)
- **[Story]**: Maps the task to a user story (US1–US6) for traceability
- All file paths are relative to the repository root and match the structure in `plan.md`

## Path Conventions (from plan.md)

- Frontend: `src/{app,pages,components,hooks,ipc,bindings,lib}/`
- Backend: `src-tauri/src/{commands,logfile,mcp,persistence}/`, `src-tauri/tests/`, `src-tauri/capabilities/`
- `line_index` is **1-based** everywhere (IPC and MCP)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bring the existing Tauri scaffold's dependencies, tooling, and config up to what every later phase needs.

- [X] T001 Add backend dependencies to `src-tauri/Cargo.toml`: `memmap2`, `regex`, `rayon`, `rusqlite` (with `bundled` feature), `rmcp` (with SSE/axum server transport), `tauri-specta` + `specta`, and `chrono` (for timestamp parsing); run `cargo build` to confirm they resolve
- [X] T002 [P] Add `rust-toolchain.toml` at the repo root pinning the current stable Rust toolchain (per plan.md Technical Context)
- [X] T003 [P] Add frontend dependencies to `package.json`: `@tanstack/react-query`, `@tanstack/react-virtual`, `zustand`, `tailwindcss`, `postcss`, `autoprefixer`, `class-variance-authority`, `clsx`, `tailwind-merge`, and the Radix primitives needed for shadcn-ui dialogs/dropdowns/tabs; run `pnpm install`
- [X] T004 [P] Configure Tailwind CSS (`tailwind.config.js`, `postcss.config.js`, base layer in `src/App.css`) and initialize shadcn-ui scaffolding (`components.json`, `src/lib/utils.ts` with `cn()` helper)
- [X] T005 Update `src-tauri/tauri.conf.json` to replace `"csp": null` with a strict CSP appropriate for a local-only Tauri app + localhost MCP server (Principle II)
- [X] T006 [P] Verify baseline quality gates pass on the scaffold: `cargo fmt --check`, `cargo clippy -- -D warnings`, `pnpm exec tsc --noEmit`, `pnpm exec eslint .`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared `AppState`, error type, SQLite schema/repo, MCP server lifecycle, typed-IPC scaffolding, and frontend app shell that every user story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T007 Create `src-tauri/src/error.rs` defining `AppError` (`NoActiveWorkspace`, `FileAlreadyInWorkspace`, `AliasCollision`, `WorkspaceAliasInUse`, `FileNotFound`, `FileUnavailable`, `LineOutOfRange`, `InvalidQuery`, `TimeRangeUnavailable`, `Io(String)`), deriving `Serialize`, plus a `Result<T>` alias used by every command and MCP tool
- [X] T008 Create `src-tauri/src/persistence/schema.rs` with SQLite migrations creating the `workspaces`, `log_file_entries`, `highlights`, and `search_history_entries` tables per data-model.md, opening the DB file in the OS app-data dir
- [X] T009 Create `src-tauri/src/persistence/repo.rs` with the repository module skeleton (connection handle, error mapping to `AppError::Io`) and empty CRUD modules for Workspace, LogFileEntry, Highlight, SearchHistoryEntry, ready for each story to fill in (depends on T008)
- [X] T010 Create `src-tauri/src/state.rs` defining `AppState`: active-workspace id, an in-memory `FileRuntime` registry keyed by alias (mmap handle, line offsets, index state, timestamp profile — per data-model.md Runtime entities), and a shared SQLite connection/pool, used by both the command layer and the MCP layer (depends on T007, T009)
- [X] T011 [P] Create `src-tauri/src/logfile/mod.rs` declaring the `mmap_index`, `search`, `timestamp`, and `query` submodules as empty stubs (no Tauri dependencies, per Structure Decision)
- [X] T012 Create `src-tauri/src/mcp/server.rs`: spawn an `rmcp` SSE server bound to `127.0.0.1` on a local port at app startup, with start/stop lifecycle tied to the Tauri app lifecycle (depends on T010)
- [X] T013 [P] Create `src-tauri/src/mcp/tools.rs` with the MCP tool-registration skeleton: declare all tool names from contracts/mcp-tools.md with handlers that return `AppError::NoActiveWorkspace` until a workspace is active, wired into `server.rs` (depends on T012)
- [X] T014 Wire `AppState` construction, persistence DB initialization, and MCP server startup into `src-tauri/src/lib.rs` `run()` builder, replacing the `greet`-only scaffold (depends on T010, T012)
- [X] T015 [P] Configure `tauri-specta` in `src-tauri/src/lib.rs` to collect Tauri commands and generate TS bindings into `src/bindings/` (empty command list for now; verify generation runs)
- [X] T016 [P] Create the frontend app shell: `src/app/providers.tsx` (TanStack `QueryClientProvider` + Zustand store provider), `src/app/ErrorBoundary.tsx` (app-level error boundary), `src/app/theme.ts` (OS light/dark theme detection), wired into `src/main.tsx`
- [X] T017 [P] Create `src/ipc/client.ts`: a typed wrapper around `invoke()`/`Channel` that unwraps `Result<T, AppError>` responses, to be used by every command-specific wrapper added in later phases (Principle I)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - View and Navigate Large Log Files (Priority: P1) 🎯 MVP

**Goal**: A user can create a workspace, add a large (5GB+) log file under an alias, see the first lines render within ~2s while indexing continues in the background, scroll through the file, and toggle line wrap.

**Independent Test**: Create a new workspace, add a 5GB log file, verify lines appear within ~2s, the app stays responsive, and the user can scroll and toggle line wrap on/off.

### Tests for User Story 1 (MANDATORY per constitution) ⚠️

- [X] T018 [P] [US1] Write `cargo test` unit tests for the background line-offset index builder in `src-tauri/src/logfile/mmap_index.rs` (correct offsets for a small sample file; index usable/incrementally available before it completes)
- [X] T019 [P] [US1] Write `cargo test` integration tests (Tauri mock runtime) for `commands::files::add_file` covering success (default alias = filename w/o extension, custom alias) and error paths (`FileAlreadyInWorkspace`, `AliasCollision`) in `src-tauri/tests/files_test.rs`
- [X] T020 [P] [US1] Write `cargo test` integration tests for `commands::viewing::stream_lines` and `subscribe_index_progress` in `src-tauri/tests/viewing_test.rs` (returns lines while indexing is incomplete, payload size bound)
- [X] T021 [P] [US1] Write Vitest + RTL tests for the `LogViewer` virtualized component and `useLogStream` hook with mocked `Channel`/IPC in `src/components/LogViewer.test.tsx` and `src/hooks/useLogStream.test.ts` (renders streamed lines, line-wrap toggle)

### Implementation for User Story 1

- [X] T022 [US1] Implement read-only `memmap2` mapping + `spawn_blocking` background line-offset index builder (`Vec<u64>` offsets, incremental `index_state`) in `src-tauri/src/logfile/mmap_index.rs` (depends on T018, T011)
- [X] T023 [US1] Implement `src-tauri/src/commands/workspace.rs`: `create_workspace` and `get_active_workspace` returning `WorkspaceSummary`, backed by `AppState` + the draft row in `persistence::repo` (depends on T009, T010)
- [X] T024 [US1] Implement `src-tauri/src/commands/files.rs`: `add_file` (canonicalize path, `FileAlreadyInWorkspace`/`AliasCollision` validation, default alias = filename w/o extension, kicks off the `mmap_index` background task), `list_files`, `get_file_properties`, `get_line`, `remove_file` (depends on T019, T022, T023)
- [X] T025 [US1] Implement `src-tauri/src/commands/viewing.rs`: `stream_lines` (`Channel<LineBatch>`, paginated <100KB per Principle VI) and `subscribe_index_progress` (`Channel<IndexProgress>`) (depends on T020, T022)
- [X] T026 [US1] Register `create_workspace`, `get_active_workspace`, `add_file`, `list_files`, `get_file_properties`, `get_line`, `remove_file`, `stream_lines`, `subscribe_index_progress` in `src-tauri/src/lib.rs`'s `invoke_handler!`/`tauri-specta` builder, and add matching entries in `src-tauri/capabilities/default.json` (depends on T024, T025, T015)
- [X] T027 [P] [US1] Create typed IPC wrappers `src/ipc/workspace.ts`, `src/ipc/files.ts`, and `src/ipc/viewing.ts` (incl. `Channel` subscribers for `stream_lines`/`subscribe_index_progress`) using the generated bindings from `src/bindings/` (depends on T026, T017)
- [X] T028 [P] [US1] Create `src/hooks/useWorkspace.ts` (TanStack Query around workspace/file IPC) and `src/hooks/useLogStream.ts` (subscribes to `stream_lines`/`subscribe_index_progress` channels) (depends on T027)
- [X] T029 [US1] Create `src/components/LogViewer.tsx`: TanStack Virtual windowed list rendering streamed lines, with a line-wrap toggle (frontend-only view state, default off) (depends on T021, T028)
- [X] T030 [US1] Create `src/pages/WorkspacePage.tsx`: add-file dialog (path + optional alias), file list, and `LogViewer` with the line-wrap toggle, wired into the app shell from T016 (depends on T029)

**Checkpoint**: User Story 1 is fully functional and independently testable — a workspace can be created, a large file added, viewed incrementally, scrolled, and wrap-toggled.

---

## Phase 4: User Story 2 - AI Agent Queries Workspace via MCP Server (Priority: P1) 🎯 MVP

**Goal**: An MCP client can call `list_files`, `get_file_properties`, `get_line`, and `search_with_context` against the active workspace and get correct results for files of any size.

**Independent Test**: With a workspace containing at least one loaded log file, connect an MCP client and call `list_files`, `get_file_properties`, `get_line`, and `search_with_context`, verifying each returns correct data.

### Tests for User Story 2 (MANDATORY per constitution) ⚠️

- [X] T031 [P] [US2] Write `cargo test` unit tests for the logical-expression parser and regex compilation in `src-tauri/src/logfile/search.rs` (AND/OR/NOT(`!`) precedence — NOT > AND > OR, case-insensitive, invalid-expression errors)
- [X] T032 [P] [US2] Write `cargo test` unit tests for search-with-context windowing/bounds-clamping in `src-tauri/src/logfile/query.rs` (start-of-file/end-of-file edge cases; `surrounding_count` default 5, max 200, clamped not rejected)
- [X] T033 [P] [US2] Write `cargo test` integration tests for MCP tools `list_files`, `get_file_properties`, `get_line`, `search_with_context` in `src-tauri/tests/mcp_tools_test.rs`, covering success and `no_active_workspace`/`file_not_found`/`file_unavailable`/`line_out_of_range`/`invalid_query` error paths

### Implementation for User Story 2

- [X] T034 [US2] Implement the logical-expression parser, regex support, and `rayon`-parallel mmap scan in `src-tauri/src/logfile/search.rs` (depends on T031, T011)
- [X] T035 [US2] Implement search-with-context windowing (before/after line collection, default/clamp rules, file-boundary handling) in `src-tauri/src/logfile/query.rs` (depends on T032, T034)
- [X] T036 [US2] Implement MCP tool handlers `list_files`, `get_file_properties`, `get_line`, `search_with_context` in `src-tauri/src/mcp/tools.rs` over the shared `AppState`/`FileRuntime` from T024/T034/T035, returning the structured outputs/errors from contracts/mcp-tools.md (depends on T033, T024, T034, T035, T013)
- [X] T037 [US2] Finalize `src-tauri/src/mcp/server.rs` to register the implemented tools from T036 and confirm the SSE endpoint (`http://127.0.0.1:<port>/sse`) serves them (depends on T036, T012)
- [X] T038 [US2] Validate the MCP quickstart flow end-to-end: connect an MCP client to the SSE endpoint and exercise `list_files`, `get_file_properties`, `get_line`, `search_with_context` against a loaded file per quickstart.md (depends on T037)

**Checkpoint**: User Stories 1 AND 2 both work independently — the MVP (viewing + agent read access) is complete.

---

## Phase 5: User Story 3 - Search with Logical Operators and Regular Expressions (Priority: P2)

**Goal**: Users (and agents) can run logical-operator (`AND`/`OR`/`NOT`) and regex searches from the UI, get correct matches quickly on large files, and have each search recorded in history.

**Independent Test**: In a workspace with a large log file loaded, run `"abc" AND "def" OR !"ghi"` and a separate regex search, and verify both return correct results within a reasonable time without freezing the UI, and the queries land in search history.

### Tests for User Story 3 (MANDATORY per constitution) ⚠️

- [X] T039 [P] [US3] Write `cargo test` integration tests for `commands::search::search` and `search_with_context` (UI) in `src-tauri/tests/search_test.rs`: logical AND/OR/NOT results, regex results, `InvalidQuery` on malformed input, and a `SearchHistoryEntry` recorded per execution
- [X] T040 [P] [US3] Write Vitest + RTL tests for `SearchBar` and `useSearch` with mocked IPC/`Channel` in `src/components/SearchBar.test.tsx` and `src/hooks/useSearch.test.ts` (logical and regex modes, displays results, shows history)

### Implementation for User Story 3

- [X] T041 [US3] Implement `SearchHistoryEntry` CRUD (record on execution, list by file) in `src-tauri/src/persistence/repo.rs` (depends on T009)
- [X] T042 [US3] Implement `src-tauri/src/commands/search.rs`: `search` (`Channel<SearchMatchBatch>`) and `search_with_context` (`Channel`) reusing `logfile::search`/`logfile::query` from US2, plus `get_search_history`, recording a `SearchHistoryEntry` on every execution (depends on T039, T034, T035, T041)
- [X] T043 [US3] Register `search`, `search_with_context`, `get_search_history` in `src-tauri/src/lib.rs` invoke handler/tauri-specta builder and add `src-tauri/capabilities/` entries (depends on T042, T026)
- [X] T044 [P] [US3] Create `src/ipc/search.ts`: typed wrapper + `Channel` subscriber for `search`/`search_with_context`, plus `get_search_history` (depends on T043, T017)
- [X] T045 [US3] Create `src/components/SearchBar.tsx` (logical-expression and regex input modes) and `src/hooks/useSearch.ts` (depends on T040, T044)
- [X] T046 [US3] Integrate `SearchBar`, live results list, and search-history view into `src/pages/WorkspacePage.tsx` (depends on T045, T030)

**Checkpoint**: User Stories 1, 2, AND 3 work independently — search from the UI is live and shared with the MCP layer.

---

## Phase 6: User Story 4 - Highlight and Label Lines (Priority: P2)

**Goal**: Users and MCP agents can mark lines as highlighted with optional labels, the UI can filter to "highlighted only", and the same highlights/labels are visible from both sides (FR-029).

**Independent Test**: Highlight a handful of lines (some labeled) in a loaded file, enable "highlighted only" and confirm only those lines appear, then query highlights via MCP and confirm the same lines/labels are returned.

### Tests for User Story 4 (MANDATORY per constitution) ⚠️

- [X] T047 [P] [US4] Write `cargo test` integration tests for `commands::highlights` (`set_highlight`, `clear_highlight`, `set_label`, `list_highlights`) in `src-tauri/tests/highlights_test.rs`, covering success and `LineOutOfRange`
- [X] T048 [P] [US4] Write `cargo test` integration tests for MCP tools `list_highlights`, `set_highlight`, `clear_highlight` in `src-tauri/tests/mcp_highlights_test.rs`, including the FR-029 cross-check: a highlight created via MCP is returned by `commands::highlights::list_highlights` and vice versa
- [X] T049 [P] [US4] Write Vitest + RTL tests for `HighlightPanel` and the "highlighted only" filter in `src/components/HighlightPanel.test.tsx`

### Implementation for User Story 4

- [X] T050 [US4] Implement `Highlight` CRUD (create/update label/remove/list, enforce unique `(file_id, line_index)`, `origin` = `user`/`mcp_agent`) in `src-tauri/src/persistence/repo.rs` (depends on T009)
- [X] T051 [US4] Implement `src-tauri/src/commands/highlights.rs`: `set_highlight`, `clear_highlight`, `set_label`, `list_highlights` over `AppState` + repo, with `LineOutOfRange` validation (depends on T047, T050, T024)
- [X] T052 [US4] Implement MCP tools `list_highlights`, `set_highlight`, `clear_highlight` in `src-tauri/src/mcp/tools.rs`, sharing the same repo/`AppState` rows as `commands::highlights` (depends on T048, T051, T036)
- [X] T053 [US4] Register `set_highlight`, `clear_highlight`, `set_label`, `list_highlights` in `src-tauri/src/lib.rs` invoke handler/tauri-specta builder and add `src-tauri/capabilities/` entries (depends on T051, T026)
- [X] T054 [P] [US4] Create `src/ipc/highlights.ts` and `src/hooks/useHighlights.ts` (depends on T053, T017)
- [X] T055 [US4] Create `src/components/HighlightPanel.tsx`: label editing UI and "highlighted only" view filter, integrated into `LogViewer`/`WorkspacePage` (depends on T049, T054, T029)

**Checkpoint**: User Stories 1–4 work independently — highlighting/labeling is shared and consistent between UI and MCP.

---

## Phase 7: User Story 6 - Workspace Persistence and Save Prompts (Priority: P2)

**Goal**: The draft workspace (files, aliases, highlights, labels, search history) survives app restarts automatically; closing/replacing a dirty draft prompts to save under an alias; saved workspaces can be browsed and reopened, with missing files marked unavailable.

**Independent Test**: Add files, highlight lines, run searches in the draft workspace; relaunch and confirm the same state is restored. Then create a new workspace, save the current one with an alias, confirm it appears in saved workspaces, and confirm it reopens with state intact.

### Tests for User Story 6 (MANDATORY per constitution) ⚠️

- [X] T056 [P] [US6] Write `cargo test` integration tests for draft auto-recovery and save/discard flows in `src-tauri/tests/workspace_persistence_test.rs`: `save_workspace` (incl. `WorkspaceAliasInUse`), `discard_draft`, `open_workspace` with one or more files missing on disk (marked unavailable, load still succeeds)
- [X] T057 [P] [US6] Write Vitest + RTL tests for the save-prompt dialog and saved-workspaces browser in `src/components/SavePromptDialog.test.tsx` and `src/pages/SavedWorkspacesPage.test.tsx`

### Implementation for User Story 6

- [X] T058 [US6] Implement `Workspace`/`LogFileEntry` persistence in `src-tauri/src/persistence/repo.rs`: create draft, save-with-alias (`WorkspaceAliasInUse` on collision), list saved, load saved workspace with cascading `LogFileEntry`/`Highlight`/`SearchHistoryEntry` rows, enforce single-draft invariant (depends on T009)
- [X] T059 [US6] Extend `src-tauri/src/commands/workspace.rs`: `save_workspace`, `discard_draft`, `list_saved_workspaces`, `open_workspace` (missing files marked `availability: missing`, load still succeeds), `is_workspace_dirty` (depends on T056, T058, T023)
- [X] T060 [US6] Wire automatic draft restoration on app startup in `src-tauri/src/lib.rs` (FR-005), updating `modified_at` on every state-changing command so `is_workspace_dirty` reflects reality (depends on T059, T014)
- [X] T061 [US6] Register `save_workspace`, `discard_draft`, `list_saved_workspaces`, `open_workspace`, `is_workspace_dirty` in `src-tauri/src/lib.rs` invoke handler/tauri-specta builder and add `src-tauri/capabilities/` entries (depends on T059, T026)
- [X] T062 [P] [US6] Extend `src/ipc/workspace.ts` with `save_workspace`/`discard_draft`/`list_saved_workspaces`/`open_workspace`/`is_workspace_dirty` wrappers (depends on T061, T027)
- [X] T063 [US6] Create `src/components/SavePromptDialog.tsx` (save/discard choice, alias entry with collision error display) and `src/pages/SavedWorkspacesPage.tsx` (list + open saved workspaces, showing unavailable files) (depends on T057, T062)
- [X] T064 [US6] Integrate the save-prompt flow into close/new-workspace actions and add navigation to `SavedWorkspacesPage` from the app shell/`WorkspacePage` (depends on T063, T030)

**Checkpoint**: User Stories 1–4 and 6 work independently — workspace state survives restarts and can be saved/restored.

---

## Phase 8: User Story 5 - Automatic Timestamp Detection and Time-Range Search (Priority: P3)

**Goal**: On add, a file's first 1000 lines are sampled to detect a common timestamp format (≥70% match → detected, per-line epoch-ms parsed); files with a detected format support time-range search/filtering from both UI and MCP.

**Independent Test**: Add a file whose lines consistently start with an ISO-8601 timestamp; confirm a detected format is reported, then run a time-range search and verify only in-range lines are returned. Repeat with a file with no consistent timestamp and confirm no format is detected and time-range search is reported unavailable.

### Tests for User Story 5 (MANDATORY per constitution) ⚠️

- [X] T065 [P] [US5] Write `cargo test` unit tests for timestamp format detection in `src-tauri/src/logfile/timestamp.rs`: ISO-8601 variants (incl. `Z`/offset), Unix epoch seconds and milliseconds, ≥70% threshold detected vs. not-detected, mixed-format sample below threshold
- [X] T066 [P] [US5] Write `cargo test` integration tests for time-range search via `commands::search` and MCP `search_with_context` in `src-tauri/tests/timestamp_search_test.rs`, including `TimeRangeUnavailable` for files with no detected format

### Implementation for User Story 5

- [X] T067 [US5] Implement sample-based timestamp format detection and per-line epoch-ms parsing (`TimestampFormatProfile`, ≥70% threshold) in `src-tauri/src/logfile/timestamp.rs` (depends on T065, T011)
- [X] T068 [US5] Integrate timestamp detection into the background indexing pass in `src-tauri/src/logfile/mmap_index.rs`: sample the first 1000 lines, then store `Option<i64>` epoch-ms per line alongside offsets during the same scan (depends on T067, T022)
- [X] T069 [US5] Expose `has_timestamp_format` from `get_file_properties` in `commands/files.rs` and the MCP `get_file_properties` tool (depends on T068, T024, T036)
- [X] T070 [US5] Add `time_from`/`time_to` filtering to `commands::search`/`search_with_context` (UI) and MCP `search_with_context`, returning `TimeRangeUnavailable` when the file has no detected format (depends on T068, T042, T036)
- [X] T071 [P] [US5] Add time-range input controls to `SearchBar` (`src/components/SearchBar.tsx`) and `useSearch`, disabled/hidden when `has_timestamp_format` is false (depends on T070, T045)

**Checkpoint**: All six user stories are independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final quality gates and end-to-end validation across all stories.

- [X] T072 [P] Run backend quality gates across `src-tauri/`: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`
- [X] T073 [P] Run frontend quality gates: `pnpm exec tsc --noEmit`, `pnpm exec eslint .`, `pnpm test`
- [X] T074 Add feature/list-item-level error boundaries around `LogViewer`, `SearchBar`, and `HighlightPanel` (Principle V — one bad log line/search result can't crash the view)
- [X] T075 Execute the full quickstart.md manual flow end-to-end (create workspace → add 5GB file → search → highlight → save/reload workspace → connect MCP agent) and fix any discrepancies found

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories.
- **User Story 1 (Phase 3, P1)**: Depends on Foundational only. This is the MVP core (file loading, viewing, indexing) that US2–US6 build on.
- **User Story 2 (Phase 4, P1)**: Depends on Foundational + US1 (`AppState`/`FileRuntime`, `add_file`, `mmap_index`). Implements the core search engine (`logfile::search`, `logfile::query`) that US3 and US5 reuse.
- **User Story 3 (Phase 5, P2)**: Depends on Foundational + US1 + US2 (reuses `logfile::search`/`logfile::query`).
- **User Story 4 (Phase 6, P2)**: Depends on Foundational + US1 (and US2 for the MCP highlight tools alongside the already-registered tool set).
- **User Story 6 (Phase 7, P2)**: Depends on Foundational + US1 (persists workspaces/files); benefits from US3/US4 existing so there's history/highlights worth persisting, but its own tasks only require US1's entities.
- **User Story 5 (Phase 8, P3)**: Depends on Foundational + US1 (extends `mmap_index`'s background pass) + US2/US3 (time-range params on `search_with_context`).
- **Polish (Phase 9)**: Depends on all desired user stories being complete.

### Recommended Execution Order

Setup → Foundational → US1 → US2 → US3 → US4 → US6 → US5 → Polish (matches spec.md priorities P1, P1, P2, P2, P2, P3, with US6 last among P2 stories since it persists state produced by US3/US4).

### Within Each User Story

- Tests are written first and must fail before implementation begins.
- Core engine modules (`logfile/*`, no Tauri deps) before the commands/MCP tools that wrap them.
- Commands/MCP tools before their `lib.rs` registration + capabilities entries.
- Backend registration before frontend IPC wrappers.
- IPC wrappers/hooks before UI components that consume them.

---

## Parallel Example: User Story 1

```bash
# Tests (different files, run together):
Task: "cargo test for mmap_index line-offset index in src-tauri/src/logfile/mmap_index.rs"      # T018
Task: "cargo test for add_file in src-tauri/tests/files_test.rs"                                # T019
Task: "cargo test for stream_lines/subscribe_index_progress in src-tauri/tests/viewing_test.rs" # T020
Task: "Vitest for LogViewer + useLogStream"                                                      # T021

# After backend registration (T026), frontend wrappers/hooks in parallel:
Task: "src/ipc/workspace.ts, src/ipc/files.ts, src/ipc/viewing.ts"  # T027
Task: "src/hooks/useWorkspace.ts, src/hooks/useLogStream.ts"        # T028
```

## Parallel Example: User Story 2

```bash
# Tests (different files, run together):
Task: "cargo test for logical/regex search in src-tauri/src/logfile/search.rs"        # T031
Task: "cargo test for context windowing in src-tauri/src/logfile/query.rs"            # T032
Task: "cargo test for MCP tools in src-tauri/tests/mcp_tools_test.rs"                 # T033
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 — both P1)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks everything)
3. Complete Phase 3: User Story 1 (view/navigate large files)
4. Complete Phase 4: User Story 2 (MCP read access — `list_files`, `get_file_properties`, `get_line`, `search_with_context`)
5. **STOP and VALIDATE**: both independent tests from spec.md pass
6. Deploy/demo if ready — this is the "MCP server is the headline feature" milestone

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → viewing works (MVP part 1)
3. US2 → MCP agent read access works (MVP part 2) — full MVP
4. US3 → UI search (logical + regex) with history
5. US4 → highlighting/labeling, consistent across UI and MCP
6. US6 → workspace persistence, save prompts, saved-workspace browser
7. US5 → timestamp detection + time-range search
8. Polish → quality gates + full quickstart validation

### Parallel Team Strategy

After Foundational completes and US1 is done:

- Developer A: US2 (MCP tools + search engine) — also unblocks US3/US5
- Developer B: US4 (highlights) — only needs US1
- Developer C: US6 (persistence/save prompts) — only needs US1

US3 and US5 should wait for US2's `logfile::search`/`logfile::query` to avoid duplicating the search engine.

---

## Notes

- [P] tasks touch different files and have no in-flight dependency on another incomplete task.
- Every fallible command/tool returns `Result<T, AppError>` (Principle I) — no ad-hoc error types.
- `commands/*.rs` and `mcp/tools.rs` are thin adapters over the shared `AppState`/`persistence::repo` (FR-029) — never duplicate state.
- Commit after each task or logical group; stop at each phase checkpoint to validate independently.
- Avoid: vague tasks, two tasks editing the same file marked `[P]`, cross-story dependencies that break independent testability beyond what's documented above.
