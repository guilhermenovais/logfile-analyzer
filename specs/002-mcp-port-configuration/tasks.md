# Tasks: User-Configurable MCP Server Port

**Input**: Design documents from `/specs/002-mcp-port-configuration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ipc-commands.md

**Tests**: MANDATORY per the project constitution (Principle IV — Test-First Quality Gates). Each user story phase writes failing tests first (`cargo test` with the Tauri mock runtime for backend, Vitest + RTL with mocked IPC/clipboard for frontend), then implements until they pass.

**Organization**: Tasks are grouped by user story (US1–US4, per spec.md priorities) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependency on another task in flight)
- **[Story]**: Maps the task to a user story (US1–US4) for traceability
- All file paths are relative to the repository root and match the structure in `plan.md`

## Path Conventions (from plan.md)

- Frontend: `src/{app,components,hooks,ipc,lib,pages}/`
- Backend: `src-tauri/src/{commands,mcp,persistence}/`, `src-tauri/tests/`, `src-tauri/capabilities/`
- The MCP server binds only to `127.0.0.1` (Principle II); the bind attempt **is** the availability check (research.md §2)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the clipboard dependency needed by US2's copy action (FR-011).

- [X] T001 [P] Add `tauri-plugin-clipboard-manager` (v2) to `[dependencies]` in `src-tauri/Cargo.toml` and `@tauri-apps/plugin-clipboard-manager` to `dependencies` in `package.json`; run `cargo build` and `pnpm install` to confirm both resolve
- [X] T002 Register `.plugin(tauri_plugin_clipboard_manager::init())` in the `tauri::Builder` chain in `src-tauri/src/lib.rs` (depends on T001)
- [X] T003 [P] Add `"clipboard-manager:allow-write-text"` to the `permissions` array in `src-tauri/capabilities/default.json` (depends on T001)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared error variants, persisted port storage, the `McpServerState`/`McpRuntimeStatus` runtime model, and the updated `mcp::server::start` signature that every user story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Add `InvalidPort` and `PortUnavailable(String)` variants to `AppError` in `src-tauri/src/error.rs`, including matching `Display` arms (data-model.md "AppError additions")
- [X] T005 Add the `app_settings` key-value table migration to `migrate()` in `src-tauri/src/persistence/schema.rs`: `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)` (data-model.md "McpServerConfiguration")
- [X] T006 [P] Create `src-tauri/src/persistence/repo/settings.rs` with `get_mcp_port(conn: &Connection) -> Result<Option<u16>>` and `set_mcp_port(conn: &Connection, port: u16) -> Result<()>` (upsert into `app_settings` under key `mcp_port`), plus unit tests for get-when-absent, set-then-get, and overwrite-on-second-set; register `pub mod settings;` in `src-tauri/src/persistence/repo/mod.rs` (depends on T005)
- [X] T007 [P] Add `McpStatusInfo { configured: bool, port: Option<u16>, error: Option<String> }` (`#[derive(Serialize, specta::Type)]`) to `src-tauri/src/commands/types.rs` (contracts/ipc-commands.md)
- [X] T008 Modify `src-tauri/src/mcp/server.rs`: change `start(state: Arc<AppState>)` to `start(state: Arc<AppState>, port: u16) -> std::io::Result<McpServerHandle>`, binding `TcpListener::bind(("127.0.0.1", port))` instead of `"127.0.0.1:0"`; add `pub enum McpRuntimeStatus { Running(McpServerHandle), Failed(String) }` and `pub struct McpServerState(pub Mutex<McpRuntimeStatus>)` (data-model.md "McpRuntimeStatus") (depends on T004)
- [X] T009 Update `src-tauri/tests/mcp_server_test.rs`'s call to `mcp::server::start(state)`: bind a short-lived probe `TcpListener::bind(("127.0.0.1", 0))` to obtain a free port, drop it, then call `mcp::server::start(state, port)` with that port (depends on T008)
- [X] T010 Wire `src-tauri/src/lib.rs` `setup()`: after opening the DB, call `persistence::repo::settings::get_mcp_port`; if `Some(port)`, attempt `mcp::server::start(state.clone(), port)` and store `McpRuntimeStatus::Running`/`Failed(reason)` accordingly; if `None`, store `Failed("not configured".into())`. Call `app.manage(McpServerState(Mutex::new(status)))` instead of `app.manage(mcp_handle)`. Update the exit-handler closure in `run()` to shut down only when the managed `McpServerState` holds `Running` (depends on T006, T008)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Choose the MCP server port on first launch (Priority: P1) 🎯 MVP

**Goal**: On first launch (no persisted port), a blocking dialog collects a valid, available port, persists it, and starts the MCP server on it.

