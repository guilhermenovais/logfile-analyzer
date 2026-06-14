# Implementation Plan: Redesign App Shell UI

**Branch**: `005-redesign-app-shell-ui` | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-redesign-app-shell-ui/spec.md`

## Summary

Replace the slim top toolbar (children + standalone settings cog) with a real
menu bar exposing exactly three top-level menus — **Workspace** (New/Open/Save),
**Options** (opens the settings dialog directly, no cog icon), and **Help**
(About, showing the app version) — and turn the left sidebar into a focused
"current workspace" panel: an inline-renamable workspace name at the top, an
"Add file" button, and a restyled file list with an empty state (US1–US2).
Separately, fix the search row so the type select, query field, search button,
and history icon all share one control height (US3). Backend adds one new
command, `rename_workspace`, plus a repo function and a validation error
variant; everything else reuses existing commands/dialogs. The existing
"New"/"Saved" buttons and their handlers move out of `WorkspacePage`'s sidebar
into a shared `useWorkspaceActions` hook consumed by both the new `MenuBar`
(in `App.tsx`) and `WorkspacePage` (for the save-prompt/saved-workspaces view),
which also brings the oversized `WorkspacePage.tsx` back under the
constitution's 200-line guideline as a side effect.

## Technical Context

**Language/Version**: Rust (stable, pinned via `rust-toolchain.toml`) backend; TypeScript 5.8 (`strict: true`) + React 19 frontend — unchanged from 001/004
**Primary Dependencies**: Existing stack only. First real usage of the already-declared `@radix-ui/react-dropdown-menu` (menu bar, research.md §1) and of `@tauri-apps/api`'s `app` module (`getVersion()` for the About dialog, research.md §2); `@radix-ui/react-dialog` (already used for `SettingsDialog`/`SavePromptDialog`) is reused for the About dialog. No new packages.
**Storage**: Existing local SQLite `workspaces` table; no schema change. Adds a `rename` write path on the existing `alias` column (research.md §3), independent of the existing `save` (draft → saved) transition.
**Testing**: `cargo test` (`persistence::repo::workspace::rename`, `commands::workspace::rename_workspace` via Tauri mock runtime — success, empty/whitespace rejection, alias-collision rejection); Vitest + React Testing Library (mocked Tauri IPC/hooks) for new `MenuBar`, `AboutDialog`, `WorkspaceSidebar`, `useWorkspaceActions`, and updated `App`/`WorkspacePage`/`SearchBar` tests
**Target Platform**: Desktop — Linux, macOS, Windows (Tauri v2 supported matrix), unchanged
**Project Type**: Desktop app (Tauri: Rust backend + React/TS webview frontend), unchanged
**Performance Goals**: N/A — pure shell/IPC redesign; no new hot paths, no change to log-parsing/search/streaming
**Constraints**: TSX files stay under the 200-line guideline (Principle III) — `WorkspacePage.tsx` (currently 369 lines) is split by extracting `WorkspaceSidebar` and `useWorkspaceActions`; `WorkspaceSummary`'s shape is unchanged, so no new IPC payload exceeds existing sizes
**Scale/Scope**: Backend: 1 new Tauri command (`rename_workspace`) + 1 repo function + 1 new `AppError` variant (`InvalidWorkspaceName`). Frontend: 3 new components (`MenuBar`, `AboutDialog`, `WorkspaceSidebar`), 1 new hook (`useWorkspaceActions`), `AppToolbar` removed, `App.tsx`/`WorkspacePage.tsx`/`SearchBar.tsx` modified, `useWorkspace.ts`/`src/ipc/workspace.ts` gain `renameWorkspace`, `src/bindings/index.ts` regenerated

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Type-Safe IPC & Shared Contracts | PASS | `rename_workspace` is a specta-typed Tauri command returning `Result<WorkspaceSummary, AppError>`; `src/ipc/workspace.ts` gets a typed `renameWorkspace(alias)` wrapper (`unwrapResult`), `src/bindings/index.ts` regenerated via `tests/export_bindings.rs`. No component calls `invoke()` directly — `WorkspaceSidebar` goes through `useRenameWorkspace` (new hook in `useWorkspace.ts`). |
| II | Security & Least Privilege | PASS | `rename_workspace` operates on `*state.active_workspace_id` (server-derived), never a client-supplied workspace id. The new alias string is trimmed and validated non-empty in Rust (`AppError::InvalidWorkspaceName`, FR-013) before touching SQLite; the existing `alias` `UNIQUE` constraint continues to guard collisions (`WorkspaceAliasInUse`, reused). No new capability entries — consistent with `create_workspace`/`save_workspace`/etc., which also have none beyond `core:default` (custom app commands aren't capability-gated). |
| III | Simplicity & Minimal Footprint | PASS | Reuses already-declared `@radix-ui/react-dropdown-menu` and `@radix-ui/react-dialog`, and `@tauri-apps/api`'s built-in `getVersion()` — no new dependencies (research.md §1/§2). `rename` reuses the existing `alias UNIQUE` constraint and `WorkspaceAliasInUse` error instead of inventing new uniqueness logic (research.md §3). Extracting `WorkspaceSidebar` + `useWorkspaceActions` is directly required to keep `WorkspacePage.tsx` under the 200-line guideline (it's currently 369) — not a speculative refactor (research.md §5). `AppToolbar.tsx` is deleted outright (its one job, the settings cog, becomes `MenuBar`'s "Options" item) rather than left as a hollow wrapper. |
| IV | Test-First Quality Gates | PASS | New `cargo test`: `persistence::repo::workspace::rename` (success, trims/rejects empty/whitespace, collision → `WorkspaceAliasInUse`), `commands::workspace::rename_workspace` integration test via Tauri mock runtime. New/updated Vitest+RTL: `MenuBar.test.tsx` (menu contents, no cog, item callbacks), `AboutDialog.test.tsx` (renders version, falls back on error), `WorkspaceSidebar.test.tsx` (rename happy/cancel/empty paths, Add file, file list incl. empty state and status indicators), `useWorkspaceActions.test.ts` (new/open/save flows incl. named-save bypass, FR-005), `App.test.tsx` (new — menu bar replaces toolbar, no standalone cog), updated `WorkspacePage.test.tsx`, `SearchBar.test.tsx` (equal-height assertions). |
| V | Accessible, Native-Feeling Desktop UI | PASS | Menu bar built on Radix `DropdownMenu` (keyboard nav, `role="menu"`/`menuitem` built in); "Options" remains a plain `<button>` (no submenu, per FR-006). About dialog on Radix `Dialog` (existing pattern). Inline workspace rename uses a `<button>` that swaps to a labeled `<input>` on click, committing on Enter/blur and reverting on Escape — no `<div onClick>`. File-list empty state and status indicators (availability/indexing) remain plain text/ARIA, inside the existing `FeatureErrorBoundary` boundaries. |
| VI | Performance for Large Log Volumes | PASS | No change to log parsing, search, streaming, or IPC payload shapes beyond `WorkspaceSummary`'s existing `alias` field being mutable via one more command. |

**Result**: All gates PASS. No violations — Complexity Tracking table left empty.

## Project Structure

### Documentation (this feature)

```text
specs/005-redesign-app-shell-ui/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ipc-commands.md  # Phase 1 output — delta on 001's/004's IPC contract
└── tasks.md              # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── MenuBar.tsx                  # NEW: top-level menu bar — "Workspace" (New/Open/Save,
│   │                                #   Radix DropdownMenu), "Options" (plain button → settings
│   │                                #   dialog, FR-006/FR-007), "Help" (Radix DropdownMenu → About)
│   ├── MenuBar.test.tsx              # NEW
│   ├── AboutDialog.tsx               # NEW: Radix Dialog showing app version via
│   │                                #   @tauri-apps/api/app getVersion() (FR-009)
│   ├── AboutDialog.test.tsx          # NEW
│   ├── WorkspaceSidebar.tsx          # NEW: workspace name (click-to-rename, FR-010-FR-013),
│   │                                #   "Add file" button + dialog (moved from WorkspacePage,
│   │                                #   FR-014), restyled file list + empty state (FR-015/FR-016)
│   ├── WorkspaceSidebar.test.tsx     # NEW
│   ├── AppToolbar.tsx                # REMOVED (superseded by MenuBar's "Options" item)
│   ├── AppToolbar.test.tsx           # REMOVED
│   ├── SearchBar.tsx                 # MODIFIED: shared height class across search-type select,
│   │                                #   query input, search button, history icon (FR-017)
│   └── SearchBar.test.tsx            # MODIFIED
├── hooks/
│   ├── useWorkspaceActions.ts        # NEW: shared "New"/"Open"/"Save" handlers + save-prompt/
│   │                                #   saved-view state (data-model.md), used by App.tsx
│   │                                #   (MenuBar) and WorkspacePage.tsx
│   ├── useWorkspaceActions.test.ts   # NEW
│   └── useWorkspace.ts               # MODIFIED: + useRenameWorkspace
├── ipc/
│   └── workspace.ts                  # MODIFIED: + renameWorkspace(alias)
├── App.tsx                            # MODIFIED: renders MenuBar (wired via useWorkspaceActions)
│                                      #   + AboutDialog + SettingsDialog; AppToolbar removed
├── App.test.tsx                       # NEW: shell-level assertions (menu bar present, no cog)
├── pages/
│   ├── WorkspacePage.tsx             # MODIFIED: sidebar markup extracted to WorkspaceSidebar;
│   │                                #   New/Saved buttons removed (now in MenuBar via
│   │                                #   useWorkspaceActions); SavePromptDialog/saved-view wiring
│   │                                #   moved into useWorkspaceActions
│   └── WorkspacePage.test.tsx        # MODIFIED
└── bindings/index.ts                  # REGENERATED (specta) — rename_workspace, AppError +
                                       #   InvalidWorkspaceName

