# Research: Fix Sudo Auto-Update on Linux

## Problem Root Cause

The `tauri-plugin-updater` v2.10.1 install step on Linux (`try_install_with_privileges` in `updater.rs:1106`) uses a three-tier privilege escalation fallback chain:

1. **pkexec** (graphical polkit prompt) — works on desktop environments with a polkit agent
2. **zenity/kdialog + sudo -S** (graphical password prompt piped to sudo stdin)
3. **Terminal sudo** — hangs indefinitely when no terminal is attached or no cached credentials exist

This affects `.deb` and `.rpm` installations only. AppImage installs replace the file in user-writable space and need no privilege escalation.

## Decision 1: Plugin Customization vs. Custom Commands

**Decision**: Implement custom Rust commands for the Linux update flow; keep the plugin for update checking and for macOS/Windows install.

**Rationale**: The plugin does not expose any hook or configuration to customize the install behavior (no `on_install` callback, no "disable sudo fallback" flag). The `DownloadedBytes` resource is private to the plugin crate, so even using the plugin's separate `download()` command leaves us unable to redirect the bytes to a custom install flow. We must implement download + install independently for Linux.

**Alternatives considered**:
- *Fork the plugin*: Rejected — maintenance burden of tracking upstream changes for a single behavior fix.
- *Patch via `cargo patch`*: Rejected — same maintenance burden, plus breaks `Cargo.lock` portability.
- *Wrap the plugin's install with a timeout*: Rejected — a killed `sudo` process may leave dpkg/rpm in a broken state; the process would continue running in the background even after the frontend times out.

## Decision 2: Scope of Custom Commands

**Decision**: Two new Tauri commands, Linux-only:
- `download_update(url, signature)` — downloads bytes, verifies signature, writes to temp file, returns path
- `install_update(package_path, package_type)` — runs `pkexec dpkg -i` or `pkexec rpm -U`; returns structured error if pkexec is unavailable or the user cancels

On macOS/Windows the frontend continues using the plugin's `downloadAndInstall()`.

**Rationale**: This minimizes the scope of custom code to the exact failure point (Linux install). The plugin's `check()` still handles update discovery, endpoint parsing, target matching, and version comparison — all non-trivial logic we don't want to duplicate.

**Alternatives considered**:
- *Single combined command*: Rejected — the spec requires separate "Downloading..." and "Installing..." UI phases with retry-install capability.
- *Re-implement check as well*: Rejected — unnecessary duplication; the plugin's check is reliable and platform-agnostic.

## Decision 3: Signature Verification in Custom Download

**Decision**: Use the same crates as the plugin (`minisign-verify`, `base64`) to verify the downloaded binary against the release signature and the app's configured public key.

**Rationale**: Signature verification is security-critical and must match the existing scheme exactly. Using the same crates guarantees compatibility. The public key is already in `tauri.conf.json` under `plugins.updater.pubkey`.

## Decision 4: pkexec-Only Policy (No sudo Fallback)

**Decision**: On Linux, attempt only `pkexec` for privilege escalation. If pkexec is not found, the user cancelled the prompt, or the command fails, return an error directing the user to download manually from the releases page.

**Rationale**: The spec (FR-001, FR-007) explicitly forbids terminal sudo and prohibits fallback to sudo when pkexec is unavailable. This eliminates the root cause (indefinite hang) by design.

## Decision 5: Platform Detection

**Decision**: Use `cfg!(target_os = "linux")` at compile time in Rust for command availability. On the frontend, use Tauri's `platform()` from `@tauri-apps/plugin-os` or a simple compile-time flag passed from the Rust side to choose between the custom flow (Linux) and the plugin flow (macOS/Windows).

**Rationale**: Compile-time branching is the simplest approach and avoids runtime overhead. The app already targets specific platforms in `Cargo.toml` with `[target.'cfg(...)'.dependencies]`.

**Alternatives considered**:
- *Runtime platform detection via `navigator.platform`*: Works but less reliable and not idiomatic Tauri.
- *Tauri `@tauri-apps/plugin-os`*: Would add a new dependency for a single boolean check. We'll instead expose a simple `get_platform` Tauri command or use a Tauri event at startup.

## Decision 6: Timeout Strategy

**Decision**: The 120-second hard timeout is enforced at the frontend level using `Promise.race`. The Rust `install_update` command uses `tokio::time::timeout` around the pkexec `Command::status()` call for a slightly shorter duration (110 seconds) to allow the frontend to receive a structured error rather than a generic timeout.

**Rationale**: Frontend timeout guarantees the UI never hangs regardless of what happens on the Rust side. The Rust-side timeout provides a more informative error message.

## Decision 7: HTTP Client for Download

**Decision**: Add `reqwest` (already a dev-dependency) as a regular dependency with `rustls-tls` feature for the custom Linux download command.

**Rationale**: The plugin itself uses reqwest internally. Adding it as a direct dependency keeps consistency and avoids introducing a second HTTP client.

## Decision 8: Package Type Detection

**Decision**: Detect `.deb` vs `.rpm` vs `.appimage` using the `infer` crate (already a transitive dependency via the plugin) to inspect the downloaded bytes' magic bytes, matching the plugin's approach.

**Rationale**: File extension from the URL is unreliable. Magic byte detection is authoritative and matches the plugin's existing logic.

## Decision 9: Releases Page URL

**Decision**: Derive the GitHub releases URL from the update endpoint configured in `tauri.conf.json`. The current endpoint is `https://github.com/guilhermenovais/logfile-analyzer/releases/latest/download/latest.json` — stripping the trailing path gives the releases page URL.

**Rationale**: Avoids hardcoding. The endpoint already points to the correct repository.