**Independent Test**: Start the application with no MCP port configured, enter a port number, and verify either the port is accepted and the MCP server becomes reachable on it, or — if the port is taken — the user is informed and prompted again until an available port is chosen.

### Tests for User Story 1 (MANDATORY per constitution) ⚠️

- [X] T011 [P] [US1] Integration tests in new `src-tauri/tests/mcp_settings_test.rs` (Tauri mock runtime, per `files_test.rs`'s `mock_app()` pattern, managing both `Arc<AppState>` and `McpServerState`) for `configure_mcp_port`: success (binds, persists via `settings::set_mcp_port`, returns `McpStatusInfo { configured: true, port: Some(port), error: None }`), `InvalidPort` for `port == 0`, `PortUnavailable` when the port is already bound by a probe `TcpListener`, and same-port no-op (calling with the currently `Running` port returns success without rebinding); and `get_mcp_status` reflecting `configured`/`port`/`error` before and after each case (depends on T007, T008, T010)
- [X] T012 [P] [US1] Vitest + RTL test `src/components/PortSetupDialog.test.tsx`: renders as non-dismissible when `open` (no close button, `onOpenChange(false)` does not close it); shows a validation message and does not call `onSubmit` for non-numeric or out-of-range (e.g. `99999`) input (FR-003); shows a "port unavailable" message and stays open when the `onSubmit` promise rejects with `PortUnavailable` (FR-005); calls `onSubmit` with the parsed port number for a valid value

### Implementation for User Story 1

- [X] T013 [US1] Create `src-tauri/src/commands/settings.rs` implementing `get_mcp_status` and `configure_mcp_port` per contracts/ipc-commands.md: `configure_mcp_port` rejects `port == 0` with `AppError::InvalidPort`, returns the current status unchanged if `port` equals the currently `Running` port, otherwise calls `mcp::server::start(state.clone(), port)` — on bind failure returns `Err(AppError::PortUnavailable(reason))` leaving persisted/runtime state untouched, on success shuts down the previous `McpServerHandle` (if `Running`), persists via `persistence::repo::settings::set_mcp_port`, and stores the new `Running(handle)` in `McpServerState`; `get_mcp_status` reads the persisted port (via `settings::get_mcp_port`) for `configured`/`port` and `McpServerState` for `error` (only surfaced when `configured`) (depends on T011)
- [X] T014 [US1] Register `pub mod settings;` in `src-tauri/src/commands/mod.rs` and add `settings::get_mcp_status`, `settings::configure_mcp_port` to `collect_commands!` in `specta_builder()` in `src-tauri/src/lib.rs` (depends on T013)
- [X] T015 [P] [US1] Create `src/ipc/settings.ts`: typed wrappers `getMcpStatus(): Promise<McpStatusInfo>` and `configureMcpPort(port: number): Promise<McpStatusInfo>` over the generated `commands.getMcpStatus`/`commands.configureMcpPort` bindings, using `unwrapResult` from `src/ipc/client.ts` (depends on T014)
- [X] T016 [P] [US1] Create `src/hooks/useMcpSettings.ts`: `useMcpStatus()` (`useQuery`, query key `["mcp", "status"]`) and `useConfigureMcpPort()` (`useMutation` calling `configureMcpPort`, writing the returned `McpStatusInfo` into the status query cache on success via `queryClient.setQueryData`) (depends on T015)
- [X] T017 [US1] Create `src/components/PortSetupDialog.tsx`: a Radix `Dialog.Root` (modeled on `src/components/SavePromptDialog.tsx`) whose `open={true}` and `onOpenChange` is a no-op (non-dismissible per Assumptions/FR-002), containing a labeled numeric port input, client-side validation for 1–65535 (FR-003), and an error message area showing `InvalidPort`/`PortUnavailable` messages from a failed `onSubmit` (depends on T012, T016)
- [X] T018 [US1] Create `src/app/McpSetupGate.tsx`: calls `useMcpStatus()` on mount and renders `PortSetupDialog` (wired to `useConfigureMcpPort()`) when `!data.configured`; renders nothing (children pass through) once configured (depends on T017)
- [X] T019 [US1] Render `McpSetupGate` (wrapping the existing page content) in `src/App.tsx` (depends on T018)

**Checkpoint**: User Story 1 is fully functional and independently testable — a fresh install prompts for a port, validates and retries on conflict, persists the choice, and starts the MCP server on it.

---

## Phase 4: User Story 2 - Get agent tool connection instructions after choosing a port (Priority: P2)

**Goal**: Immediately after first-time port confirmation, show a dialog with per-tool connection instructions (including the exact Claude Code CLI command and Kiro IDE config), with a working copy action.

**Independent Test**: After completing port setup, verify the instructions dialog appears, switching the selected tool changes the displayed command/steps to match, and the copy action places the correct, port-specific text on the clipboard.

### Tests for User Story 2 (MANDATORY per constitution) ⚠️

- [X] T020 [P] [US2] Vitest + RTL test `src/components/AgentInstructionsDialog.test.tsx` (with `@tauri-apps/plugin-clipboard-manager`'s `writeText` mocked via `vi.mock`): the default selected tool shows instructions text containing the given port; switching the `<select>` to "Claude Code CLI" shows exactly `claude mcp add --transport http logfile-analyzer http://localhost:<port>/mcp` with `<port>` substituted (FR-010); switching to "Kiro IDE" shows a snippet referencing `http://localhost:<port>/mcp` (FR-009); clicking the copy button calls the mocked `writeText` with the exact displayed text and shows a "Copied" confirmation (FR-011)

### Implementation for User Story 2

- [X] T021 [P] [US2] Create `src/lib/agentTools.ts`: static `AgentToolProfile[]` (`{ id: string; name: string; instructions: (port: number) => string }`) per research.md §5 for `claude-code-cli`, `kiro-ide`, `cursor`, `windsurf`, `cline`, where `claude-code-cli`'s `instructions(port)` returns exactly `` `claude mcp add --transport http logfile-analyzer http://localhost:${port}/mcp` `` and `kiro-ide`'s returns a JSON snippet for Kiro's `mcp.json` streamable-HTTP server entry pointing at `http://localhost:${port}/mcp`
- [X] T022 [US2] Create `src/components/AgentInstructionsDialog.tsx`: a dismissible Radix `Dialog.Root` with a labeled native `<select>` over `agentTools` (research.md §6), a `<pre>` block rendering `selected.instructions(port)` for a `port: number` prop, and a copy button calling `writeText` from `@tauri-apps/plugin-clipboard-manager` with a transient "Copied!" confirmation (FR-011) (depends on T020, T021)
- [X] T023 [US2] Extend `src/app/McpSetupGate.tsx` (research.md §8): after `PortSetupDialog` succeeds for the first time, render `AgentInstructionsDialog` with the newly-configured port; dismissing it returns to normal app use (FR-007/Acceptance Scenario 6) (depends on T018, T022)

**Checkpoint**: User Stories 1 AND 2 both work independently — first-run setup flows directly into tool-specific connection instructions with working copy.

---

## Phase 5: User Story 3 - Change the MCP server port later from Settings (Priority: P2)

**Goal**: A Settings button in an app-wide toolbar opens a dialog showing the current port and letting the user change it, with the same validation/availability checks, hot-reconfiguring the running MCP server.

**Independent Test**: With the app running on a previously configured port, open Settings from the toolbar, change the port to a different available value, save, and confirm the MCP server is reachable on the new port and the setting persists across restarts.

### Tests for User Story 3 (MANDATORY per constitution) ⚠️

- [X] T024 [P] [US3] Vitest + RTL test `src/components/SettingsDialog.test.tsx` (mocked `useMcpSettings`): shows the currently configured port (FR-013); entering a new, available port and saving calls `configure_mcp_port` and the displayed port updates to the new value (FR-015); entering an unavailable port shows the `PortUnavailable` message, save does not complete, and the previously configured port remains displayed (FR-016); entering an invalid value shows a validation message and disables save (FR-003/FR-014); closing without changes makes no `configure_mcp_port` call (Acceptance Scenario 5)
- [X] T025 [P] [US3] Vitest + RTL test `src/components/AppToolbar.test.tsx`: renders a labeled Settings button (`aria-label="Settings"`) alongside its children; clicking it invokes the provided `onOpenSettings` callback (FR-012)

### Implementation for User Story 3

- [X] T026 [P] [US3] Create `src/components/AppToolbar.tsx`: a slim app-wide toolbar rendering its `children` plus a `lucide-react` gear (`Settings`) icon button with `aria-label="Settings"` that calls an `onOpenSettings` prop (depends on T025)
- [X] T027 [US3] Create `src/components/SettingsDialog.tsx`: a dismissible Radix `Dialog.Root` showing the current port from `useMcpStatus()`, a port-input form reusing `PortSetupDialog`'s validation rules and `useConfigureMcpPort()` for save (no-op if the value matches the current port; on `PortUnavailable`/`InvalidPort` shows the same error messages without closing, FR-016), and a "Connection instructions" button that opens `AgentInstructionsDialog` for the current port (depends on T016, T021, T022, T024)
- [X] T028 [US3] Render `AppToolbar` + `SettingsDialog` in `src/App.tsx`, above whichever page (`WorkspacePage`/`SavedWorkspacesPage`) is currently shown, with `App.tsx` owning the `settingsOpen` state so the Settings button is reachable from both views (FR-012) (depends on T026, T027)

**Checkpoint**: User Stories 1-3 all work independently — Settings lets the user view and change the port at any time, with the change taking effect immediately and persisting.

---

## Phase 6: User Story 4 - Be informed when the MCP server fails to start (Priority: P3)

**Goal**: If the configured port can't be bound at startup, a dismissible error dialog explains the problem and offers a "Go to Settings" action, while the rest of the app remains usable.

**Independent Test**: Configure a port, make it unavailable before the next launch (e.g. occupy it with another process), start the app, and verify an error dialog explains the MCP server could not start while the rest of the app remains usable.

### Tests for User Story 4 (MANDATORY per constitution) ⚠️

- [X] T029 [P] [US4] Integration test in `src-tauri/tests/mcp_settings_test.rs`: with a port already persisted via `settings::set_mcp_port` and pre-occupied by a probe `TcpListener`, replicate `setup()`'s startup bind attempt (`mcp::server::start` fails) and assert the resulting `McpServerState` is `Failed(_)` and `get_mcp_status` returns `{ configured: true, port: Some(port), error: Some(_) }`; then assert `configure_mcp_port` to a free port returns `{ configured: true, port: Some(new_port), error: None }` (FR-018/FR-020) (depends on T010, T013)
- [X] T030 [P] [US4] Vitest + RTL test `src/components/McpErrorDialog.test.tsx`: renders the `error` message from `useMcpStatus()` when present; is dismissible (closing does not re-block the app); clicking "Go to Settings" calls the provided `onOpenSettings` callback (FR-018/FR-019/FR-020)

### Implementation for User Story 4

- [X] T031 [US4] Create `src/components/McpErrorDialog.tsx`: a dismissible Radix `Dialog.Root` displaying the `error` string from `useMcpStatus()` and a "Go to Settings" button calling an `onOpenSettings` prop (depends on T030)
- [X] T032 [US4] Extend `src/app/McpSetupGate.tsx` and `src/App.tsx` (research.md §8): when `configured && error !== null`, render `McpErrorDialog` (after any first-run `PortSetupDialog`/`AgentInstructionsDialog` sequencing), with its "Go to Settings" action opening the `SettingsDialog` from T027/T028 via the shared `settingsOpen` state (depends on T023, T028, T031)

**Checkpoint**: All four user stories are independently functional — startup failures are surfaced without blocking log viewing, and Settings provides a fix path.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all user stories.

- [ ] T033 [P] Run the manual quickstart.md verification steps for US1–US4 against `pnpm tauri dev`, including the `nc -l 127.0.0.1 <port>` port-conflict scenarios
- [ ] T034 [P] Run the full regression suite: `cargo test -p logfile-analyzer`, `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm exec eslint .`, `cargo clippy -- -D warnings`, `cargo fmt --check`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: No dependency on Setup (different files); BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion — no dependency on other stories
- **User Story 2 (Phase 4)**: Depends on Foundational; extends US1's `McpSetupGate` (T018) and reuses `useMcpSettings`/`AgentInstructionsDialog` building blocks shared with US3
- **User Story 3 (Phase 5)**: Depends on Foundational; reuses `useMcpSettings` (US1) and `AgentInstructionsDialog`/`agentTools` (US2) for its "Connection instructions" action
- **User Story 4 (Phase 6)**: Depends on Foundational; its "Go to Settings" action depends on `SettingsDialog` existing (US3), per spec.md's stated US3 dependency
- **Polish (Phase 7)**: Depends on all four user stories being complete

### Within Each User Story

- Tests are written and expected to fail before implementation
- Backend commands before frontend IPC wrappers before hooks before components before page wiring
- Story complete before moving to the next priority

### Parallel Opportunities

- T001 and T003 can run in parallel (different files); T002 depends on T001
- T006 and T007 can run in parallel once T004/T005 land (different files)
- T011 and T012 (US1 tests) can run in parallel
- T015 and T016 can run in parallel once T014 lands; T020/T021 can run in parallel; T024/T025 can run in parallel; T029/T030 can run in parallel
- T033 and T034 can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch both US1 test tasks together:
Task: "Integration tests for configure_mcp_port/get_mcp_status in src-tauri/tests/mcp_settings_test.rs"
Task: "Vitest + RTL test for PortSetupDialog in src/components/PortSetupDialog.test.tsx"

# Once T014 (command registration) lands, launch the IPC/hook tasks together:
Task: "Create src/ipc/settings.ts"
Task: "Create src/hooks/useMcpSettings.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run the US1 quickstart steps independently
5. Deploy/demo if ready — a configured, working MCP port is the foundation everything else builds on

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Validate independently → Demo (MVP!)
3. Add User Story 2 → Validate independently (instructions dialog + copy) → Demo
4. Add User Story 3 → Validate independently (Settings port change) → Demo
5. Add User Story 4 → Validate independently (startup error dialog) → Demo
6. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