src-tauri/src/
├── commands/
│   └── workspace.rs                  # MODIFIED: + rename_workspace command (FR-011-FR-013)
├── persistence/repo/
│   └── workspace.rs                  # MODIFIED: + rename() (validates + reuses alias UNIQUE
│                                      #   constraint → WorkspaceAliasInUse), + unit tests
├── error.rs                           # MODIFIED: + AppError::InvalidWorkspaceName
└── lib.rs                             # MODIFIED: collect_commands! += workspace::rename_workspace

src-tauri/tests/
└── workspace_test.rs (or equivalent)  # MODIFIED/NEW: rename_workspace integration test
                                       #   (success, validation, collision)
```

**Structure Decision**: Follows the existing desktop-app layout from
001/002/003/004 — frontend changes stay under `src/{components,hooks,ipc,pages,App.tsx}`,
backend changes stay under `src-tauri/src/{commands,persistence,error.rs,lib.rs}`
and `src-tauri/tests/`. No new top-level directories. `MenuBar`, `AboutDialog`,
`WorkspaceSidebar`, and `useWorkspaceActions` are split into their own files
both because each is an independently testable responsibility and because
`WorkspacePage.tsx` is already over the 200-line guideline and must shrink.

## Complexity Tracking

> No Constitution Check violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
