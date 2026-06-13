# Quickstart: Workspace and Log File Session Restore

Manual verification steps for the three user stories. Run `pnpm tauri dev`
unless noted otherwise. Each scenario assumes you can fully quit the app
(not just close the window, if those differ on your platform) between steps.

## US1 — Unsaved workspace files survive a restart

1. Launch the app into a fresh/empty draft workspace.
2. Add one or more existing log files (file picker or path entry).
3. Confirm the files load and are viewable/searchable.
4. Fully quit the app, then relaunch it.
5. **Expected**: the same files are listed, load without any "file
   unavailable" indicator, and remain viewable/searchable (FR-001/FR-002,
   SC-001).

## US2 — Application reopens to the last active saved workspace

1. Create a new workspace, add at least one log file, and save it under an
   alias (e.g. `incident-42`).
2. With `incident-42` still active, fully quit the app and relaunch it.
3. **Expected**: the app opens directly into `incident-42` with its file(s)
   loaded — no extra navigation (FR-004/FR-005, SC-002).
4. Switch to the unsaved/draft workspace (e.g. via "New Workspace" or the
   saved-workspaces list), then fully quit and relaunch.
5. **Expected**: the app opens into the draft workspace, not `incident-42`
   (Acceptance Scenario 3).
6. Repeat steps 2–3 at least five times in a row (quit/relaunch while
   `incident-42` is active each time).
7. **Expected**: every relaunch restores `incident-42` with its files loaded
   (FR-007, SC-003).

## US3 — Missing files don't block restoring the rest of a workspace

1. Add two log files to a workspace (draft or saved).
2. Fully quit the app.
3. Delete or move one of the two files on disk.
4. Relaunch the app.
5. **Expected**: the workspace opens; the remaining file loads and is fully
   accessible; the missing file is shown as unavailable, with no application
   error (FR-008, SC-004 — Acceptance Scenario 1).
6. Repeat, but delete/move *both* files before relaunching.
7. **Expected**: the workspace still opens, showing both files as
   unavailable (Acceptance Scenario 2).

## Edge cases

- **Deleted "last active" saved workspace**: save a workspace, quit while it
  is active, delete that workspace's `workspace.sqlite3` row out-of-band (or,
  via the UI, delete the saved workspace from a *different* prior session)
  so it no longer exists, then relaunch.
  **Expected**: the app falls back to the draft workspace with no error
  (FR-006).
- **First-ever launch**: remove the app's local data dir (so `app_settings`
  has no `last_active_workspace_id` row) and launch.
  **Expected**: the app opens to an empty draft workspace (FR-009).
- **Repeated empty restarts**: with no files ever added, quit and relaunch
  repeatedly.
  **Expected**: the app restores to the same empty workspace each time with
  no errors.
