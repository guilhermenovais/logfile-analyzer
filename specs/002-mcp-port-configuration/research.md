# Research: User-Configurable MCP Server Port

All technical unknowns from the Technical Context are resolved below.

## 1. Port persistence mechanism

- **Decision**: New `app_settings` key-value SQLite table
  (`key TEXT PRIMARY KEY, value TEXT NOT NULL`), with a single `mcp_port` row
  holding the configured port as a decimal string. New repo module
  `persistence::repo::settings` with `get_mcp_port`/`set_mcp_port`.
- **Rationale**: The SQLite database + migration pattern (`schema.rs`,
  `persistence::repo::*`) already exists and is opened at startup before the
  MCP server starts. The MCP port is explicitly an app-wide singleton setting
  (Assumptions), which a flat key-value table represents more naturally than
  adding nullable columns to `workspaces`.
- **Alternatives considered**:
  - `tauri-plugin-store` (JSON file) — rejected: introduces a second
    persistence mechanism for a single integer when SQLite is already open.
  - A new column on `workspaces` — rejected: there is no "app-wide singleton"
    row, and this would conflate per-workspace and app-wide settings.

## 2. Port availability check + reconfiguration strategy

- **Decision**: A single Rust operation, `mcp::server::start(state, port)`,
  performs the real `TcpListener::bind(("127.0.0.1", port))`. The
  `configure_mcp_port` command calls it directly: success means the port is
  available *and* immediately becomes the running server (the previous handle
  is shut down and the port persisted in the same step); an `AddrInUse` /
  `PermissionDenied` bind error maps to `AppError::PortUnavailable` without
  persisting anything or touching the currently-running server (FR-016).
- **Rationale**: The bind attempt *is* the availability check, so there is no
  separate "dry run then apply" path, no TOCTOU race between checking and
  binding, and no extra IPC round trip (Principle III).
- **Alternatives considered**:
  - A separate `check_port_available` command (bind-then-drop) followed by a
    second "apply" command — rejected: doubles bind attempts, leaves a race
    window between the two calls, and adds complexity for no behavioral gain.

## 3. Hot-swapping the running MCP server

- **Decision**: Wrap the existing `McpServerHandle` in new Tauri-managed
  state `McpServerState(Mutex<McpRuntimeStatus>)`, where
  `McpRuntimeStatus` is `Running(McpServerHandle) | Failed(String)`.
  `configure_mcp_port` locks the mutex, calls `start(state, new_port)`, shuts
  down the previous handle on success, and stores the new one.
  `setup()` populates this at startup from the persisted port, recording
  `Failed(reason)` if the initial bind fails so `get_mcp_status` can surface
  the FR-018 error dialog while the rest of the app still starts normally.
- **Rationale**: Minimal change to the existing `mcp::server` module; keeps
  "is the MCP server up, and on which port" in one place that both the exit
  handler and `get_mcp_status` read.
- **Same-port no-op** (Edge Cases): `configure_mcp_port` first compares
  `port` against the currently `Running` port; if equal, it returns success
  immediately without rebinding or touching persistence.
