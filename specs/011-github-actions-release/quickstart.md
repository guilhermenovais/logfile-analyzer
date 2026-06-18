# Quickstart: GitHub Actions Release Workflow

**Feature**: 011-github-actions-release  
**Date**: 2026-06-18

## What This Feature Does

Adds a GitHub Actions workflow that automatically builds and publishes a GitHub release with Windows, macOS, and Linux installers whenever code is pushed to the `main` branch. The release version is read from `src-tauri/tauri.conf.json`.

## Files to Create

| File | Purpose |
|------|---------|
| `.github/workflows/release.yml` | The release workflow |

## Workflow Architecture

```
┌─────────────────┐
│   Push to main   │
└────────┬────────┘
         │
┌────────▼────────┐
│   get-version    │  Extract version from tauri.conf.json
│  (ubuntu-latest) │
└────────┬────────┘
         │
┌────────▼─────────────────────────────────────┐
│              build (matrix, parallel)          │
│  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ Linux    │  │ macOS    │  │ Windows     │ │
│  │ .deb     │  │ .dmg     │  │ .msi        │ │
│  │ .AppImage│  │ (univ.)  │  │ .exe (NSIS) │ │
│  └────┬─────┘  └────┬─────┘  └──────┬──────┘ │
│       └──────┬───────┴──────┬────────┘        │
│         upload-artifact (per platform)         │
└────────────────────┬──────────────────────────┘
                     │ all succeed
         ┌───────────▼───────────┐
         │       release          │
         │  download artifacts    │
         │  delete old release    │
         │  create new release    │
         │  (ubuntu-latest)       │
         └────────────────────────┘
```

## Key Design Decisions

1. **Build and release are separate jobs** — ensures no partial releases (FR-007)
2. **Delete-then-create for overwrite** — cleanly replaces existing releases (FR-006)
3. **`concurrency: cancel-in-progress`** — only latest push completes (edge case from spec)
4. **macOS universal binary** — single `.dmg` for both Intel and Apple Silicon

## How to Test

1. Push any commit to `main`
2. Check GitHub Actions tab — workflow should trigger
3. After ~10-15 min, check GitHub Releases page
4. Verify release name matches version in `src-tauri/tauri.conf.json`
5. Verify artifacts for all 3 platforms are present
6. Push another commit without changing version — release should be overwritten

## Dependencies / Prerequisites

- Repository must be on GitHub with Actions enabled
- `GITHUB_TOKEN` (automatically provided by GitHub Actions)
- No additional secrets required (code signing is out of scope)
