# Phase 0 Research: Redesign App Shell UI

The spec has no remaining "NEEDS CLARIFICATION" markers. This phase records
the implementation-level decisions needed before design.

## 1. Menu bar implementation

- **Decision**: Build `MenuBar` on top of the already-declared
  `@radix-ui/react-dropdown-menu`. "Workspace" and "Help" are
  `DropdownMenu.Root`/`Trigger`/`Content`/`Item`s (New/Open/Save and About,
  respectively). "Options" is a plain `<button>` styled to match the other two
  triggers, but with no dropdown content — clicking it calls `onOpenSettings`
  directly, per FR-006 ("opens the settings dialog directly... no sub-items").
- **Rationale**: `@radix-ui/react-dropdown-menu` is already a `package.json`
  dependency (added presumably for this feature) but has zero current usages —
  this is its first real use. It gives keyboard navigation (arrow keys,
  Escape, typeahead) and correct ARIA roles (`menu`/`menuitem`) for free,
  satisfying Principle V without hand-rolling focus management. Making
  "Options" a plain button (not a 1-item dropdown) is simpler and matches the
  spec's explicit "it has no sub-items" framing (FR-006) — a `DropdownMenu`
  with a single item would force an extra click/keypress to reveal it.
- **Alternatives considered**: A custom `<nav>` + manually-managed
  open/close state for all three menus — rejected, reinvents Radix's focus
  trap/typeahead/outside-click handling for two of the three menus while
  adding no value for "Options". Headless UI / React Aria menu — rejected,
  would add a new dependency when Radix's dropdown-menu is already declared
  and used elsewhere in the app (`AppToolbar`'s sibling components use
  `@radix-ui/react-dialog`/`@radix-ui/react-tabs`).

## 2. App version for the About dialog

