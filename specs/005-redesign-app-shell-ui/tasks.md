# Tasks: Redesign App Shell UI

**Input**: Design documents from `/specs/005-redesign-app-shell-ui/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ipc-commands.md, quickstart.md

**Tests**: MANDATORY per the project constitution (Principle IV — Test-First Quality Gates). Each task that adds or changes behavior is preceded by a failing-test task in the same phase: Vitest + React Testing Library (mocked Tauri IPC/hooks) for frontend files, `cargo test` (in-memory `Connection` / Tauri mock runtime) for backend files.

**Organization**: Tasks are grouped by user story (US1–US3, per spec.md priorities) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependency on another task in flight)
- **[Story]**: Maps the task to a user story (US1–US3) for traceability
- All file paths are relative to the repository root

## Path Conventions (from plan.md)

- Frontend: `src/{components,hooks,ipc,pages}`, `src/App.tsx` — Tauri v2 + React 19 + TypeScript, existing Vitest/RTL setup
- Backend: `src-tauri/src/{commands,persistence,error.rs,lib.rs}`, `src-tauri/tests/` — Rust, `cargo test`
- No new top-level directories (plan.md "Structure Decision")

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: N/A — no new dependencies. `@radix-ui/react-dropdown-menu` and `@radix-ui/react-dialog` are already declared in `package.json` (research.md §1), and `@tauri-apps/api`'s `app.getVersion()` is part of the existing `@tauri-apps/api` dependency (research.md §2). Proceed directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extract the shared "New"/"Open"/"Save" workspace-action state and handlers (currently local to `WorkspacePage`) into `useWorkspaceActions` (data-model.md "Frontend-only state: `useWorkspaceActions`"), including the new `"save"` pending-action branch for FR-005. Both `MenuBar` (US1, wired from `App.tsx`) and `WorkspacePage` (US2, which still renders `SavePromptDialog`/`SavedWorkspacesPage`) depend on this hook.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T001 [P] In `src/hooks/useWorkspaceActions.test.ts` (new), write failing tests for a `useWorkspaceActions` hook per data-model.md: (1) `handleNewWorkspace()` — when `useIsWorkspaceDirty` is true, sets `pendingAction = "new"` and clears `savePromptError` without calling `createWorkspace`; when not dirty, calls `createWorkspace.mutate()` directly; (2) `handleOpenSavedWorkspaces()` — when dirty, sets `pendingAction = "saved"`; when not dirty, sets `view = "saved"`; (3) `handleSave()` — when the active workspace's `alias` is a non-empty string, calls `saveWorkspace.mutate(alias)` directly with **no** `pendingAction` change (FR-005, research.md §4); when `alias` is `null`, sets `pendingAction = "save"` and clears `savePromptError`; (4) `handleSavePromptSave(alias)`/`handleSavePromptDiscard()` — on success, clear `savePromptError`, clear `pendingAction`, and call `proceedPendingAction` for the action that was pending (`"new"` → `createWorkspace.mutate()`, `"saved"` → `view = "saved"`, `"save"` → no-op); on error, set `savePromptError` to the error message and leave `pendingAction` set; (5) `handleSavePromptCancel()` clears both `pendingAction` and `savePromptError`
- [X] T002 [US-foundational] Implement `src/hooks/useWorkspaceActions.ts` (new): a small Zustand store (following `useSearchUiStore`'s precedent, data-model.md) holding `view: "workspace" | "saved"`, `pendingAction: "new" | "saved" | "save" | null`, `savePromptError: string | null`, plus the handlers from T001 — `handleNewWorkspace`, `handleOpenSavedWorkspaces`, `handleSave`, `handleSavePromptSave`, `handleSavePromptDiscard`, `handleSavePromptCancel`, and `proceedPendingAction`. Reads `useActiveWorkspace`, `useIsWorkspaceDirty`, `useCreateWorkspace`, `useSaveWorkspace`, `useDiscardDraft` from `src/hooks/useWorkspace.ts` (depends on T001)
- [X] T003 Refactor `src/pages/WorkspacePage.tsx` to consume `useWorkspaceActions()` for `view`, `pendingAction`, `savePromptError`, `handleSavePromptSave/Discard/Cancel`, and the `SavePromptDialog`/`SavedWorkspacesPage` rendering, removing the now-duplicated local `useState`/handler definitions (`PendingAction` type, `runOrPromptSave`, `proceedPendingAction`, `handleNewWorkspace`, `handleOpenSavedWorkspaces`, `handleSavePromptSave/Discard/Cancel`, `view`/`pendingAction`/`savePromptError` state). Leave the `<aside>` sidebar markup (workspace name placeholder, "New"/"Saved" buttons, Add-file dialog, file list) and the rest of `<main>` unchanged — these are reworked in later phases. Update `src/pages/WorkspacePage.test.tsx` only if a test directly asserted on the removed local state shape (the New/Saved-button/save-prompt behavior itself must keep passing unchanged) (depends on T002)

**Checkpoint**: `useWorkspaceActions` is ready and `WorkspacePage` consumes it for the save-prompt/saved-view flow — user story implementation can now begin.

---

## Phase 3: User Story 1 - Use a proper menu bar for app-level actions (Priority: P1) 🎯 MVP

**Goal**: Replace the top toolbar (`AppToolbar`, with its standalone settings cog) with a `MenuBar` exposing exactly three top-level menus — **Workspace** (New/Open/Save), **Options** (opens settings directly), and **Help** (About, showing the app version) — wired in `App.tsx` via `useWorkspaceActions` (FR-001–FR-009).

**Independent Test**: Open the app, use the top menu bar to create a new workspace, open a saved workspace, save the current workspace, open settings via "Options", and view the app version via "Help > About" — all without using any sidebar controls or a visible gear/cog icon.

### Tests for User Story 1 (MANDATORY per constitution) ⚠️

- [X] T004 [P] [US1] In `src/components/MenuBar.test.tsx` (new), write failing tests for a `MenuBar` component implementing the `MenuBarProps` interface from data-model.md (`onNewWorkspace`, `onOpenSavedWorkspaces`, `onSaveWorkspace`, `onOpenSettings`, `onOpenAbout`): renders exactly three top-level triggers labeled "Workspace", "Options", and "Help", and renders **no** settings/gear/cog icon anywhere (FR-001/FR-007/SC-002); opening the "Workspace" `DropdownMenu` shows `menuitem`s "New", "Open", and "Save" (FR-002), and clicking each calls `onNewWorkspace`/`onOpenSavedWorkspaces`/`onSaveWorkspace` respectively; "Options" is a plain `<button>` (no dropdown content) that calls `onOpenSettings` directly when clicked (FR-006); opening the "Help" `DropdownMenu` shows a "About" `menuitem` (FR-008) that calls `onOpenAbout` when clicked
- [X] T005 [P] [US1] In `src/components/AboutDialog.test.tsx` (new), write failing tests for an `AboutDialog` component (Radix `Dialog`, controlled via `open`/`onOpenChange`): when open, it calls `getVersion()` from `@tauri-apps/api/app` (mocked) and displays the resolved version string (FR-009); while the promise is pending, or if it rejects, it shows a fallback placeholder (e.g. "—") instead of a blank or erroring field (Edge Cases)
- [X] T006 [P] [US1] In `src/App.test.tsx` (new), write failing tests for the shell: `App` renders `MenuBar` and does **not** render `AppToolbar` or any standalone settings/gear button (FR-007/SC-002); selecting "Options" from `MenuBar` opens `SettingsDialog`; selecting "Help" → "About" opens `AboutDialog`; `MenuBar`'s "Workspace" → "New"/"Open"/"Save" items are wired so that clicking them invokes the corresponding `useWorkspaceActions` handlers (mock `useWorkspaceActions`/`useWorkspace` hooks as needed)

### Implementation for User Story 1

- [X] T007 [P] [US1] Implement `src/components/MenuBar.tsx` (new) per data-model.md's `MenuBarProps`: "Workspace" and "Help" as `@radix-ui/react-dropdown-menu` `Root`/`Trigger`/`Content`/`Item`s (New/Open/Save and About respectively); "Options" as a plain `<button>` styled to match the other two triggers that calls `onOpenSettings` directly with no dropdown content (research.md §1) (depends on T004)
- [X] T008 [P] [US1] Implement `src/components/AboutDialog.tsx` (new): a Radix `Dialog` (consistent with `SettingsDialog`/`SavePromptDialog`'s existing pattern) that calls `getVersion()` from `@tauri-apps/api/app` in a `useState`/`useEffect`, rendering the resolved version or a fallback placeholder while pending/on rejection (research.md §2) (depends on T005)
- [X] T009 [US1] Modify `src/App.tsx`: remove the `AppToolbar` import/usage; render `MenuBar` wired via `useWorkspaceActions()` (`onNewWorkspace={handleNewWorkspace}`, `onOpenSavedWorkspaces={handleOpenSavedWorkspaces}`, `onSaveWorkspace={handleSave}`), `onOpenSettings={() => setSettingsOpen(true)}` (existing `settingsOpen` state), and a new local `aboutOpen` state wired to `onOpenAbout`/`AboutDialog`'s `open`/`onOpenChange` (depends on T002, T006, T007, T008)
- [X] T010 [P] [US1] Delete `src/components/AppToolbar.tsx` and `src/components/AppToolbar.test.tsx` (superseded by `MenuBar`'s "Options" item, per plan.md) (depends on T009)

**Checkpoint**: User Story 1 is fully functional and independently testable — the top bar is a menu bar with Workspace/Options/Help, no cog icon, and New/Open/Save/Options/About all work from it.

---

## Phase 4: User Story 2 - Rename and manage the workspace from the sidebar (Priority: P2)

**Goal**: Turn the left sidebar into a focused "current workspace" panel: an inline-renamable workspace name at the top (FR-010–FR-013, backed by a new `rename_workspace` command), an "Add file" button (FR-014, moved as-is), and a restyled file list with an empty state (FR-015/FR-016).

**Independent Test**: Open a workspace, click its name in the sidebar to rename it, confirm the new name persists, add a file via "Add file", and review the file list's improved layout/styling and empty state.

### Backend tests (MANDATORY per constitution) ⚠️

- [X] T011 [P] [US2] In `src-tauri/src/persistence/repo/workspace.rs`'s `#[cfg(test)]` module, write failing tests for a new `rename(conn, id, alias)` function (research.md §3, data-model.md): renaming a draft or saved workspace to a non-empty alias updates `alias` and bumps `modified_at` **without** changing `is_draft`; an alias with surrounding whitespace is trimmed before storing; an empty or whitespace-only alias returns `Err(AppError::InvalidWorkspaceName)` and leaves the row's `alias`/`modified_at` unchanged; renaming to an alias already used by another workspace returns `Err(AppError::WorkspaceAliasInUse)` and leaves the row unchanged (mirrors `save_rejects_alias_collision`)
- [X] T012 [P] [US2] In `src-tauri/tests/workspace_persistence_test.rs`, write failing integration tests (Tauri mock runtime, mirroring `save_workspace_converts_draft_and_keeps_files`) for a new `commands::workspace::rename_workspace(state, alias)` command: renaming the active (draft or saved) workspace returns a `WorkspaceSummary` with the updated `alias`, unchanged `is_draft`, and unchanged `files`; an empty/whitespace `alias` returns `AppError::InvalidWorkspaceName`; an `alias` colliding with another saved workspace's alias returns `AppError::WorkspaceAliasInUse`

