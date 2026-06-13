# Quickstart: User-Configurable MCP Server Port

Manual verification steps for the four user stories. Run `pnpm tauri dev`
unless noted otherwise.

## US1 — Choose the MCP server port on first launch

1. Remove the app's local data dir (so `app_settings` has no `mcp_port` row)
   and launch the app.
2. **Expected**: `PortSetupDialog` appears and blocks the rest of the UI; no
   way to dismiss it without entering a port.
3. Enter a non-numeric value (e.g. `abc`) ⇒ validation message shown, cannot
   submit (FR-003).
4. Enter `99999` (out of range) ⇒ validation message shown, cannot submit
   (FR-003).
5. Start a second process bound to `127.0.0.1:<port>` (e.g.
   `nc -l 127.0.0.1 <port>`), then enter `<port>` in the dialog ⇒ "port
   unavailable" message, dialog stays open, prompts again (FR-005).
6. Stop the second process; enter the same `<port>` again ⇒ dialog closes,
   `get_mcp_status` now returns `{ configured: true, port: <port>, error: null }`.

## US2 — Agent tool connection instructions

1. Immediately after step 6 above, `AgentInstructionsDialog` appears.
2. Default tool selected shows a command/snippet containing `<port>`.
3. Switch the `<select>` to **Claude Code CLI** ⇒ command reads exactly
   `claude mcp add --transport http logfile-analyzer http://localhost:<port>/mcp`
   (FR-010).
4. Switch to **Kiro IDE** ⇒ JSON snippet for Kiro's MCP config, referencing
   `http://localhost:<port>/mcp` (FR-009).
5. Click "Copy" ⇒ clipboard contains the exact displayed text and a
   confirmation (e.g. toast/label change) appears (FR-011).
6. Close the dialog ⇒ main application is usable (WorkspacePage visible).

## US3 — Change the port later from Settings

1. Click the Settings (gear) button in the toolbar — verify it is visible
   from both the workspace view and the saved-workspaces view (FR-012).
2. `SettingsDialog` opens showing the currently configured port (FR-013).
3. Enter a different, available port and save:
   - `get_mcp_status` (or a fresh `claude mcp add ...` test) confirms the MCP
     server is reachable on the new port and the old port is released
     (FR-015).
   - Restart the app ⇒ the new port is still configured (persisted).
4. Enter a port already in use (per the `nc -l` trick above) and save ⇒
   "port unavailable" message, save does not complete, previous port remains
   active (FR-016).
5. Enter an invalid value (e.g. `0` or `-1`) ⇒ validation message, save
   disabled (FR-003/FR-014).
6. Open Settings, change nothing, close ⇒ `get_mcp_status` port is unchanged.

## US4 — MCP server fails to start

1. Configure a port `P` via Settings.
2. Quit the app. Start another process bound to `127.0.0.1:P` (e.g.
   `nc -l 127.0.0.1 P`).
3. Launch the app.
4. **Expected**: `McpErrorDialog` appears explaining the MCP server could not
   start (includes `P` and the reason if available) (FR-018).
5. Dismiss the dialog ⇒ open/view/search a log file normally (FR-019).
6. Reopen the error path (re-launch with `P` still occupied) ⇒ the dialog
   offers a "Go to Settings" action; use it to set a free port `Q` ⇒
   `get_mcp_status` now reports `{ configured: true, port: Q, error: null }`
   (FR-020).

## Regression check

- `cargo test -p logfile-analyzer` — including the updated
  `mcp_server_test.rs` (explicit port) and new `mcp_settings_test.rs`
  (configure success/conflict/invalid-port paths, `get_mcp_status`).
- `pnpm test` — new component tests for `PortSetupDialog`,
  `AgentInstructionsDialog`, `SettingsDialog`, `McpErrorDialog`, `AppToolbar`
  with mocked `@tauri-apps/api/mocks` IPC and mocked clipboard plugin.
- `tsc --noEmit`, `eslint .`, `cargo clippy -- -D warnings`,
  `cargo fmt --check`.
