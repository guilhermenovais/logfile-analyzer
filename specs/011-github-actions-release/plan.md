# Implementation Plan: GitHub Actions Release Workflow

**Branch**: `011-github-actions-release` | **Date**: 2026-06-18 | **Spec**: `specs/011-github-actions-release/spec.md`
**Input**: Feature specification from `specs/011-github-actions-release/spec.md`

## Summary

Add a GitHub Actions workflow that automatically builds the Tauri desktop app for Windows, macOS (universal), and Linux on every push to `main`, then publishes all platform installers as a GitHub release named after the version in `src-tauri/tauri.conf.json`. Existing releases for the same version are overwritten. The workflow uses a three-job architecture (version extraction → parallel build matrix → release creation) to guarantee no partial releases are published.

## Technical Context

**Language/Version**: YAML (GitHub Actions workflow), Rust 1.94.0 (pinned via `rust-toolchain.toml`), TypeScript 5.8  
**Primary Dependencies**: `tauri-apps/tauri-action@v0`, `softprops/action-gh-release@v2`, `pnpm/action-setup@v4`, `dtolnay/rust-toolchain@stable`, `actions/upload-artifact@v4`, `actions/download-artifact@v4`  
**Storage**: N/A  
**Testing**: Manual — push to main and verify release appears with correct artifacts  
**Target Platform**: GitHub Actions runners (ubuntu-22.04, macos-latest, windows-latest)  
**Project Type**: CI/CD workflow for a desktop-app (Tauri v2)  
**Performance Goals**: N/A (CI build time is bounded by GitHub-hosted runner capacity)  
**Constraints**: No code signing; no self-hosted runners; `GITHUB_TOKEN` is the only credential  
**Scale/Scope**: Single workflow file, 3 jobs, ~100 lines of YAML

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applicable? | Status | Notes |
|-----------|-------------|--------|-------|
| I. Type-Safe IPC | No | N/A | No application code changes |
| II. Security & Least Privilege | Yes | PASS | Workflow uses only `GITHUB_TOKEN` with `contents: write` permission scoped to the release job; no secrets stored in code |
| III. Simplicity & Minimal Footprint | Yes | PASS | Single workflow file, minimal jobs, no unnecessary abstractions |
| IV. Test-First Quality Gates | Partial | PASS | Workflow files can't be unit tested; validation is via manual push-to-main. Existing CI checks continue to run independently |
| V. Accessible UI | No | N/A | No UI changes |
| VI. Performance | No | N/A | No application performance impact |
| Dev Workflow: CI/CD files need explicit approval | Yes | PASS | User explicitly requested this workflow |
| Dev Workflow: No --no-verify/--force flags | Yes | PASS | Workflow contains no skip flags |
| Dev Workflow: Signed releases if updater enabled | Yes | PASS | Updater is not enabled; code signing is explicitly out of scope per spec assumptions |

**Pre-Phase 0 gate**: PASS — no violations.  
**Post-Phase 1 gate**: PASS — design introduces no new violations.

## Project Structure

### Documentation (this feature)

```text
specs/011-github-actions-release/
├── plan.md              # This file
├── research.md          # Phase 0 output — decision log
├── data-model.md        # Phase 1 output — workflow entities
├── quickstart.md        # Phase 1 output — implementation guide
└── tasks.md             # Phase 2 output (created by /speckit-tasks)
```

### Source Code (repository root)

```text
.github/
└── workflows/
    └── release.yml      # The release workflow (NEW)
```

**Structure Decision**: Single workflow file under `.github/workflows/`. No additional source code changes needed — the workflow operates on the existing project structure.

## Workflow Design

### Job 1: `get-version`
- Runs on: `ubuntu-latest`
- Checks out repo, extracts `.version` from `src-tauri/tauri.conf.json` via `jq`
- Outputs: `version` string for downstream jobs

### Job 2: `build` (matrix)
- Depends on: `get-version`
- Strategy: `fail-fast: true` with 3 platforms
- Matrix:
  | Runner | Tauri Build Args | Extra Setup |
  |--------|-----------------|-------------|
  | `ubuntu-22.04` | (none) | `apt-get` for WebKitGTK 4.1, libappindicator3, librsvg2, patchelf |
  | `macos-latest` | `--target universal-apple-darwin` | Rust targets: `aarch64-apple-darwin`, `x86_64-apple-darwin` |
  | `windows-latest` | (none) | (none) |
- Steps: checkout → setup Node (LTS) → setup pnpm → setup Rust (+ targets) → install system deps → `pnpm install` → `tauri-action` (build only, no release) → `upload-artifact`

### Job 3: `release`
- Depends on: `get-version`, `build` (all matrix legs)
- Runs on: `ubuntu-latest`
- Permissions: `contents: write`
- Steps: checkout → `download-artifact` (merge all) → delete existing release/tag (if any) → `softprops/action-gh-release` with `generate_release_notes: true`

### Concurrency
- Group: `release` (single group for all pushes to main)
- `cancel-in-progress: true` — only latest push completes

## Complexity Tracking

> No constitution violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | —          | —                                   |
