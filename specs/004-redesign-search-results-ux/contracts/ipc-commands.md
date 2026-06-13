# IPC Contract Changes: Redesigned Search Results UX

Delta on top of `specs/001-log-analyzer-mcp-server/contracts/ipc-commands.md`.
Only commands/types touched by this feature are listed; everything else
(`search`, `search_with_context`, file/highlight/workspace/settings commands)
keeps its existing contract.

## Search (US1–US4 — FR-001–FR-019)

| Command | Input | Output | Notes |
|---------|-------|--------|-------|
| `search` | `{ alias, query, search_type, time_from?, time_to?, channel }` | `()` (streams `SearchMatchBatch`) | **Unchanged signature.** Now the frontend's source for the results panel (FR-001), the gray-highlight line set (FR-005), and prev/next navigation order (FR-006/FR-017). Still records a `SearchHistoryEntry` (see below). |
| `search_with_context` | `{ alias, query, search_type, surrounding_count?, time_from?, time_to?, channel }` | `()` (streams `SearchWithContextBatch`) | **Unchanged.** Still used by the MCP `search_with_context` tool (FR-029); no longer called by the desktop UI. |
| `get_search_history` | **`{}`** (no `alias`) | `SearchHistoryEntry[]` | **CHANGED**: dropped `alias` param. Returns the *active workspace's* full search history, most-recent-first by `last_used_at` (FR-012/FR-013). Backs both the autocomplete suggestions (FR-010, filtered/sliced client-side) and the history overlay (FR-012, full list). |

### `SearchHistoryEntry` (CHANGED)

```ts
type SearchHistoryEntry = {
  id: number;
  workspace_id: number;       // was `file_id`
  query: string;
  search_type: SearchType;
  time_from: number | null;   // epoch ms
  time_to: number | null;     // epoch ms
  last_used_at: string;       // was `executed_at`; bumped on dedup re-run (FR-012)
};
```

### Recording behavior (FR-012, both `search` and `search_with_context`)

Both commands continue to record a history entry on every invocation, but now
keyed by `workspace_id = *state.active_workspace_id` instead of the
searched file's `file_id`. If an entry with the same `(workspace_id, query,
search_type, time_from, time_to)` already exists, its `last_used_at` is
updated (moved to most-recent) instead of inserting a duplicate row.

## No new commands

The results panel, gray highlighting, prev/next navigation, autocomplete, and
history overlay are all implemented in the frontend on top of `search` and
`get_search_history` — no new Tauri commands or MCP tools are introduced.

## Capabilities

No new `src-tauri/capabilities/*.json` entries — no new commands, plugins, or
permissions.
