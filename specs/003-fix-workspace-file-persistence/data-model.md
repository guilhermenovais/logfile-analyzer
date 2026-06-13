# Data Model: Workspace and Log File Session Restore

This feature adds one persisted value and two in-process helpers; it does
not change the shape of `Workspace`, `LogFileEntry`, or `WorkspaceSummary`
defined in 001/002.

## LastActiveWorkspace (persisted)

A single row in the existing `app_settings` key-value table
(`src-tauri/src/persistence/schema.rs`, added in 002):

| key                       | value                                    |
|---------------------------|------------------------------------------|
| `last_active_workspace_id` | the active workspace's `id`, decimal string (e.g. `"3"`) |

- Row absent ⇒ no prior session recorded (first-ever launch, FR-009).
- Row present but the referenced `workspaces.id` no longer exists ⇒ the
  saved workspace was deleted between sessions (Edge Case, FR-006).
- Row present and the referenced workspace exists ⇒ that workspace (draft or
  saved) is restored as the active workspace (FR-004).

Repo (`persistence::repo::settings`, extending the module added in 002):

- `get_last_active_workspace(conn) -> Result<Option<i64>>`
- `set_last_active_workspace(conn, workspace_id: i64) -> Result<()>` (upsert,
  same `ON CONFLICT (key) DO UPDATE` pattern as `set_mcp_port`)

Written once, on `RunEvent::Exit` (research.md §2). Read once, during
`setup()`, by `resolve_startup_workspace`.

## Startup resolution (in-process, not persisted)

`commands::workspace::resolve_startup_workspace(db: &Connection) ->
Result<workspace::Workspace>` (research.md §3):

```text
last_id = get_last_active_workspace(db)
if last_id is Some(id) and workspace::get(db, id) is Some(ws):
    return ws
return workspace::get_or_create_draft(db)
```

## Session file load (in-process, not persisted)

`commands::workspace::load_workspace_files(state: &Arc<AppState>, entries:
Vec<LogFileEntry>) -> Vec<LogFileSummary>` (research.md §4) — extracted from
the existing `open_workspace` loop, with no change to its per-file behavior:

- For each `LogFileEntry`, attempt `mmap_index::open(&entry.path)`.
  - On success: insert a `FileRuntime` into `state.files` keyed by
    `entry.alias`, spawn `index_and_detect_timestamps` in the background,
    `available = true`.
  - On failure (file moved/deleted): `available = false`; entry is skipped
    in `state.files` but still included in the returned summaries
    (FR-008/SC-004).
- Returns `Vec<LogFileSummary>` in the same shape `open_workspace` and
  `get_active_workspace` already return.

Callers (both replacing prior ad-hoc logic):

- `open_workspace`: sets `active_workspace_id`, clears `state.files`, then
  calls `load_workspace_files` with that workspace's entries.
- `setup()`: after `resolve_startup_workspace` and `AppState::new` (whose
  `state.files` is already empty), calls `load_workspace_files` with the
  resolved workspace's entries, before managing state / starting the MCP
  server.

## Key Entities (from spec.md, unchanged shapes)

- **Workspace** — `persistence::repo::workspace::Workspace` (unchanged).
- **Log File Reference** — `persistence::repo::log_file_entry::LogFileEntry`
  / `commands::types::LogFileSummary` (unchanged).
- **Last Active Workspace** — realized as the `LastActiveWorkspace`
  persisted row above.
