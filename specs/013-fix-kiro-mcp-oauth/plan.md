# Implementation Plan: Fix MCP OAuth Compatibility for Kiro CLI

**Branch**: `013-fix-kiro-mcp-oauth` | **Date**: 2026-06-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/013-fix-kiro-mcp-oauth/spec.md`

## Summary

Kiro CLI proactively probes well-known OAuth discovery paths (`/.well-known/oauth-protected-resource`,
`/.well-known/oauth-authorization-server`) before establishing an MCP session. Our server only
mounts the MCP service at `/mcp`, so these probes receive axum's default 404. Kiro interprets this
as error `-32002: "No authorization support detected"` and refuses to connect — even though no
authentication is required. The fix adds axum route handlers for these well-known paths that return
spec-compliant HTTP responses signaling the server is an unprotected resource with no authorization
server configured.

## Technical Context

**Language/Version**: Rust (stable, pinned via `rust-toolchain.toml`)
**Primary Dependencies**: rmcp 1.7.0, axum (via rmcp/tokio), Tauri v2
**Storage**: N/A (no persistence changes)
**Testing**: `cargo test`, manual verification with Kiro CLI and Claude CLI
**Target Platform**: Desktop (Linux, macOS, Windows) — localhost MCP server
**Project Type**: Desktop app (Tauri v2) with embedded MCP server
**Performance Goals**: N/A (static route handlers, negligible overhead)
**Constraints**: Must not break existing Claude CLI connectivity; must not add new dependencies
**Scale/Scope**: 2 new route handlers, ~30 lines of Rust

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Type-Safe IPC & Shared Contracts | N/A | No IPC boundary changes |
| II. Security & Least Privilege | PASS | New endpoints return static public metadata only; no secrets, no user input processed |
| III. Simplicity & Minimal Footprint | PASS | Minimal change (~30 LOC); no new dependencies; routes added to existing axum router |
| IV. Test-First Quality Gates | PASS | New endpoints will have cargo tests; existing MCP tests must continue to pass |
| V. Accessible Desktop UI | N/A | No UI changes |
| VI. Performance for Large Log Volumes | N/A | No log processing changes |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/013-fix-kiro-mcp-oauth/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit-tasks)
```

### Source Code (repository root)

```text
src-tauri/src/
├── mcp/
│   ├── server.rs        # MODIFIED — add well-known routes to axum router
│   └── tools.rs         # UNCHANGED
├── lib.rs               # UNCHANGED
└── ...
```

## Complexity Tracking

> No constitution violations — table intentionally left empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
