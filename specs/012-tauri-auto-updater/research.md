# Research: Tauri Auto-Updater

## Decision: Updater Plugin

**Choice**: `tauri-plugin-updater` (official Tauri v2 plugin)

**Rationale**: This is the official, maintained updater plugin for Tauri v2 from the `tauri-apps/plugins-workspace` monorepo. It provides built-in signature verification, progress callbacks, and cross-platform support. The constitution (Technology Stack) mandates preferring official `tauri-apps/plugins-workspace` plugins over hand-rolled equivalents.

**Alternatives considered**:
- Custom HTTP polling + manual installer download: Rejected because it would reinvent what the official plugin already provides, violating Principle III (Simplicity).
- Third-party update frameworks (Sparkle, WinSparkle): Rejected because they are platform-specific and would not integrate with Tauri's build tooling.

## Decision: Update Distribution Channel

**Choice**: GitHub Releases with static `latest.json` manifest

**Rationale**: The spec assumes GitHub Releases as the distribution channel and the project already has a release workflow publishing to GitHub Releases. The Tauri updater plugin natively supports static JSON manifests served from GitHub Releases, requiring no additional infrastructure.

**Alternatives considered**:
- Self-hosted update server: Rejected as unnecessary complexity; the project already uses GitHub Releases.
- S3/CDN-hosted manifests: Rejected for the same reason; GitHub Releases serves the same purpose with zero additional cost.

## Decision: Release Workflow Modification

**Choice**: Restructure the workflow to use `tauri-action` with `tagName` for release creation, replacing the current separate `release` job that uses `softprops/action-gh-release`.

**Rationale**: When `tauri-action` is given a `tagName`, it automatically:
1. Creates/updates the GitHub Release (handles concurrent matrix jobs gracefully)
2. Uploads all build artifacts (installers + `.sig` signature files)
3. Generates and uploads `latest.json` (the updater manifest)

This eliminates the need to manually collect artifacts across matrix jobs and manually construct the `latest.json`. It is the official Tauri-recommended CI approach.

**Alternatives considered**:
- Keep current workflow structure and manually generate `latest.json` in the `release` job: Rejected because it would require manually reading `.sig` files, constructing the JSON, and would be fragile to maintain as platforms change.

## Decision: Signing Key Management

**Choice**: Generate keys via `tauri signer generate`, store private key as GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY`, embed public key in `tauri.conf.json`.

**Rationale**: This is the standard Tauri approach. The private key never enters the repository. The public key is safe to commit as it only verifies signatures. The constitution (Development Workflow) requires that releases are signed when the updater is enabled and that the private signing key is a CI secret.

**Alternatives considered**:
- Hardware security module or external signing service: Overkill for this project's threat model.

## Decision: Process Plugin for Relaunch

**Choice**: Add `tauri-plugin-process` for the `relaunch()` API.

**Rationale**: After downloading and installing an update, the app needs to restart. The `relaunch()` function from `@tauri-apps/plugin-process` is the official way to restart a Tauri app. This is a lightweight plugin from the official workspace.

## Decision: Update Endpoint URL

**Choice**: `https://github.com/guilhermenovais/logfile-analyzer/releases/latest/download/latest.json`

**Rationale**: This URL always points to the latest release's `latest.json` file. The Tauri updater plugin fetches this on startup, compares versions, and prompts the user if a newer version is available. No dynamic server needed.

## Decision: Frontend Update UI

**Choice**: Modal dialog using Radix Dialog (already in the project) with download progress bar.

**Rationale**: The project already uses `@radix-ui/react-dialog` for modals. Reusing this component library maintains visual consistency and follows the constitution's Principle V (Accessible, Native-Feeling Desktop UI) by using a headless UI library. The update check runs on app startup, and results are shown via a non-blocking modal.

## Decision: CSP Configuration

**Choice**: No CSP changes needed for the updater.

**Rationale**: The updater plugin performs network requests from the Rust backend, not from the webview. The `connect-src` CSP directive only governs webview-initiated requests (fetch, XHR, WebSocket). Since the updater bypasses the webview entirely, the existing CSP remains valid.
