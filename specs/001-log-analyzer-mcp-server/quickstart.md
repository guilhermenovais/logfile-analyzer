# Quickstart: Log Analyzer Desktop App with MCP Server

## Prerequisites

- Rust (stable; will be pinned via `rust-toolchain.toml`) + Cargo
- Node.js 20+ and `pnpm`
- Tauri v2 system prerequisites for your OS (webview, build tooling) — see
  <https://v2.tauri.app/start/prerequisites/>

## Install

```bash
pnpm install            # frontend deps
# Rust deps are fetched on first build by Cargo
```

## Develop

```bash
pnpm tauri dev          # runs Vite + the Tauri shell (Rust backend) together
```

On launch the app auto-restores the most recent unsaved workspace (FR-005) and
the MCP server starts on `127.0.0.1` (local only).

## Try the core flow (manual)

1. Create a workspace and **add a log file** (alias defaults to the file name
   without extension). Adding a duplicate path or a colliding alias is rejected
   with a clear error (FR-002/FR-003).
2. Watch lines appear within ~2s while the background index builds (SC-001);
   scroll the virtualized viewer; toggle line wrap.
3. Run a search: `"error" AND "db"` (logical) or a regex; confirm matches and
   that the query lands in search history (US3).
4. Highlight a line, add a label, switch to "highlighted only" (US4).
5. Save the workspace with an alias, relaunch, and confirm state is restored
   (US6 / SC-004).

## Connect an MCP agent

The desktop app exposes an MCP Streamable HTTP endpoint on localhost (e.g.
`http://127.0.0.1:<port>/mcp`). Point an MCP client at it and call:

- `list_files` → workspace aliases
- `get_file_properties` → line count + timestamp-format flag
- `get_line` → a line by 1-based index
- `search_with_context` → matches with surrounding lines (default 5, max 200)
- `list_highlights` / `set_highlight` / `clear_highlight`

Changes made via MCP appear in the UI and vice versa (FR-029).

## Quality gates (run before marking any task complete — Principle IV)

```bash
# Frontend
pnpm exec tsc --noEmit
pnpm exec eslint .
pnpm test                 # Vitest + React Testing Library (mocked IPC)

# Backend (from src-tauri/)
cargo fmt --check
cargo clippy -- -D warnings
cargo test                # incl. Tauri mock-runtime command tests (success + error)
```

## Build

```bash
pnpm tauri build          # release bundle for the current platform
```
