# Feature Specification: GitHub Actions Release Workflow

**Feature Branch**: `011-github-actions-release`  
**Created**: 2026-06-18  
**Status**: Draft  
**Input**: User description: "I want to create a Github Actions workflow to generate a release for this project. The release should be named after the version of the project, which is in tauri.config.json. The release should contain the windows, mac and linux installers or images. The workflow should be ran whenever the main branch is changed. If the workflow is being ran with a version that already has a release, the existing release should be overwritten"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic Release on Main Push (Priority: P1)

As a project maintainer, when I push changes to the main branch (via direct push or merged pull request), a release is automatically created containing installable artifacts for all supported platforms (Windows, macOS, Linux), so that users always have access to the latest version without manual release steps.

**Why this priority**: This is the core functionality — without automatic release generation, there is no value delivered by the workflow.

**Independent Test**: Can be fully tested by pushing a commit to main and verifying that a GitHub release appears with the correct version name and platform artifacts attached.

**Acceptance Scenarios**:

1. **Given** a commit is pushed to the main branch, **When** the workflow triggers, **Then** a GitHub release is created with the version from `tauri.conf.json` as the release name and tag.
2. **Given** the workflow completes successfully, **When** a user visits the GitHub Releases page, **Then** they find downloadable installers/images for Windows, macOS, and Linux.
3. **Given** a pull request is merged into main, **When** the merge commit lands on main, **Then** the workflow triggers and produces a release.

---

### User Story 2 - Release Overwrite for Existing Versions (Priority: P2)

As a project maintainer, when I push changes to main without bumping the version in `tauri.conf.json`, the existing release for that version is replaced with freshly built artifacts, so that the release always reflects the latest code for a given version.

**Why this priority**: Without overwrite behavior, pushes to main with an unchanged version would fail or create duplicate releases, breaking the automated workflow.

**Independent Test**: Can be tested by pushing two consecutive commits to main without changing the version, and verifying the release is updated with new artifacts from the second build.

**Acceptance Scenarios**:

1. **Given** a release for version `0.1.0` already exists, **When** a new commit is pushed to main with the same version, **Then** the existing release is overwritten with new artifacts.
2. **Given** a release is overwritten, **When** a user downloads from the release page, **Then** they receive the artifacts from the most recent build.

---

### User Story 3 - Cross-Platform Artifact Availability (Priority: P1)

As a user, I want to download the appropriate installer or image for my operating system from the GitHub release, so that I can install the application on Windows, macOS, or Linux.

**Why this priority**: Platform coverage is essential — users on any major desktop OS must be able to install the application.

**Independent Test**: Can be tested by downloading each platform's artifact from the release page and verifying they are valid, installable packages.

**Acceptance Scenarios**:

1. **Given** a release exists, **When** a Windows user downloads the release artifacts, **Then** they find a Windows installer (e.g., `.msi` or `.exe`).
2. **Given** a release exists, **When** a macOS user downloads the release artifacts, **Then** they find a universal macOS disk image (e.g., `.dmg`) supporting both Intel (x86_64) and Apple Silicon (aarch64).
3. **Given** a release exists, **When** a Linux user downloads the release artifacts, **Then** they find a Linux package (e.g., `.deb`, `.AppImage`).

---

### Edge Cases

- What happens when `tauri.conf.json` contains an invalid or empty version string?
- When one platform's build fails but others succeed, the entire release is skipped — no partial releases are published.
- When multiple rapid pushes to main occur, in-progress workflow runs are cancelled — only the latest push's workflow completes.
- What happens when the repository has no existing releases?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The workflow MUST trigger automatically on every push to the `main` branch.
- **FR-002**: The workflow MUST read the application version from `src-tauri/tauri.conf.json`.
- **FR-003**: The workflow MUST create a GitHub release tagged and named with the version from `tauri.conf.json`.
- **FR-004**: The workflow MUST build the Tauri application for Windows, macOS, and Linux.
- **FR-005**: The workflow MUST attach all platform installers/images to the GitHub release as downloadable assets.
- **FR-006**: The workflow MUST overwrite (replace) an existing release if a release with the same version tag already exists.
- **FR-007**: The workflow MUST complete all platform builds before publishing the release, so users do not see partial releases.
- **FR-008**: The workflow MUST use the project's existing build toolchain (`pnpm` for frontend, Tauri CLI for application bundling).
- **FR-009**: The workflow MUST use GitHub's auto-generated release notes for the release body (lists merged PRs and contributors).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every push to the `main` branch results in a GitHub release within a reasonable CI timeframe.
- **SC-002**: Each release contains downloadable artifacts for all three platforms (Windows, macOS, Linux).
- **SC-003**: The release name and tag match the version specified in `tauri.conf.json`.
- **SC-004**: Pushing to main with an unchanged version successfully overwrites the prior release without manual intervention.
- **SC-005**: Users can download and install the application from any release on their respective platform.

## Clarifications

### Session 2026-06-18

- Q: What should happen if one platform's build fails while others succeed? → A: Fail the entire release — no artifacts published if any platform fails.
- Q: Which macOS architectures should the build target? → A: Universal binary (x86_64 + aarch64) for full coverage.
- Q: Should concurrent workflow runs cancel in-progress ones or all complete independently? → A: Cancel in-progress runs — only the latest push's workflow completes.
- Q: What should the body of each GitHub release contain? → A: Auto-generated release notes via GitHub's built-in feature (lists merged PRs and contributors).

## Assumptions

- The project uses `pnpm` as the package manager, as indicated by the existing build configuration.
- The Tauri application configuration at `src-tauri/tauri.conf.json` is the authoritative source for the project version.
- GitHub-hosted runners are sufficient for building on all three platforms (no self-hosted runners required).
- Code signing for macOS and Windows is out of scope for the initial workflow (unsigned builds are acceptable).
- The Tauri `bundle.targets` setting of `"all"` produces the appropriate installer formats for each platform.
- The workflow does not need to run on branches other than `main`.
- Concurrent workflow runs are handled by cancelling in-progress runs; only the latest push's workflow completes.
