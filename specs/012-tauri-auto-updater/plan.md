# Implementation Plan: Tauri Auto-Updater

**Branch**: `012-tauri-auto-updater` | **Date**: 2026-06-18 | **Spec**: `specs/012-tauri-auto-updater/spec.md`
**Input**: Feature specification from `specs/012-tauri-auto-updater/spec.md`

## Summary

Configure the Tauri v2 auto-updater plugin so the application automatically checks for updates on GitHub Releases at startup, notifies the user when a new version is available, downloads and installs it with signature verification, and prompts for a restart. The existing GitHub Actions release workflow will be modified to use `tauri-action` with `tagName` for automatic updater artifact generation (`latest.json` + `.sig` files).

## Technical Context

**Language/Version**: Rust stable (backend), TypeScript strict (frontend)
**Primary Dependencies**: Tauri v2, `tauri-plugin-updater`, `tauri-plugin-process`, `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`
**Storage**: N/A (update state is transient; signing keys are CI secrets)
**Testing**: `cargo test`, Vitest + React Testing Library (frontend)
**Target Platform**: Linux (x86_64), macOS (universal), Windows (x86_64)
**Project Type**: Desktop application (Tauri v2)
**Performance Goals**: Update check completes within 30 seconds of app launch (SC-001)
**Constraints**: Offline/error scenarios must not disrupt normal app usage (FR-009, SC-004)
**Scale/Scope**: Single-user desktop app; one GitHub Release endpoint

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Type-Safe IPC & Shared Contracts | PASS | The updater plugin is used via its typed `@tauri-apps/plugin-updater` package. No raw `invoke()` calls needed since the plugin handles IPC internally. |
| II. Security & Least Privilege | PASS | Only `updater:default` and `process:allow-restart` permissions are granted. The private signing key is a CI secret, never committed. All updates are signature-verified before installation (FR-006). |
| III. Simplicity & Minimal Footprint | PASS | Uses official Tauri plugins (2 plugins for updater + process). No custom update server. GitHub Releases as CDN. |
| IV. Test-First Quality Gates | PASS | Frontend update UI components will have Vitest tests. Rust plugin is tested by the plugin authors; our integration is configuration-only. All quality gates (tsc, eslint, clippy, fmt, tests) apply. |
| V. Accessible, Native-Feeling Desktop UI | PASS | Update notification uses Radix Dialog (already in project). All interactive elements will be keyboard-accessible buttons, not `<div onClick>`. |
| VI. Performance for Large Log Volumes | PASS | Update check is a single HTTP GET on startup; does not interact with log parsing pipeline. |
| Development Workflow & Release Discipline | PASS | Workflow modification requires explicit user approval (flagged below). Releases will be signed. No `--no-verify` or `--force` flags. |

**CI/CD Gate**: The release workflow (`.github/workflows/release.yml`) must be modified. Per constitution: "CI/CD configuration files are never modified without explicit user approval." This will be flagged during task execution for user approval before changes are applied.

### Post-Phase 1 Re-check

All principles remain satisfied. The design adds two official plugins, a single UI component (modal dialog), and workflow configuration changes. No new abstractions, no custom servers, no speculative code.

## Project Structure

### Documentation (this feature)

```text
specs/012-tauri-auto-updater/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit-tasks)
```

### Source Code (repository root)

```text
src-tauri/
├── Cargo.toml                    # + tauri-plugin-updater, tauri-plugin-process
├── tauri.conf.json               # + updater config, createUpdaterArtifacts
├── capabilities/
│   └── default.json              # + updater:default, process:allow-restart
└── src/
    └── lib.rs                    # + plugin registration

src/
├── components/
│   └── update-dialog.tsx         # Update notification modal with progress
├── hooks/
│   └── use-update-checker.ts     # Hook wrapping update check + state
└── ipc/                          # (no changes - plugin handles its own IPC)

.github/
└── workflows/
    └── release.yml               # Modified: tauri-action with tagName + signing secrets
```

**Structure Decision**: Changes are minimal and distributed across existing directories. The frontend adds one component and one hook. The backend changes are configuration-only (no new Rust modules). The workflow is restructured to use `tauri-action`'s built-in release support.

## Complexity Tracking

No constitution violations. All decisions align with the stated principles.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none)* | | |
