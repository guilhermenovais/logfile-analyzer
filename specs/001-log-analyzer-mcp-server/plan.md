# Implementation Plan: Log Analyzer Desktop App with MCP Server

**Branch**: `001-log-analyzer-mcp-server` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-log-analyzer-mcp-server/spec.md`

## Summary

A Tauri v2 desktop application for analyzing very large (5GB+) log files, whose
headline capability is a localhost MCP server (SSE transport) that exposes the
active workspace to AI agents. All log parsing, indexing, search, and timestamp
detection run in Rust over memory-mapped files with a background-built
line-offset index, streamed to the React frontend via Tauri `Channel<T>`. A
single shared `AppState` workspace manager backs both the Tauri command layer
(UI) and the MCP tool layer (agents), guaranteeing the consistency required by
FR-029. Workspace state (file refs, aliases, highlights, labels, search history,
saved workspaces) is persisted locally in SQLite.

## Technical Context

**Language/Version**: Rust (stable, pinned via `rust-toolchain.toml`) backend; TypeScript 5.8 (`strict: true`) + React 19 frontend
**Primary Dependencies**: Tauri v2, `rmcp` (official Rust MCP SDK, SSE transport via axum), `memmap2`, `regex`, `rayon`, `rusqlite` (bundled SQLite), `tauri-specta` + `specta` (typed IPC bindings); frontend: TanStack Query, TanStack Virtual, Zustand, Radix/shadcn-ui, Tailwind, Vite
**Storage**: Local SQLite database in the OS app-data dir for workspace metadata (aliases, highlights, labels, search history, saved/draft workspaces). Log files are read-only on disk; never written back.
**Testing**: `cargo test` (incl. Tauri mock runtime for command integration, success + error paths) backend; Vitest + React Testing Library with `@tauri-apps/api/mocks` frontend
**Target Platform**: Desktop — Linux, macOS, Windows (Tauri v2 supported matrix)
**Project Type**: Desktop app (Tauri: Rust backend + React/TS webview frontend)
**Performance Goals**: First log lines on screen < 2s for files up to 5GB (SC-001); logical/regex search over 5GB returns < 10s without UI freeze (SC-002)
**Constraints**: Never load a whole large file into memory (FR-034, SC-006); IPC payloads kept under ~100KB, streamed/paginated via `Channel<T>`; MCP server bound to localhost only; CPU/blocking work off the Tauri main thread via `spawn_blocking`/rayon
**Scale/Scope**: Single active workspace at a time; log files up to 5GB+ (tens of millions of lines); 6 user stories, 34 functional requirements, 4 MCP tools + workspace mutation tools

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Type-Safe IPC & Shared Contracts | PASS | `tsc --strict`, no `any`; every fallible command returns `Result<T, AppError>` with `AppError: Serialize`; `tauri-specta` generates TS bindings into `src/bindings/`; all `invoke()` wrapped in `src/ipc/`. |
| II | Security & Least Privilege | PASS | MCP SSE server bound to `127.0.0.1` only; all command + MCP inputs (paths, queries, indices, counts) validated and canonicalized in Rust; per-command Tauri capabilities; strict CSP set in `tauri.conf.json` (replaces current `csp: null`); no secrets in frontend. |
| III | Simplicity & Minimal Footprint | PASS | Lean dependency set, each justified in research.md; files kept under 200 (TS/TSX) / 300 (Rust) lines, one module per file; no speculative abstraction. |
| IV | Test-First Quality Gates | PASS | Vitest + RTL (mocked IPC) and `cargo test` (mock runtime, success + error paths); task complete only when `tsc --noEmit`, `eslint .`, `cargo clippy -D warnings`, `cargo fmt --check`, frontend tests, and `cargo test` all pass. |
| V | Accessible, Native-Feeling Desktop UI | PASS | Semantic HTML, keyboard-accessible controls, Radix/shadcn for modals/menus/tabs; OS light/dark theme; error boundaries at app/feature/list-item levels so one bad log line can't crash the view. |
| VI | Performance for Large Log Volumes | PASS | Parsing/indexing/search in Rust over mmap; streaming via `Channel<T>` (no giant payloads / repeated emits); `spawn_blocking`/rayon for I/O and CPU work; never on the main thread. |

**Result**: All gates PASS. No violations — Complexity Tracking table left empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-log-analyzer-mcp-server/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── mcp-tools.md     # MCP tool contracts (agent-facing)
│   └── ipc-commands.md  # Tauri command contracts (UI-facing)
├── checklists/
│   └── requirements.md  # Existing spec-quality checklist
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
src/                              # React + TypeScript frontend
├── app/                          # App shell, providers, error boundary, theme
├── pages/                        # Workspace view, saved-workspaces browser
├── components/                   # LogViewer (virtualized), SearchBar, HighlightPanel, dialogs
├── hooks/                        # useWorkspace, useLogStream, useSearch, useHighlights
├── ipc/                          # Typed invoke() wrappers + Channel subscribers (one per command group)
├── bindings/                     # tauri-specta generated types (audited on PR)
└── lib/                          # Search-expression display helpers, formatting, constants

src-tauri/src/                    # Rust backend
├── main.rs                       # Binary entry
├── lib.rs                        # Builder: plugins, AppState, command handlers, MCP server spawn
├── error.rs                      # AppError (Serialize) + Result alias
├── state.rs                      # AppState: active workspace manager, file registry (shared by IPC + MCP)
├── commands/                     # One Tauri command module per responsibility
│   ├── workspace.rs              # create/save/open/list/close, draft recovery, save prompts
│   ├── files.rs                  # add file (path/alias validation), list, properties, line-by-index
│   ├── viewing.rs                # stream lines via Channel, goto line, wrap is frontend-only
│   ├── search.rs                 # logical + regex + time-range search, history
│   └── highlights.rs             # add/remove highlight, set/clear label, list highlighted
├── logfile/                      # Core engine (no Tauri deps — unit-testable)
│   ├── mmap_index.rs             # Memory-mapped file + background line-offset index
│   ├── search.rs                 # Logical-expression parser + regex, rayon-parallel scan
│   ├── timestamp.rs              # Sample-based format detection (ISO-8601, Unix epoch), per-line parse
│   └── query.rs                  # Search-with-context windowing, bounds clamping
├── mcp/                          # MCP server (rmcp) — agent-facing tool layer over AppState
│   ├── server.rs                 # SSE server bound to localhost, lifecycle
│   └── tools.rs                  # list_files, file_properties, get_line, search_with_context, highlights
└── persistence/                  # SQLite schema + repositories
    ├── schema.rs                 # Migrations
    └── repo.rs                   # Workspace/highlight/history CRUD

src-tauri/capabilities/           # Per-command capability grants (one entry per new command)
src-tauri/tests/                  # cargo integration tests (Tauri mock runtime)
```

**Structure Decision**: Desktop-app layout per the constitution. The Tauri scaffold already exists (`src/`, `src-tauri/`). The core log engine lives in `src-tauri/src/logfile/` with **no Tauri dependencies** so it is unit-testable in isolation; both the Tauri command layer (`commands/`) and the MCP layer (`mcp/`) are thin adapters over the shared `state.rs` `AppState`, which is the single source of truth that makes UI and agent actions mutually visible (FR-029).

## Complexity Tracking

> No Constitution Check violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
