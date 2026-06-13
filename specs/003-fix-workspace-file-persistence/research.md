# Research: Workspace and Log File Session Restore

All technical unknowns from the Technical Context are resolved below.

## 1. Persisting "last active workspace"

- **Decision**: Reuse the `app_settings` key-value table (added in 002 for
  `mcp_port`). Add a new row with key `last_active_workspace_id`, whose value
  is the active workspace's `id` as a decimal string. New repo functions
  `persistence::repo::settings::get_last_active_workspace(conn) ->
  Result<Option<i64>>` and `set_last_active_workspace(conn, id: i64) ->
  Result<()>` (upsert), mirroring `get_mcp_port`/`set_mcp_port`.
- **Rationale**: The key-value table and migration already exist; a single
  extra row is the smallest possible addition (Principle III) and keeps all
  "app-wide singleton" settings in one place.
- **Alternatives considered**:
  - A boolean `is_last_active` column on `workspaces`, enforced unique like
    `idx_workspaces_single_draft` — rejected: needs its own partial-unique
    index and migration just to express a single scalar value the
    `app_settings` table already models.

## 2. When to write the "last active workspace" record

- **Decision**: Write it exactly once, in the existing `RunEvent::Exit`
  handler in `lib.rs` (next to the MCP server shutdown logic), reading
  `*state.active_workspace_id.lock().unwrap()` at that moment.
- **Rationale**: FR-003 only needs the value as of "the time it was closed".
  A single write on normal exit avoids a write on every workspace switch
  (`create_workspace`, `discard_draft`, `open_workspace`, `save_workspace`)
  for the same eventual outcome, and matches the spec's Assumption that
  abrupt termination is not guaranteed to update the record (Principle III).
- **Alternatives considered**:
  - Writing inside every command that changes `active_workspace_id` —
    rejected: four extra write points and DB round-trips for a value only
    ever read once, at the next startup.

## 3. Resolving which workspace to restore at startup

- **Decision**: New helper `commands::workspace::resolve_startup_workspace(db:
  &Connection) -> Result<workspace::Workspace>`:
  1. Read `last_active_workspace_id` from `app_settings`.
  2. If present and `workspace::get(db, id)` returns `Some`, use it
     (FR-004).
  3. Otherwise (no record, or the recorded workspace was deleted),
     fall back to `workspace::get_or_create_draft(db)` (FR-006/FR-009).
- **Rationale**: Centralizes the fallback logic in one pure, DB-only function
  that's directly unit-testable with an in-memory `Connection` (same pattern
  as the existing `persistence::repo::workspace` tests), independent of the
  Tauri `setup()` closure.
- **Alternatives considered**: Inlining the resolution in `setup()` —
  rejected: harder to unit test, and `setup()` already does several
  unrelated things (DB open, MCP startup).

## 4. Loading the resolved workspace's files into `state.files` at startup

- **Decision**: Extract the per-entry loop currently inside `open_workspace`
  (open the mmap, build a `FileRuntime`, insert into `state.files`, spawn
  `index_and_detect_timestamps` in the background, and build the
  `LogFileSummary` with `available` reflecting whether the mmap opened) into a
  shared helper `commands::workspace::load_workspace_files(state:
  &Arc<AppState>, entries: Vec<LogFileEntry>) -> Vec<LogFileSummary>`.
  - `open_workspace` calls it after setting `active_workspace_id` and
    clearing `state.files`.
  - `setup()` calls it for `resolve_startup_workspace`'s entries right after
    constructing `AppState` (whose `state.files` starts empty), before
    `app.manage(state)` / starting the MCP server.
- **Rationale**: This is the mechanism FR-001/FR-002/FR-005/FR-008 all
  require: on startup, every workspace (draft or saved) gets its files loaded
  through the *exact same* code path as a manual `open_workspace` call,
  including per-file availability checks, without duplicating that loop.
- **Alternatives considered**:
  - Leaving `state.files` empty at startup and having the frontend re-`add_file`
    each entry on mount — rejected: duplicates persistence-vs-runtime state
    reconciliation in the frontend, and would transiently show files as
    unavailable (violates FR-002) and re-trigger "already in workspace" checks.

## 5. Ordering in `setup()`

- **Decision**: `resolve_startup_workspace` → `AppState::new` →
  `load_workspace_files` (for the resolved workspace's entries) →  start the
  MCP server → `app.manage(state)`.
- **Rationale**: Ensures any MCP tool call made immediately after launch
  already sees the restored files (FR-029 consistency between UI and MCP
  surfaces), and that `get_active_workspace`'s first call from the frontend
  returns fully-loaded data with no extra round trip.
