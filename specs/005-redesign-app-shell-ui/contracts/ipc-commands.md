# IPC Contract Changes: Redesign App Shell UI

Delta on top of `specs/001-log-analyzer-mcp-server/contracts/ipc-commands.md`
and `specs/004-redesign-search-results-ux/contracts/ipc-commands.md`. Only the
command/type touched by this feature is listed; everything else (`search`,
`get_search_history`, file/highlight/settings commands, and the existing
workspace commands `create_workspace`/`get_active_workspace`/`save_workspace`/
`discard_draft`/`list_saved_workspaces`/`open_workspace`/`is_workspace_dirty`)
keeps its existing contract and signature.

## Workspace (US1/US2 — FR-010-FR-013)

| Command | Input | Output | Notes |
|---------|-------|--------|-------|
| `rename_workspace` (NEW) | `{ alias: string }` | `WorkspaceSummary` | Renames the **active** workspace (`*state.active_workspace_id`, server-derived — no workspace id from the client) in place. Trims `alias`; rejects an empty/whitespace-only result with `InvalidWorkspaceName` (FR-013), leaving the row unchanged. On success, behaves like the other workspace commands: returns the refreshed `WorkspaceSummary` (`id`, `alias`, `is_draft`, `files`). Unlike `save_workspace`, does **not** change `is_draft` (research.md §3). |

### `AppError` (CHANGED — new variant)

```ts
type AppError =
  | { kind: "NoActiveWorkspace" }
  | { kind: "WorkspaceNotFound" }
  | { kind: "FileAlreadyInWorkspace" }
  | { kind: "AliasCollision" }
  | { kind: "WorkspaceAliasInUse" }
  | { kind: "InvalidWorkspaceName" }   // NEW
  | { kind: "FileNotFound" }
  | { kind: "FileUnavailable" }
  | { kind: "LineOutOfRange" }
  | { kind: "InvalidQuery" }
  | { kind: "TimeRangeUnavailable" }
  | { kind: "InvalidPort" }
  | { kind: "PortUnavailable"; message: string }
  | { kind: "Io"; message: string };
```

`rename_workspace` can fail with:
- `InvalidWorkspaceName` — trimmed `alias` is empty (FR-013).
- `WorkspaceAliasInUse` — `alias` collides with another workspace's alias
  (Edge Cases; same error `save_workspace` already returns for the same
  constraint).
- `NoActiveWorkspace` — no active workspace (should not normally occur; same
  guard as `get_active_workspace`/`is_workspace_dirty`).

### `src/ipc/workspace.ts` (CHANGED — new wrapper)

```ts
/** Renames the active workspace in place, independent of draft/saved state
 *  (FR-011/FR-012). Rejects with InvalidWorkspaceName (empty/whitespace) or
 *  WorkspaceAliasInUse (collision, FR-013/Edge Cases). */
export async function renameWorkspace(alias: string): Promise<WorkspaceSummary> {
  return unwrapResult(await commands.renameWorkspace(alias));
}
```

## No other new commands

The menu bar (Workspace/Options/Help), the About dialog, the restyled file
list/empty state, and the search-row height fix are all implemented in the
frontend on top of existing commands (`create_workspace`, `save_workspace`,
`list_saved_workspaces`/`open_workspace`, `add_file`/`remove_file`) plus
`@tauri-apps/api/app`'s built-in `getVersion()` (research.md §2) — no new
Tauri commands or MCP tools beyond `rename_workspace`.

## Capabilities

No new `src-tauri/capabilities/*.json` entries. `rename_workspace` is a custom
app command following the same pattern as the existing workspace commands,
none of which have per-command capability entries — only `core:default` plus
the plugin permissions already listed in `default.json`.