### Backend implementation

- [X] T013 [US2] In `src-tauri/src/error.rs`, add the `InvalidWorkspaceName` variant to `AppError` (no payload) with `Display` text "workspace name cannot be empty" (data-model.md), alongside the existing `WorkspaceAliasInUse`/`WorkspaceNotFound` variants, so it's included in the specta-derived union (depends on T011, T012)
- [X] T014 [US2] In `src-tauri/src/persistence/repo/workspace.rs`, implement `rename(conn, id, alias)` per research.md §3: trim `alias`; if empty, return `Err(AppError::InvalidWorkspaceName)` without writing; otherwise `UPDATE workspaces SET alias = ?1, modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?2`, mapping a `UNIQUE` constraint violation via `is_constraint_violation` to `AppError::WorkspaceAliasInUse` (same pattern as `save`); does **not** touch `is_draft`. Run `cargo test` for this module to confirm T011 passes (depends on T011, T013)
- [X] T015 [US2] In `src-tauri/src/commands/workspace.rs`, implement the `rename_workspace` Tauri command (`#[tauri::command] #[specta::specta]`): calls `workspace::rename` on `*state.active_workspace_id`, then returns the refreshed `WorkspaceSummary` (`id`, `alias`, `is_draft`, `files` via `list_file_summaries`) exactly like `save_workspace`. Run `cargo test --test workspace_persistence_test` to confirm T012 passes (depends on T012, T014)
- [X] T016 [US2] In `src-tauri/src/lib.rs`, add `workspace::rename_workspace` to the `collect_commands!` list, then run `cargo test export_typescript_bindings` (from `src-tauri/`) to regenerate `src/bindings/index.ts` with the `renameWorkspace` command and the `InvalidWorkspaceName` `AppError` variant (depends on T015)

