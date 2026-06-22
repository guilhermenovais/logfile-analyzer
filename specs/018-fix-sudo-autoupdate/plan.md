# Implementation Plan: Fix Sudo Auto-Update on Linux

**Branch**: `018-fix-sudo-autoupdate` | **Date**: 2026-06-22 | **Spec**: `specs/018-fix-sudo-autoupdate/spec.md`
**Input**: Feature specification from `/specs/018-fix-sudo-autoupdate/spec.md`

## Summary

Replace the `tauri-plugin-updater`'s Linux install step (which falls back to terminal `sudo` and hangs indefinitely) with a custom two-phase update flow: download via HTTP with signature verification, then install via `pkexec` only. The plugin is kept for update checking and for macOS/Windows install. On Linux, if pkexec is unavailable or the user cancels, the app shows a clear error with a manual download link instead of hanging.

## Technical Context

**Language/Version**: Rust stable (pinned via `rust-toolchain.toml`), TypeScript 5.8 (strict mode)
**Primary Dependencies**: Tauri v2, tauri-plugin-updater 2.10.1, React 19, reqwest (new regular dep), minisign-verify + base64 (new deps for signature verification)
**Storage**: N/A (temp files for downloaded packages)
**Testing**: Vitest + React Testing Library (frontend), cargo test (backend)
**Target Platform**: Linux (primary fix), macOS/Windows (no regression)
**Project Type**: Desktop app (Tauri)
**Performance Goals**: Update download/install completes within 120 seconds
**Constraints**: No terminal sudo invocation; pkexec-only privilege escalation on Linux; offline-tolerant error messages
**Scale/Scope**: Touches ~6 files; 2 new Rust commands, 1 new IPC module, updates to hook + dialog + lib.rs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Type-Safe IPC & Shared Contracts | PASS | New commands return `Result<T, AppError>` with `Serialize`; IPC wrappers in `src/ipc/update.ts`; types generated via specta |
| II. Security & Least Privilege | PASS | Signature verification on all downloads; pkexec uses polkit (graphical, least-surprise); no sudo fallback; new capability entry for custom commands |
| III. Simplicity & Minimal Footprint | PASS | Custom code scoped to Linux only; macOS/Windows unchanged; minimal new dependencies (reqwest already dev-dep, minisign-verify + base64 are small) |
| IV. Test-First Quality Gates | PASS | Unit tests for new hook states, dialog states, and Rust command error paths |
| V. Accessible, Native-Feeling Desktop UI | PASS | New "Installing..." and error states use existing dialog patterns; retry button is a `<button>`; releases link is an `<a>` |
| VI. Performance for Large Log Volumes | N/A | Update flow is not on the hot path |

**Post-Phase-1 re-check**: PASS — no new violations. Custom download runs on tokio async runtime (not main thread). pkexec spawned via `tokio::task::spawn_blocking`.

## Project Structure

### Documentation (this feature)

```text
specs/018-fix-sudo-autoupdate/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (not created by /speckit-plan)
```

### Source Code (repository root)

```text
src-tauri/src/
├── commands/
│   ├── update.rs        # NEW: download_update, install_update, get_platform commands
│   └── mod.rs           # Updated: add update module
├── error.rs             # Updated: add UpdateError variants or use command-local error
└── lib.rs               # Updated: register new commands in specta_builder + capabilities

src/
├── ipc/
│   └── update.ts        # NEW: typed wrappers for custom update commands
├── hooks/
│   └── useUpdateChecker.ts  # Updated: two-phase flow, platform branching, timeout, retry
├── components/
│   └── UpdateDialog.tsx     # Updated: installing phase, install-error, retry button, releases link
└── App.tsx                  # Minor: pass new props if needed

src-tauri/capabilities/
└── default.json         # Updated: add permissions for new commands if needed
```

**Structure Decision**: Single project layout (existing), extending `commands/` module with a new `update.rs` file for the two custom commands. Frontend extends existing `ipc/`, `hooks/`, and `components/` directories.

## Complexity Tracking

No constitution violations to justify.

## Phase 0: Research

See `specs/018-fix-sudo-autoupdate/research.md` — all NEEDS CLARIFICATION items resolved:

- Plugin customization: not possible, custom commands needed (Decision 1)
- Scope: two commands, Linux-only (Decision 2)
- Signature verification: same crates as plugin (Decision 3)
- pkexec-only policy: confirmed by spec FR-001, FR-007 (Decision 4)
- Platform detection: compile-time `cfg!` + simple Tauri command (Decision 5)
- Timeout: frontend 120s + Rust 110s (Decision 6)
- HTTP client: reqwest with rustls-tls (Decision 7)
- Package type detection: infer crate magic bytes (Decision 8)
- Releases URL: derived from update endpoint (Decision 9)

## Phase 1: Design

### Rust Commands (`src-tauri/src/commands/update.rs`)

#### `download_update`

```rust
#[tauri::command]
#[specta::specta]
pub async fn download_update(
    app: tauri::AppHandle,
    url: String,
    signature: String,
) -> Result<DownloadResult, AppError>
```

- Reads pubkey from `app.config().plugins.updater.pubkey`
- Downloads binary via reqwest
- Verifies signature using minisign-verify
- Writes to temp file (using `tempfile` crate)
- Detects package type via `infer`
- Returns `DownloadResult { path, package_type }`

#### `install_update`

```rust
#[tauri::command]
#[specta::specta]
pub async fn install_update(
    package_path: String,
    package_type: String,
) -> Result<(), AppError>
```

- For `deb`: `pkexec dpkg -i <path>`
- For `rpm`: `pkexec rpm -U <path>`
- For `appimage`: direct file replacement (no privilege escalation)
- Checks `which pkexec` before attempting (returns `PkexecNotFound` error if missing)
- Wraps `Command::status()` in `tokio::task::spawn_blocking` with timeout
- Maps exit codes: 126/127 → `UserCancelled`, other non-zero → `InstallFailed`

#### `get_platform`

```rust
#[tauri::command]
#[specta::specta]
pub fn get_platform() -> String
```

Returns `"linux"`, `"macos"`, or `"windows"`. Used by frontend to branch update flow.

### Frontend Flow (`useUpdateChecker.ts`)

1. On mount: `check()` via plugin (unchanged)
2. On `startDownload()`:
   - Get platform via `get_platform()` (or cache at app init)
   - **If non-Linux**: call `update.downloadAndInstall()` (existing flow, unchanged)
   - **If Linux**:
     a. Set status `"downloading"`
     b. Call `download_update(url, signature)` — report progress via polling or simple spinner
     c. On success: store `DownloadResult` in state, set status `"installing"`
     d. Call `install_update(path, package_type)`
     e. On success: set status `"downloaded"` (triggers restart prompt)
     f. On failure: set status `"install-error"` with structured error info
3. `retryInstall()`: re-calls `install_update()` with stored path (no re-download)
4. 120-second hard timeout via `Promise.race` wrapping the entire download+install

### UI Changes (`UpdateDialog.tsx`)

- New `"installing"` state: shows "Installing update..." with a spinner
- New `"install-error"` state: shows error message based on error kind:
  - `pkexec-not-found`: "pkexec is not available. Please download the update manually."
  - `user-cancelled`: "Authentication was cancelled."
  - `install-failed`: "Installation failed: {message}"
  - `timeout`: "Update timed out."
- "Retry Install" button (visible on install-error, reuses downloaded file)
- "Download Manually" link pointing to releases page
- Existing macOS/Windows flow unchanged
