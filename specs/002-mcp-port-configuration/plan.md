# Implementation Plan: User-Configurable MCP Server Port

**Branch**: `002-mcp-port-configuration` | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-mcp-port-configuration/spec.md`

## Summary

Replace the OS-assigned MCP server port with a user-chosen, persisted port.
On first launch (or any launch where no port is configured), a blocking
dialog collects a valid, available port; once confirmed, an agent-connection
instructions dialog (with a tool picker including Claude Code CLI and Kiro
IDE, and a copy action) is shown. A new Settings dialog, reachable from an
app-wide toolbar, lets the user change the port later with the same
validation/availability checks and hot-reconfigures the running MCP server
without a restart. If the configured port can't be bound at startup, an error
dialog informs the user (with a link to Settings) while the rest of the app
remains usable.

## Technical Context

**Language/Version**: Rust (stable, pinned via `rust-toolchain.toml`) backend; TypeScript 5.8 (`strict: true`) + React 19 frontend — unchanged from 001
**Primary Dependencies**: Existing stack (Tauri v2, `rmcp`, `rusqlite`, `tauri-specta`/`specta`, TanStack Query, Radix, Tailwind) plus **new**: `tauri-plugin-clipboard-manager` (Rust, v2) and `@tauri-apps/plugin-clipboard-manager` (JS) for FR-011's copy action
**Storage**: Existing local SQLite database; **new** `app_settings` key-value table holding the single `mcp_port` row (app-wide, not per-workspace)
**Testing**: `cargo test` (incl. Tauri mock runtime, success + error paths) backend; Vitest + React Testing Library with `@tauri-apps/api/mocks` (and mocked clipboard plugin) frontend
**Target Platform**: Desktop — Linux, macOS, Windows (Tauri v2 supported matrix), unchanged
**Project Type**: Desktop app (Tauri: Rust backend + React/TS webview frontend), unchanged
**Performance Goals**: N/A — this feature is config/UI-only and does not touch the large-log-file data path
**Constraints**: MCP server remains bound to `127.0.0.1` only; port reconfiguration must take effect immediately without a full app restart (FR-015); the configuration is a single application-wide setting (Assumptions)
**Scale/Scope**: 4 user stories, 21 functional requirements; 2 new Tauri commands (`get_mcp_status`, `configure_mcp_port`); 1 new SQLite table; ~6 new frontend components (toolbar, 4 dialogs, setup gate) + 1 static agent-tool data module

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Type-Safe IPC & Shared Contracts | PASS | `get_mcp_status` and `configure_mcp_port` return `Result<McpStatusInfo, AppError>`, registered with `tauri-specta`, exposed via typed wrappers in `src/ipc/settings.ts`; new `AppError` variants (`InvalidPort`, `PortUnavailable`) are `Serialize`. |
| II | Security & Least Privilege | PASS | MCP server continues to bind only to `127.0.0.1`; port values are validated (1–65535, non-zero) and the bind itself is the canonical availability check in Rust; clipboard access added via a single, narrow `clipboard-manager:allow-write-text` capability — no blanket grants. |
| III | Simplicity & Minimal Footprint | PASS | One key-value table reused for a single setting; the bind-as-availability-check avoids a second "dry run" code path (research.md §2); agent tool list is static data, not a new IPC surface; tool picker uses a native `<select>` instead of a new dependency (research.md §6). |
| IV | Test-First Quality Gates | PASS | New `cargo test` coverage for `persistence::repo::settings`, `configure_mcp_port` (success, port-unavailable, invalid-port, same-port no-op), `get_mcp_status`, and an updated `mcp_server_test.rs` for the new `start(state, port)` signature; new Vitest/RTL tests for each dialog and the toolbar with mocked IPC + clipboard plugin. |
| V | Accessible, Native-Feeling Desktop UI | PASS | All new dialogs built on `@radix-ui/react-dialog` (matching `SavePromptDialog`); tool picker is a native, labeled `<select>`; Settings button is a real `<button>` with an accessible label; `PortSetupDialog` is the only non-dismissible dialog, justified by FR-002; `McpErrorDialog`/`SettingsDialog` are normal dismissible dialogs so a misconfigured MCP server never blocks log viewing (FR-019). |
| VI | Performance for Large Log Volumes | N/A | This feature touches only app configuration/UI; no log parsing, indexing, search, or IPC streaming paths are affected. |

**Result**: All gates PASS (one N/A). No violations — Complexity Tracking table left empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-mcp-port-configuration/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ipc-commands.md  # New get_mcp_status / configure_mcp_port contracts
├── checklists/
│   └── requirements.md  # Existing spec-quality checklist
└── tasks.md              # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
src/                                    # React + TypeScript frontend
├── App.tsx                             # MODIFIED: render AppToolbar + McpSetupGate around the active page
├── app/
│   └── McpSetupGate.tsx                # NEW: get_mcp_status on mount; sequences first-run / error dialogs
├── components/
│   ├── AppToolbar.tsx                  # NEW: app-wide toolbar with Settings (gear) button (FR-012)
│   ├── PortSetupDialog.tsx             # NEW: US1 blocking first-launch port dialog
│   ├── AgentInstructionsDialog.tsx     # NEW: US2 tool picker + rendered command/snippet + copy
│   ├── SettingsDialog.tsx              # NEW: US3 settings dialog (current port, change port, reopen instructions)
│   └── McpErrorDialog.tsx              # NEW: US4 startup error dialog with "Go to Settings"
├── ipc/
│   └── settings.ts                     # NEW: typed wrappers for get_mcp_status / configure_mcp_port
├── hooks/
│   └── useMcpSettings.ts               # NEW: TanStack Query hooks (status query + configure mutation)
└── lib/
    └── agentTools.ts                   # NEW: AgentToolProfile[] (Claude Code CLI, Kiro IDE, Cursor, Windsurf, Cline)

src-tauri/src/
├── lib.rs                              # MODIFIED: read persisted port at startup, manage McpServerState, update exit handler
├── error.rs                            # MODIFIED: + InvalidPort, PortUnavailable(String)
├── commands/
│   ├── mod.rs                          # MODIFIED: + settings
│   ├── settings.rs                     # NEW: get_mcp_status, configure_mcp_port commands
│   └── types.rs                        # MODIFIED: + McpStatusInfo
├── mcp/
│   └── server.rs                       # MODIFIED: start(state, port) binds 127.0.0.1:{port}; + McpServerState/McpRuntimeStatus
└── persistence/
    ├── schema.rs                       # MODIFIED: + app_settings table migration
    └── repo/
        ├── mod.rs                      # MODIFIED: + settings
        └── settings.rs                 # NEW: get_mcp_port / set_mcp_port

src-tauri/capabilities/default.json     # MODIFIED: + clipboard-manager:allow-write-text
src-tauri/Cargo.toml                    # MODIFIED: + tauri-plugin-clipboard-manager
package.json                            # MODIFIED: + @tauri-apps/plugin-clipboard-manager

src-tauri/tests/
├── mcp_server_test.rs                  # MODIFIED: call start(state, port) with an explicit port
└── mcp_settings_test.rs                # NEW: configure_mcp_port + get_mcp_status integration tests
```

**Structure Decision**: Follows the existing desktop-app layout from 001 — no
new top-level directories. New backend logic slots into the existing
`commands/`, `mcp/`, and `persistence/repo/` module groups; new frontend
pieces follow the existing `components/` (dialogs), `ipc/` (typed wrappers),
`hooks/` (TanStack Query), and `lib/` (static data) groupings, plus a new
`app/McpSetupGate.tsx` alongside the existing `app/providers.tsx` and
`app/ErrorBoundary.tsx` for app-shell-level orchestration.

## Complexity Tracking

> No Constitution Check violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