### Frontend tests (MANDATORY per constitution) ⚠️

- [X] T017 [P] [US2] In `src/components/WorkspaceSidebar.test.tsx` (new), write failing tests for a `WorkspaceSidebar` component: (1) renders `workspace.alias` (or "Untitled workspace" if `null`) at the top (FR-010); (2) clicking the name switches to an editable text input pre-filled with the current name (FR-011); (3) committing via Enter or blur with a non-empty trimmed value calls `useRenameWorkspace`'s mutate with the trimmed value, and on success exits edit mode (FR-012); (4) committing an empty/whitespace-only value exits edit mode **without** calling the rename mutation and restores the previous name (FR-013); (5) pressing Escape while editing exits edit mode, discards the draft text, and restores the original name without calling the mutation (acceptance scenario 4); (6) on a `WorkspaceAliasInUse`/`InvalidWorkspaceName` error from the mutation, an inline error message is shown and edit mode remains active; (7) an "Add file" button is rendered below the name and opens the add-file dialog (existing flow, FR-014); (8) given `workspace.files` with entries, each renders its alias plus availability (⚠) and indexing (…) indicators and a remove (×) action, with improved spacing/styling (FR-015); (9) given an empty `workspace.files`, an empty-state message is shown instead of the list (FR-016)

### Frontend implementation