- **Alternatives considered**: restarting the whole Tauri process on port
  change — rejected, violates FR-015 ("without requiring a full application
  restart").

## 4. Clipboard access (FR-011)

- **Decision**: Official `tauri-plugin-clipboard-manager` (v2,
  `tauri-apps/plugins-workspace`) + its `@tauri-apps/plugin-clipboard-manager`
  JS package, registered via `.plugin(tauri_plugin_clipboard_manager::init())`
  with a `clipboard-manager:allow-write-text` permission added to the main
  window's capability.
- **Rationale**: Matches the constitution's "prefer official
  `tauri-apps/plugins-workspace` plugins" guidance and Principle II's
  least-privilege capability model (one narrow `allow-write-text`
  permission), and is more reliable across platforms under Tauri's CSP than
  the raw `navigator.clipboard` Web API.
- **Alternatives considered**: `navigator.clipboard.writeText` — rejected for
  cross-platform reliability and to keep the capability grant explicit.

## 5. Agent tool connection profiles (FR-008, Assumptions)

- **Decision**: Static TS data module `src/lib/agentTools.ts` listing:
  - **Claude Code CLI** — `claude mcp add --transport http logfile-analyzer
    http://localhost:<port>/mcp` (FR-010, exact form required).
  - **Kiro IDE** (explicitly required) — JSON snippet for Kiro's
    `mcp.json` MCP server config, using a streamable-HTTP `url` entry
    pointing at `http://localhost:<port>/mcp`.
  - **Cursor**, **Windsurf**, **Cline** (VS Code) — JSON snippets for each
    tool's MCP server config file, all using the same `http://localhost:<port>/mcp`
    URL form, rounding out the "small set of other popular MCP-capable
    tools" called for in the Assumptions.

  Each entry is `{ id, name, instructions(port: number): string }`, where
  `instructions` returns the exact command/config text to display and copy.
- **Rationale**: This is static presentation content with no backend
  dependency; satisfies "curated list... finalized during planning"; keeps
  `AgentInstructionsDialog` itself generic over whichever profile is selected
  (FR-009/FR-021).
- **Alternatives considered**: serving the list from a Rust command —
  rejected, it's static app content, not user data; no reason to cross the
  IPC boundary.

## 6. Tool picker control (FR-008)

- **Decision**: A plain, styled native `<select>` element with an associated
  `<label>`, not a new `@radix-ui/react-select` dependency.
- **Rationale**: A native `<select>` is keyboard- and screen-reader-accessible
  out of the box (Principle V); Principle V's "build on a headless UI library"
  guidance targets *custom* widgets (modals, dropdowns built from scratch),
  not the platform select. Avoids a new dependency (Principle III).
- **Alternatives considered**: `@radix-ui/react-select` — rejected as an
  unnecessary dependency for a control the platform already provides
  accessibly.

## 7. Toolbar placement (FR-012)

- **Decision**: New `AppToolbar` component, rendered once in `App.tsx` above
  whichever page (`WorkspacePage` or `SavedWorkspacesPage`) is currently
  shown, containing the Settings button (gear icon from the already-installed
  `lucide-react`).
- **Rationale**: FR-012 requires the Settings button to be reachable "at all
  times during normal use." `WorkspacePage`'s per-view header is not rendered
  while `SavedWorkspacesPage` is shown, so the control must live at the app
  shell level, above both.
- **Alternatives considered**: adding the button to `WorkspacePage`'s
  existing `<aside>` header — rejected, not visible from the saved-workspaces
  view.

## 8. Startup error / first-run dialog orchestration

- **Decision**: New `McpSetupGate` component, mounted once in `App.tsx`
  alongside `AppToolbar`, calls `get_mcp_status` on mount and renders, in
  priority order:
  1. `PortSetupDialog` (blocking, if `!configured`) — on success, then
  2. `AgentInstructionsDialog` (US2) — once dismissed, or
  3. if `configured && error`, `McpErrorDialog` (US4, dismissible, with a
     "Go to Settings" action that opens `SettingsDialog`).

  The toolbar and page content always render underneath these dialogs,
  satisfying FR-019 (rest of the app usable while MCP is down).
- **Rationale**: Centralizes the first-run-vs-error-vs-normal sequencing
  logic in one place instead of scattering dialog-open state across
  `App.tsx`.
- **Alternatives considered**: inlining this logic in `App.tsx` — rejected
  once the conditional sequence grows past a couple of branches; keeping
  `App.tsx` itself trivial follows Principle III's file-size guidance.

## Follow-up implementation note

`mcp::server::start` currently has signature `start(state: Arc<AppState>)`
and binds to `127.0.0.1:0` (OS-assigned port). It must change to
`start(state: Arc<AppState>, port: u16)` binding to `127.0.0.1:{port}`. The
existing call site in `src-tauri/tests/mcp_server_test.rs` (`mcp::server::start(state)`)
must be updated to pass an explicit port (e.g. `0` is no longer a valid
"any port" sentinel for this function — tests should bind a fixed test port
or pick one via a short-lived probe bind before calling `start`).
