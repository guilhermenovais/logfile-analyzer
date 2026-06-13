# Implementation Plan: Workspace and Log File Session Restore

**Branch**: `003-fix-workspace-file-persistence` | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-fix-workspace-file-persistence/spec.md`

## Summary

Fix two related session-restore bugs in `setup()`: (1) on startup the app
always opens the draft workspace's record but never loads its files into
`state.files`, so every file in an unsaved workspace shows as
`FileUnavailable` even when present on disk; (2) the app never records which
workspace (draft or a specific saved one) was active when it last closed, so
it always restores the draft regardless. The fix adds one new `app_settings`
row (`last_active_workspace_id`), written once on `RunEvent::Exit`, and
extracts the existing `open_workspace` file-loading loop into a shared
helper (`load_workspace_files`) that `setup()` also calls for whichever
workspace `resolve_startup_workspace` determines was last active — so
startup restore uses exactly the same per-file availability logic as a
manual workspace open.

## Technical Context

**Language/Version**: Rust (stable, pinned via `rust-toolchain.toml`) backend; TypeScript 5.8 (`strict: true`) + React 19 frontend — unchanged from 001/002
**Primary Dependencies**: Existing stack only (Tauri v2, `rusqlite`, `tauri-specta`/`specta`, TanStack Query) — no new dependencies
**Storage**: Existing local SQLite database; **new** single row in the existing `app_settings` key-value table (`last_active_workspace_id`)
**Testing**: `cargo test` (Tauri mock runtime + in-memory `Connection`, success and fallback paths) — no new frontend behavior, so no new Vitest/RTL tests
**Target Platform**: Desktop — Linux, macOS, Windows (Tauri v2 supported matrix), unchanged
**Project Type**: Desktop app (Tauri: Rust backend + React/TS webview frontend), unchanged
**Performance Goals**: N/A — startup file loading reuses the existing background-indexing path (`spawn_blocking` + `Channel`), no new hot path
**Constraints**: No new or changed Tauri commands / IPC contracts — `get_active_workspace`'s response shape is unchanged, only the data it reflects is now correct at startup; backend-only fix
**Scale/Scope**: 1 backend-only fix; 1 new `app_settings` key + 2 repo functions; 2 new internal helpers (`resolve_startup_workspace`, `load_workspace_files`) shared between `open_workspace` and `setup()`; 1 modified `RunEvent::Exit` handler

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Type-Safe IPC & Shared Contracts | PASS | No new or changed Tauri commands; no new types cross the IPC boundary. The only persisted addition (`last_active_workspace_id`) is internal to `persistence::repo::settings`, mirroring the existing `mcp_port` row. |
| II | Security & Least Privilege | PASS | No new capabilities or untrusted inputs. File paths loaded at startup come from `log_file_entries` rows already written by `add_file` (which canonicalizes paths); `load_workspace_files` reuses the existing `mmap_index::open` availability check, unchanged. |
| III | Simplicity & Minimal Footprint | PASS | One new key-value row in an existing table; one new pure resolution function (`resolve_startup_workspace`) and one extracted helper (`load_workspace_files`) that *removes* duplication from `open_workspace` rather than adding a parallel code path; single write point (`RunEvent::Exit`) for the new persisted value (research.md §2). |
| IV | Test-First Quality Gates | PASS | New `cargo test` coverage: `persistence::repo::settings` get/set for `last_active_workspace_id` (absent/present/overwrite, mirroring existing `mcp_port` tests); `resolve_startup_workspace` (last-active exists, last-active deleted → draft fallback, no record → draft); `load_workspace_files` / startup restore via the existing Tauri mock-runtime pattern (`workspace_persistence_test.rs`), covering all-files-present, one-missing, and all-missing cases. |
| V | Accessible, Native-Feeling Desktop UI | N/A | No UI changes — `get_active_workspace`'s response shape and the components consuming it (`WorkspacePage`, `useActiveWorkspace`) are unchanged; only the backend data they receive at startup is corrected. |
| VI | Performance for Large Log Volumes | PASS | `load_workspace_files` is the same per-file mmap-open + background `spawn_blocking` indexing `open_workspace` already uses — no synchronous parsing added to `setup()` or the main thread. |

**Result**: All gates PASS (one N/A). No violations — Complexity Tracking table left empty.

## Project Structure

### Documentation (this feature)

```text
specs/003-fix-workspace-file-persistence/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # /speckit-tasks output (NOT created here)
```

No `contracts/` directory: this feature adds no new and changes no existing
Tauri commands or MCP tools (the `get_active_workspace`/`open_workspace`
contracts in `specs/001-log-analyzer-mcp-server/contracts/ipc-commands.md`
remain accurate).

### Source Code (repository root)

```text
src-tauri/src/
├── lib.rs                              # MODIFIED: setup() resolves the last-active workspace via
│                                        #   resolve_startup_workspace, loads its files via
│                                        #   load_workspace_files before managing state /
│                                        #   starting the MCP server; RunEvent::Exit handler
│                                        #   persists the active workspace id via
│                                        #   set_last_active_workspace
├── commands/
│   └── workspace.rs                    # MODIFIED: extract load_workspace_files (shared by
│                                        #   open_workspace and lib.rs setup()); add
│                                        #   resolve_startup_workspace
└── persistence/
    └── repo/
        └── settings.rs                 # MODIFIED: + get_last_active_workspace / set_last_active_workspace
                                         #   (new "last_active_workspace_id" app_settings key)

src-tauri/tests/
└── workspace_persistence_test.rs       # MODIFIED: + tests for resolve_startup_workspace
                                         #   (restores last-active, falls back to draft when
                                         #   deleted or absent) and load_workspace_files /
                                         #   startup restore (all present, one missing, all
                                         #   missing)
```

No frontend files change: `getActiveWorkspace`'s response shape is unchanged,
so `useActiveWorkspace`, `WorkspacePage`, and `src/ipc/workspace.ts` continue
to work as-is — they now simply receive correct data on first load.

**Structure Decision**: Follows the existing desktop-app layout from 001/002
— all changes land inside the existing `src-tauri/src/{lib.rs,commands,
persistence/repo}` modules and `src-tauri/tests/`, with no new top-level
directories, modules, or files beyond extending `persistence/repo/settings.rs`
(already introduced in 002 for the analogous `mcp_port` setting).

## Complexity Tracking

> No Constitution Check violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
