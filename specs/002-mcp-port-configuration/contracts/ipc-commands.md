# IPC Command Contracts: MCP Port Configuration

Adds two Tauri commands to the set in
`specs/001-log-analyzer-mcp-server/contracts/ipc-commands.md`. Both follow
Principle I: `Result<T, AppError>`, registered in `specta_builder`, wrapped in
`src/ipc/settings.ts`.

## `get_mcp_status`

Returns the current MCP server configuration and runtime status. Called once
on app load (`McpSetupGate`) and after any Settings change to refresh display.

- **Input**: none
- **Output**: `Result<McpStatusInfo, AppError>`

```ts
interface McpStatusInfo {
  configured: boolean;
  port: number | null; // persisted port, present once configured
  error: string | null; // set if the configured port failed to bind at startup (FR-018)
}
```

- `configured === false` ⇒ frontend shows `PortSetupDialog` (US1, FR-002).
- `configured === true && error !== null` ⇒ frontend shows `McpErrorDialog`
  (US4, FR-018).
- `configured === true && error === null` ⇒ normal operation; `port` reflects
  the live MCP server port (FR-021).

## `configure_mcp_port`

Validates, checks availability, persists, and hot-reconfigures the running
MCP server to `port` — used by both `PortSetupDialog` (US1) and
`SettingsDialog` (US3).

- **Input**: `port: number` (u16)
- **Output**: `Result<McpStatusInfo, AppError>`

### Behavior

1. `port === 0` ⇒ `Err(AppError::InvalidPort)` (FR-003). No state change.
2. If `port` equals the currently `Running` port ⇒ no-op success: returns the
   current `McpStatusInfo` unchanged (Edge Cases — same-port save).
3. Otherwise, attempt `mcp::server::start(state, port)`
   (`TcpListener::bind(("127.0.0.1", port))`):
   - **Bind fails** (`AddrInUse`, `PermissionDenied`, etc.) ⇒
     `Err(AppError::PortUnavailable(reason))` (FR-005/FR-016). The
     previously-running server (if any) is left untouched and the persisted
     port is unchanged.
   - **Bind succeeds** ⇒ shut down the previous `McpServerHandle` (if any),
     persist `port` via `persistence::repo::settings::set_mcp_port` (FR-006),
     store the new handle as `Running(port)`, and return
     `Ok(McpStatusInfo { configured: true, port: Some(port), error: None })`
     (FR-015).

### Error → UI mapping

| `AppError` variant       | Shown to user (FR-003/FR-005) |
|---------------------------|--------------------------------|
| `InvalidPort`              | "Enter a port number between 1 and 65535." |
| `PortUnavailable(reason)`  | "Port {port} is unavailable ({reason}). Choose another port." |

Both `PortSetupDialog` and `SettingsDialog` re-prompt on either error without
closing (FR-005), per Edge Cases.