- [X] T018 [P] [US2] In `src/ipc/workspace.ts`, add `renameWorkspace(alias: string): Promise<WorkspaceSummary>` wrapping `commands.renameWorkspace(alias)` via `unwrapResult`, per contracts/ipc-commands.md (depends on T016)
- [X] T019 [P] [US2] In `src/hooks/useWorkspace.ts`, add `useRenameWorkspace()`: a `useMutation` wrapping `renameWorkspace` whose `onSuccess` calls `queryClient.setQueryData(workspaceQueryKey, workspace)` (same pattern as `useSaveWorkspace`) (depends on T018)
- [X] T020 [US2] Implement `src/components/WorkspaceSidebar.tsx` (new) per T017: extract the workspace-name header (with click-to-rename via local `editing`/`draftName` state and `useRenameWorkspace`, per data-model.md's transitions), the "Add file" button + dialog (moved as-is from `WorkspacePage.tsx`'s current `<aside>`), and a restyled file list (improved spacing/alignment, existing `available`/`indexing_complete` indicators and remove action) with an empty-state message when `workspace.files.length === 0` (depends on T019, T020 tests T017)
- [X] T021 [US2] Modify `src/pages/WorkspacePage.tsx`: replace the entire `<aside>` block (workspace-name placeholder, "New"/"Saved" buttons — now redundant with `MenuBar`'s Workspace menu from US1 — Add-file dialog, and file list) with `<WorkspaceSidebar workspace={workspace} selectedAlias={selectedAlias} onSelectFile={setSelectedAlias} onRemoveFile={handleRemoveFile} />` (or equivalent props); remove the now-unused local state/handlers that moved into `WorkspaceSidebar` (`dialogOpen`, `path`, `alias`, `handleAddFile`, `handleBrowseForFile`, the inline file-list JSX). Update `src/pages/WorkspacePage.test.tsx` to assert the sidebar renders via `WorkspaceSidebar` and that the standalone "New"/"Saved" buttons are gone from the page (depends on T003, T009, T020)

**Checkpoint**: User Stories 1 AND 2 both work independently — the sidebar shows a renamable workspace name, "Add file", and a restyled file list with empty state, and the menu bar still drives New/Open/Save/Options/About.

---

## Phase 5: User Story 3 - Consistent height for search row controls (Priority: P3)

**Goal**: The search-type select, query input, search button, and history icon all render at the same height and stay aligned across window widths (FR-017/SC-005).

**Independent Test**: Open a file and view the search row — the search type select (Logical/Regex), the search text input, the search button, and the search history icon should all render at the same height and be vertically aligned, including after resizing the window.

### Tests for User Story 3 (MANDATORY per constitution) ⚠️

- [X] T022 [P] [US3] In `src/components/SearchBar.test.tsx`, write failing assertions (research.md §6) that the search-type `<select>`, the query `<input>`, the submit `<button>`, and the history icon `<button>` all share the same height utility class (e.g. `h-9`) and `text-sm` sizing, and that the history icon button additionally has a matching `w-9` and centers its icon (`flex items-center justify-center`)

### Implementation for User Story 3

- [X] T023 [US3] In `src/components/SearchBar.tsx`, apply the shared `h-9 text-sm` class to the search-type `<select>`, the query `<input>`, and the submit `<button>` (replacing their current mismatched padding-derived heights), and apply `h-9 w-9 flex items-center justify-center text-sm` to the history icon `<button>` so it becomes a square button matching the row height, keeping the row container's existing `items-center` (depends on T022)

**Checkpoint**: All of US1–US3 are independently functional — menu bar, workspace sidebar with rename/file list, and an evenly-aligned search row.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all user stories (Principle IV quality gates, quickstart.md).

- [X] T024 [P] Run `cargo fmt --check` and `cargo clippy -- -D warnings` from `src-tauri/`
- [X] T025 [P] Run `pnpm exec tsc --noEmit` and `pnpm exec eslint .`
- [X] T026 Run `pnpm test` (Vitest, all new/updated component and hook tests) and `cargo test` (full suite, including the new `rename`/`rename_workspace` tests) to confirm everything passes
- [ ] T027 Run the `quickstart.md` manual verification steps for US1–US3 against `pnpm tauri dev`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No tasks — nothing to do
- **Foundational (Phase 2)**: No dependency on Setup; BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (T002) — no dependency on other stories
- **User Story 2 (Phase 4)**: Depends on Foundational (T002/T003) and on US1's `App.tsx`/`WorkspacePage.tsx` edits (T009) only insofar as both touch `WorkspacePage.tsx`'s `<aside>`/imports — otherwise independently testable per its own acceptance criteria
- **User Story 3 (Phase 5)**: Fully independent — touches only `src/components/SearchBar.tsx`/`SearchBar.test.tsx`
- **Polish (Phase 6)**: Depends on all three user stories being complete

### Within Each User Story

- Tests are written and expected to fail before implementation
- Backend (error variant → repo function → command → bindings regeneration) before any frontend code that depends on the new IPC shape (US2)
- Story complete before moving to the next priority

### Parallel Opportunities

- T004, T005, T006 (US1 tests, different files) can run in parallel
- T007, T008 (US1 components, different files) can run in parallel once their respective tests (T004/T005) are written
- T010 can run in parallel with other US1 cleanup once T009 lands
- T011 and T012 (US2 backend tests, different files) can run in parallel
- T018 and T019 (US2 IPC wrapper + hook) can run in parallel once T016 lands
- T024 and T025 (Polish) can run in parallel
- T003 (Foundational WorkspacePage refactor) and T004–T008 (US1 tests/components, different files) can run in parallel once T002 lands

---

## Parallel Example: User Story 1 tests

```bash
# Launch all three US1 test tasks together:
Task: "MenuBar contents/callbacks tests in src/components/MenuBar.test.tsx"
Task: "AboutDialog version/fallback tests in src/components/AboutDialog.test.tsx"
Task: "App shell tests (menu bar present, no cog) in src/App.test.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
2. Complete Phase 3: User Story 1
3. **STOP and VALIDATE**: Use the menu bar for New/Open/Save/Options/About; confirm no cog icon remains
4. Deploy/demo if ready — this alone delivers the core "clear separation" structural change

### Incremental Delivery

1. Complete Foundational → `useWorkspaceActions` ready, `WorkspacePage` consumes it
2. Add User Story 1 → Validate independently (menu bar replaces toolbar) → Demo (MVP!)
3. Add User Story 2 → Validate independently (renamable sidebar, restyled file list + empty state) → Demo
4. Add User Story 3 → Validate independently (search row control heights match) → Demo
5. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- US2's removal of the "New"/"Saved" sidebar buttons (T021) is safe only after US1's `MenuBar` (T009) provides equivalent actions — if US2 is implemented before US1 in practice, keep the sidebar buttons until US1 lands to avoid removing the only entry point for these actions