- **Decision**: `AboutDialog` calls `getVersion()` from `@tauri-apps/api/app`
  (already part of the `@tauri-apps/api` dependency) to read the version from
  `tauri.conf.json`/`Cargo.toml` (currently `0.1.0`) at runtime, with a
  `useState`/`useEffect` (or a tiny TanStack Query `useQuery`) wrapper so the
  dialog can render a fallback (`"—"` or "Unknown") while the promise resolves
  or if it rejects (Edge Cases: "A fallback/placeholder should be shown rather
  than leaving the field blank or erroring").
- **Rationale**: `getVersion()` is a built-in `@tauri-apps/api` function — no
  new Tauri command, no new capability entry, and it's guaranteed to match the
  version Tauri itself reports for the running build (the spec's Assumptions:
  "the same version value already tracked for the app"). This keeps the
  About dialog a pure frontend component.
- **Alternatives considered**: A new `get_app_version` Tauri command reading
  `tauri::AppHandle::package_info().version` — rejected as redundant with the
  existing `@tauri-apps/api` `getVersion()`, which calls the same underlying
  Tauri IPC plugin internally; adding a bespoke command would violate
  Principle III (no needless wrapper around something already exposed).
  Reading `package.json`'s `version` via a frontend import — rejected, that's
  the *npm package* version, not necessarily the same value as
  `tauri.conf.json`'s `version` (the one Tauri reports), and the two can drift.

## 3. Workspace rename: persistence, validation, uniqueness

- **Decision**: Add `persistence::repo::workspace::rename(conn, id, alias)`
  that trims the input, returns `AppError::InvalidWorkspaceName` (new variant)
  if the trimmed result is empty, and otherwise `UPDATE workspaces SET alias =
  ?1, modified_at = ... WHERE id = ?2`, mapping a `UNIQUE` constraint violation
  on `alias` to the existing `AppError::WorkspaceAliasInUse` (same mapping
  `save()` already does via `is_constraint_violation`). Crucially, `rename`
  does **not** touch `is_draft` — unlike `save()`, which also converts a draft
  into a saved workspace. A new `rename_workspace` Tauri command calls this on
  `*state.active_workspace_id` and returns the refreshed `WorkspaceSummary`
  (same shape as the other workspace commands).
- **Rationale**: FR-011/FR-012 require renaming to work for the *current*
  workspace regardless of whether it's an unsaved draft or already saved, and
  FR-013 requires rejecting empty/whitespace names while keeping the previous
  name. Reusing the existing `alias UNIQUE` index and `WorkspaceAliasInUse`
  error for collisions directly satisfies the Edge Case
  ("names are not required to be unique... unless existing save logic already
  enforces uniqueness, in which case that existing behavior is preserved") —
  `save()` already enforces uniqueness via this same constraint, so `rename`
  preserving it is the "existing behavior" the edge case asks to keep. Not
  flipping `is_draft` keeps `rename` orthogonal to `save`/`list_saved_workspaces`
  semantics: a renamed-but-unsaved draft still won't appear in "saved
  workspaces" until the user explicitly saves (FR-005/SC-001), matching
  today's behavior for drafts.
- **New error variant**: `AppError::InvalidWorkspaceName` (Display: "workspace
  name cannot be empty"). Added to `error.rs` alongside the existing
  `WorkspaceAliasInUse`/`WorkspaceNotFound` variants, and to the specta-derived
  `AppError` union (regenerated bindings) so `WorkspaceSidebar` can match on it
  to show the inline "name can't be empty" message and revert the input
  (FR-013).
- **Alternatives considered**: Client-side-only validation (skip empty
  strings, never call the backend) — rejected; Principle II requires
  validating command inputs in Rust regardless of frontend checks, and a
  belt-and-suspenders check is one `if` statement. Making `rename` go through
  `save()` (i.e., renaming always converts the draft to saved) — rejected, it
  would silently change `is_workspace_dirty`/`list_saved_workspaces` semantics
  as an unrequested side effect of typing a name, surprising for a draft the
  user hasn't explicitly chosen to save.

## 4. "Save" from the Workspace menu when already named (FR-005)

- **Decision**: `useWorkspaceActions`'s `handleSave()` checks the active
  workspace's current `alias`. If it's already set (non-null/non-empty —
  whether from a prior `save()` or from the new `rename_workspace`), it calls
  `saveWorkspace.mutate(currentAlias)` directly with no prompt. If `alias` is
  `null`, it opens the existing `SavePromptDialog` (reusing the `pendingAction`
  state machine already used for "New"/"Open" with unsaved changes), with a
  new `pendingAction: "save"` whose `proceedPendingAction` is a no-op (the
  save itself, done via the dialog's `onSave`, is the entire action — there's
  nothing further to "proceed" to, unlike "new"/"saved" which chain into
  creating/opening a workspace afterward).
- **Rationale**: Directly implements acceptance scenario 5 of US1 ("When the
  current workspace is unnamed, the existing save-naming prompt is shown; when
  it is already named, it is saved using its current name") with the smallest
  possible change to the existing `pendingAction`/`SavePromptDialog` machinery
  introduced in 003/004 — no new dialog component.
- **Alternatives considered**: Always show `SavePromptDialog` (pre-filled with
  the current alias) — rejected, contradicts FR-005's explicit "saved using
  its current name" (no prompt) branch and adds an unnecessary confirmation
  step for a workspace that already has a name. A brand-new "rename vs save"
  dialog — rejected as duplicating `SavePromptDialog`'s existing alias-entry
  form for no behavioral gain.

## 5. Splitting `WorkspacePage.tsx`

- **Decision**: Extract two pieces out of `WorkspacePage.tsx` (currently 369
  lines, over the 200-line TSX guideline even before this feature):
  1. `WorkspaceSidebar.tsx` — the entire `<aside>` block: workspace name +
     inline rename, "Add file" button + its dialog, and the file list
     (restyled, with an empty state).
  2. `useWorkspaceActions.ts` — the `handleNewWorkspace`/`handleOpenSavedWorkspaces`/
     `handleSave*`/`pendingAction`/`view`/`savePromptError` state and handlers,
     so both `MenuBar` (rendered in `App.tsx`, above `WorkspacePage`) and
     `WorkspacePage` (which still renders `SavedWorkspacesPage`/`SavePromptDialog`
     based on that shared state) can drive the same New/Open/Save flow.
- **Rationale**: FR-001-FR-009 move the New/Open/Save *triggers* up to a
  menu bar that lives in `App.tsx`, outside `WorkspacePage`, while the
  *consequences* (the save prompt dialog, the saved-workspaces view swap)
  still need to render inside the main content area. A small shared hook is
  the least-code way to keep one source of truth for that state without prop
  threading through `App.tsx` → `WorkspacePage` → back up, and it directly
  fixes the pre-existing 200-line overage as a byproduct (Principle III).
- **Alternatives considered**: React Context provider for workspace-shell
  state — rejected, `useWorkspaceActions` as a plain hook backed by a small
  Zustand slice (consistent with `useSearchUiStore`'s precedent from 004) is
  simpler and needs no provider wrapping in `App.tsx`. Leaving New/Open/Save
  handlers in `WorkspacePage` and having `MenuBar` call into `WorkspacePage`
  via a ref/imperative handle — rejected, inconsistent with the rest of the
  app's prop/hook-driven design and harder to test.

## 6. Search row control-height alignment (US3/FR-017)

- **Decision**: Give the search-type `<select>`, the query `<input>`, the
  submit `<button>`, and the history `<button>` (icon) a shared explicit
  height utility class (e.g. `h-9`) plus consistent `text-sm` sizing, with the
  icon button additionally getting a matching `w-9` and
  `flex items-center justify-center` so the icon stays centered in a
  now-square button. The row container keeps its existing `items-center`.
- **Rationale**: The current mismatch comes from each control deriving its
  height differently — `<select>`/`<input>` from `px-2 py-1` + native chrome
  (selects render taller than text inputs with identical padding in most
  browsers), the submit button from `text-xs px-2 py-1` (shorter text →
  shorter button), and the history icon button from `p-1` around a 16px icon
  (smaller still). An explicit shared height on all four removes the
  browser/content-driven variance directly, satisfying FR-017/SC-005 ("100%
  of the search row's controls... render at the same height... across at
  least three window widths") without depending on flexbox `stretch` (which
  wouldn't fix the `<select>`'s native intrinsic height).
- **Alternatives considered**: `items-stretch` on the row so all children
  stretch to the tallest — rejected, the tallest element is the `<select>`,
  whose height is itself the inconsistency to fix, and the result would be
  fragile across platforms/themes where `<select>` rendering differs.
  `appearance-none` on the `<select>` with custom dropdown-arrow styling —
  rejected as a larger visual change than requested (the spec only asks for
  equal *height*, not a redesigned select).
