# Quickstart: Fix Sudo Auto-Update on Linux

## What Changed

The auto-update mechanism on Linux no longer uses terminal `sudo` for package installation. Instead it uses `pkexec` (polkit graphical authentication dialog) exclusively. If pkexec is unavailable or the user denies the prompt, the app shows an error with a link to download manually.

## Architecture Overview

```
Frontend (React)                    Rust Backend
─────────────────                   ────────────
check() ─────────────────────────→  tauri-plugin-updater (unchanged)
  ↓
[Linux?]─── no ──→ downloadAndInstall() → plugin handles macOS/Windows
  ↓ yes
download_update ─────────────────→  Custom command: HTTP GET + signature verify
  ↓                                    → writes to temp file, returns path
install_update ──────────────────→  Custom command: pkexec dpkg -i / rpm -U
  ↓                                    → no sudo fallback
[success] → prompt restart
[error]   → show error + manual download link + retry button
```

## Key Files

| File | Purpose |
|------|---------|
| `src-tauri/src/commands/update.rs` | New Rust commands: `download_update`, `install_update`, `get_platform` |
| `src/hooks/useUpdateChecker.ts` | Updated hook: two-phase flow on Linux, timeout, retry-install state |
| `src/components/UpdateDialog.tsx` | Updated UI: "Installing..." phase, install-error state, retry button, releases link |
| `src/ipc/update.ts` | New IPC wrappers for the custom update commands |

## Testing Locally

```bash
# Run frontend tests (includes updated useUpdateChecker + UpdateDialog tests)
pnpm test

# Run Rust tests (includes update command unit tests)
cargo test -p logfile-analyzer

# Full quality gate
tsc --noEmit && eslint . && cargo clippy -- -D warnings && cargo fmt --check
```

## Manual Verification

1. Build a release: `cargo tauri build`
2. Install the built .deb/.rpm on a Linux machine
3. Set up a local update server pointing to a newer version's `latest.json`
4. Launch the app from a fresh terminal (no prior sudo) or from desktop
5. Accept the update → pkexec dialog should appear
6. Verify: denying pkexec shows error with manual download link
7. Verify: on macOS/Windows, update flow is unchanged
