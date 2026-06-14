# Phase 1 Data Model: Redesign App Shell UI

Two layers, as in prior features: **Persisted** (SQLite) and
**Runtime/Frontend** (in-memory, never stored). This feature makes one small
persisted-entity addition (a new write path + error variant on the existing
`Workspace`/`alias` column) and adds frontend-only shell/UI state. No schema
migration is needed — `workspaces.alias` already exists with a `UNIQUE`
constraint (001's schema).

---

## Persisted entities

### Workspace (existing — new write path)

| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | unchanged |
| alias | text, `UNIQUE`, nullable | **NEW write path**: `rename(conn, id, alias)` (research.md §3) updates this column directly, independent of `is_draft`/`save()`. Existing `save()` write path unchanged. |
| is_draft | integer (bool) | unchanged. `rename` does **not** modify this — a draft renamed via the sidebar stays a draft (FR-010-FR-012) until explicitly saved via the Workspace menu's "Save" (FR-005). |
| created_at / modified_at | timestamp | `rename` bumps `modified_at` like `touch()`/`save()` do. |

- **Validation (FR-013)**: `rename` trims the input; if the trimmed string is
  empty, returns `AppError::InvalidWorkspaceName` and leaves the row
  unchanged (the frontend keeps showing the previous name).
- **Uniqueness (Edge Cases)**: the existing `alias UNIQUE` index applies to
  `rename` exactly as it does to `save` — a collision with another
  workspace's alias returns `AppError::WorkspaceAliasInUse` (reused, no new
  variant), and the row is left unchanged.
- **No migration**: `alias`, its `UNIQUE` constraint, and `modified_at` all
  already exist (001's schema). This feature only adds a new code path that
  writes to them.

### AppError (existing — new variant)

| Variant | Payload | Display | When |
|---------|---------|---------|------|
| `InvalidWorkspaceName` (NEW) | none | "workspace name cannot be empty" | `rename_workspace` called with an empty/whitespace-only alias (FR-013) |

All other variants (`WorkspaceAliasInUse`, `WorkspaceNotFound`,
`NoActiveWorkspace`, etc.) are unchanged and reused as-is.

---

## IPC/runtime entity: `WorkspaceSummary` (existing — unchanged shape)

```ts
type WorkspaceSummary = {
  id: number;
  alias: string | null;
  is_draft: boolean;
  files: LogFileSummary[];
};
```

No field changes. `rename_workspace` returns this same shape (with `alias`
updated), exactly like `create_workspace`/`save_workspace`/`open_workspace`
already do. `WorkspaceSidebar` reads `workspace.alias` for the header (falling
back to "Untitled workspace" when `null`, matching current behavior) and
`workspace.files` for the file list (unchanged: `alias`, `available`,
`has_timestamp_format`, `indexing_complete`).

---

## Frontend-only state

### `useWorkspaceActions` shared shell state (Zustand, new)

A small store (or `useState` inside a singleton hook backed by Zustand for
cross-component sharing, following `useSearchUiStore`'s precedent) holding
the state that used to live in `WorkspacePage` and now must be reachable from
both `MenuBar` (in `App.tsx`) and `WorkspacePage`:

| Field | Type | Notes |
|-------|------|-------|
| view | `"workspace" \| "saved"` | Drives whether `WorkspacePage` renders the main workspace view or `SavedWorkspacesPage` (existing behavior, moved). |
| pendingAction | `"new" \| "saved" \| "save" \| null` | Which action is blocked on the save prompt. `"save"` is **new** (research.md §4) — its `proceedPendingAction` is a no-op. |
| savePromptError | `string \| null` | Error surfaced inside `SavePromptDialog` (existing behavior, moved). |

**Exposed handlers** (used by `MenuBar` via `App.tsx`, and internally by
`WorkspacePage` for the dialog/view it still renders):
- `handleNewWorkspace()` — unchanged logic (prompt if dirty, else
  `createWorkspace.mutate()`).
- `handleOpenSavedWorkspaces()` — unchanged logic (prompt if dirty, else
  `view = "saved"`).
- `handleSave()` — **new**: if `workspace.alias` is set, calls
  `saveWorkspace.mutate(workspace.alias)` directly (FR-005, research.md §4);
  else sets `pendingAction = "save"` to open `SavePromptDialog`.
- `handleSavePromptSave/Discard/Cancel` — unchanged logic (moved as-is).

### Workspace rename (local component state, `WorkspaceSidebar`)

| Field | Type | Notes |
|-------|------|-------|
| editing | boolean | Whether the workspace-name header is in edit mode (FR-011). |
| draftName | string | In-progress text while editing; initialized from `workspace.alias ?? ""` on entering edit mode. |

**Transitions**:
- Click name (not editing) → `editing = true`, `draftName = workspace.alias ?? ""`.
- Commit (Enter / blur) → if `draftName.trim() === ""`, discard the edit and
  set `editing = false` without calling the backend (FR-013, "reject... retain
  the previous name" — handled client-side first to avoid a round trip for the
  obvious empty case; the backend still validates as defense-in-depth per
  Principle II). Otherwise call `useRenameWorkspace().mutate(draftName.trim())`;
  on success, `editing = false` (the displayed name now comes from the
  refreshed `workspace.alias`); on `WorkspaceAliasInUse`/`InvalidWorkspaceName`
  error, show the message inline and keep `editing = true` so the user can
  correct it.
- Escape → `editing = false`, `draftName` discarded, no backend call
  (FR-013/acceptance scenario 4 — "original workspace name is restored
  unchanged").

### File list item (existing shape, restyled only)

No field changes to `LogFileSummary { alias, path, available,
has_timestamp_format, indexing_complete }`. `WorkspaceSidebar`'s list renders
the same per-file `available`/`indexing_complete` indicators and "remove"
action as today (FR-015), plus a new empty-state message when
`workspace.files.length === 0` (FR-016).

---

## Menu Bar (stateless)

`MenuBar` itself holds no state — it's a controlled component:

```ts
interface MenuBarProps {
  onNewWorkspace: () => void;
  onOpenSavedWorkspaces: () => void;
  onSaveWorkspace: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
}
```

`App.tsx` wires `onNewWorkspace`/`onOpenSavedWorkspaces`/`onSaveWorkspace`
from `useWorkspaceActions()`, `onOpenSettings` to the existing
`setSettingsOpen(true)`, and `onOpenAbout` to a new local `aboutOpen` state
toggle (`AboutDialog`'s `open`/`onOpenChange`).

## About Dialog (frontend-only)

| Field | Type | Notes |
|-------|------|-------|
| version | `string \| null` | Result of `getVersion()` (research.md §2); `null`/pending shows a fallback placeholder (Edge Cases). |
