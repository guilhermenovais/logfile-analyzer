# Data Model: GitHub Actions Release Workflow

**Feature**: 011-github-actions-release  
**Date**: 2026-06-18

## Overview

This feature introduces no application-level data model changes. It is a CI/CD workflow operating entirely within GitHub Actions. The "entities" below describe the workflow's inputs, intermediary state, and outputs — not application domain objects.

## Entities

### Version Source

| Field       | Type   | Source                          |
|-------------|--------|---------------------------------|
| version     | string | `src-tauri/tauri.conf.json` → `.version` |

**Validation**: Must be a non-empty string. Read via `jq -r .version`.

### Build Matrix Entry

| Field    | Type   | Values                                                   |
|----------|--------|----------------------------------------------------------|
| platform | string | `ubuntu-22.04`, `macos-latest`, `windows-latest`         |
| args     | string | `""` (Linux/Windows), `"--target universal-apple-darwin"` (macOS) |

### Build Artifacts (per platform)

| Platform | Artifact Types                | Bundle Directory                                              |
|----------|-------------------------------|---------------------------------------------------------------|
| Linux    | `.deb`, `.AppImage`           | `src-tauri/target/release/bundle/deb/`, `appimage/`           |
| macOS    | `.dmg`                        | `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`  |
| Windows  | `.msi`, `.exe` (NSIS)         | `src-tauri/target/release/bundle/msi/`, `nsis/`               |

### GitHub Release

| Field                  | Type    | Value                                        |
|------------------------|---------|----------------------------------------------|
| tag_name               | string  | `v{version}` (e.g., `v0.1.0`)               |
| name                   | string  | `v{version}`                                 |
| generate_release_notes | boolean | `true` (auto-generated from merged PRs)      |
| draft                  | boolean | `false`                                      |
| prerelease             | boolean | `false`                                      |
| assets                 | files[] | All artifacts from all platform builds        |

## State Transitions

```
Push to main
  → Workflow triggered
    → Version extracted
      → Build matrix (3 platforms, parallel)
        → All succeed → Release created/overwritten
        → Any fails   → No release published
```
