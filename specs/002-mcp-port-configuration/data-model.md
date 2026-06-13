# Data Model: User-Configurable MCP Server Port

## McpServerConfiguration (persisted)

Persisted as a single row in a new `app_settings` key-value table.

```sql
CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

| key        | value                          |
|------------|--------------------------------|
| `mcp_port` | configured port, decimal string (e.g. `"8741"`) |

- Row absent ⇒ `configured = false` (FR-001/FR-002 — first-launch dialog).
- Row present ⇒ `configured = true`, `port` = parsed `u16`.
- Single application-wide setting — not scoped to a workspace (Assumptions).

Repo (`persistence::repo::settings`):

- `get_mcp_port(conn) -> Result<Option<u16>>`
- `set_mcp_port(conn, port: u16) -> Result<()>` (upsert)

## McpRuntimeStatus (in-memory only, not persisted)

Tauri-managed state `McpServerState(Mutex<McpRuntimeStatus>)`:

```rust
enum McpRuntimeStatus {
    Running(McpServerHandle), // existing struct: { port: u16, cancellation_token }
    Failed(String),           // bind error reason (FR-018)
}
```

- Set during `setup()` from the persisted port (bind attempt via
  `mcp::server::start`).
- Replaced by `configure_mcp_port` on every successful reconfiguration
  (US1 first-time setup and US3 Settings changes).
- Read by `get_mcp_status` to populate the `error` field.
- Exit handler (`run(|app_handle, event| ...)`) shuts down the handle only
  when `Running`.

## McpStatusInfo (IPC response shape)

Returned by `get_mcp_status` and `configure_mcp_port`:

```rust
#[derive(Serialize, specta::Type)]
pub struct McpStatusInfo {
    pub configured: bool,
    pub port: Option<u16>,
    pub error: Option<String>,
}
```

- `configured` / `port` come from `McpServerConfiguration` (persisted).
- `error` comes from `McpRuntimeStatus::Failed` (in-memory), `None` when
  `Running` or not yet configured.

## AppError additions

```rust
pub enum AppError {
    // ...existing variants...
    InvalidPort,            // port == 0 or out of u16 range (FR-003)
    PortUnavailable(String), // bind failed; carries OS error reason (FR-005/FR-018)
}
```

## AgentToolProfile (frontend-only static data, not persisted)

```ts
interface AgentToolProfile {
  id: string;            // "claude-code-cli" | "kiro-ide" | "cursor" | "windsurf" | "cline"
  name: string;           // display name for the <select>
  instructions: (port: number) => string; // command or config snippet, port substituted
}
```

- Lives in `src/lib/agentTools.ts` as a static array.
- `AgentInstructionsDialog` renders `instructions(port)` for the selected
  profile and exposes a copy action (FR-009/FR-011/FR-021).

## State Transitions

```
[not configured]
   --(US1: configure_mcp_port succeeds)--> [configured, Running(port)]
   --(US1: configure_mcp_port fails: PortUnavailable)--> [not configured] (re-prompt)

[configured, Running(portA)]
   --(US3: configure_mcp_port(portB) succeeds)--> [configured, Running(portB)]
   --(US3: configure_mcp_port(portB) fails)--> [configured, Running(portA)] (unchanged, FR-016)
   --(US3: configure_mcp_port(portA), same port)--> [configured, Running(portA)] (no-op)

[app restart, persisted port unavailable]
   --(setup() bind fails)--> [configured, Failed(reason)]  -- US4 error dialog
   --(US3 from Settings: configure_mcp_port(newPort) succeeds)--> [configured, Running(newPort)]
```
