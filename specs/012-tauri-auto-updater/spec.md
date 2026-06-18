# Feature Specification: Tauri Auto-Updater

**Feature Branch**: `012-tauri-auto-updater`  
**Created**: 2026-06-18  
**Status**: Draft  
**Input**: User description: "I want to configure the auto updater for this tauri app. Consider that we already have a github workflow generating releases with the installers."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic Update Notification (Priority: P1)

A user is running the application and a new version has been published on GitHub. The application detects the available update and notifies the user that a new version is available, allowing them to choose to update now or later.

**Why this priority**: This is the core auto-update experience. Without update detection and notification, no other update functionality is possible. It delivers the primary value of keeping users on the latest version without requiring them to manually check for updates.

**Independent Test**: Can be fully tested by publishing a new release on GitHub with a higher version number and verifying the running application displays an update notification. Delivers the value of automatic update awareness.

**Acceptance Scenarios**:

1. **Given** the app is running and a newer version exists on GitHub, **When** the app checks for updates, **Then** the user sees a notification indicating a new version is available with the version number displayed.
2. **Given** the app is running and no newer version exists, **When** the app checks for updates, **Then** no notification is shown and the app continues operating normally.
3. **Given** the app is running and the device has no internet connectivity, **When** the app attempts to check for updates, **Then** no error is shown to the user and the app continues operating normally.

---

### User Story 2 - Download and Install Update (Priority: P2)

When a user is notified about an available update, they can choose to download and install it. The application downloads the update, shows progress, and prompts the user to restart to apply the update.

**Why this priority**: This completes the update lifecycle. Once the user knows an update exists, they need a way to apply it. Without this, users would still need to manually download from GitHub.

**Independent Test**: Can be tested by triggering the update installation from the notification dialog and verifying the new version is installed after restart. Delivers the value of seamless in-app updates.

**Acceptance Scenarios**:

1. **Given** the user sees an update notification, **When** they choose to update, **Then** the update downloads and the user sees download progress indication.
2. **Given** the update has finished downloading, **When** the installation is ready, **Then** the user is prompted to restart the application to apply the update.
3. **Given** the user chooses to update later, **When** they dismiss the notification, **Then** the app continues running the current version and will remind them on the next launch or check cycle.

---

### User Story 3 - Update with Signature Verification (Priority: P3)

All updates are verified for authenticity before installation. The application only installs updates that are signed with a trusted key, protecting users from tampered or unauthorized updates.

**Why this priority**: Security is essential for an auto-update mechanism. While the update flow works without explicit user interaction on this story, it is a non-negotiable safety measure that underpins user trust.

**Independent Test**: Can be tested by attempting to install an update with an invalid or missing signature and verifying the app rejects it with an appropriate error message. Delivers the value of secure, trusted updates.

**Acceptance Scenarios**:

1. **Given** a valid signed update is available, **When** the app downloads and verifies it, **Then** the update proceeds to installation.
2. **Given** an update with an invalid or missing signature is encountered, **When** the app attempts to verify it, **Then** the update is rejected and the user is informed that the update could not be verified.

---

### Edge Cases

- What happens when the update download is interrupted mid-way (e.g., network drops)?
- How does the system handle a corrupted download file?
- What happens if the user closes the app during the update download?
- How does the system behave when the release assets are still being uploaded (partial release)?
- What happens when the user is on a metered or slow connection?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST check for available updates from the GitHub releases endpoint on application startup.
- **FR-002**: System MUST display a user-facing notification when a newer version is detected, showing the available version number.
- **FR-003**: System MUST allow the user to accept or dismiss the update notification.
- **FR-004**: System MUST download the update in the background when the user accepts, displaying download progress.
- **FR-005**: System MUST prompt the user to restart the application once the update is downloaded and ready to install.
- **FR-006**: System MUST verify update signatures before applying any update, rejecting unsigned or tampered updates.
- **FR-007**: System MUST generate and manage signing keys as part of the build and release process.
- **FR-008**: System MUST produce update metadata (version manifest) as part of the release workflow so the app can discover new versions.
- **FR-009**: System MUST gracefully handle offline scenarios and update check failures without disrupting normal app usage.
- **FR-010**: System MUST support updates on all target platforms (Linux, macOS, Windows).

### Key Entities

- **Update Manifest**: Describes the latest available version, download URLs per platform, and signature information. Published as a release artifact.
- **Signing Key Pair**: A public/private key pair used to sign update packages during the build and verify them at install time. The public key is embedded in the application; the private key is stored securely in the CI environment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users are notified of a new version within 30 seconds of launching the application when an update is available.
- **SC-002**: 100% of update installations are signature-verified before being applied.
- **SC-003**: Users can complete the full update cycle (notification, download, restart) in under 5 minutes on a standard broadband connection.
- **SC-004**: Failed update checks (no connectivity, server errors) cause zero disruption to normal application usage.
- **SC-005**: Updates are available for all three target platforms (Linux, macOS, Windows) from the same release workflow.

## Assumptions

- The existing GitHub Actions release workflow already builds and publishes platform-specific installers (`.deb`, `.AppImage`, `.dmg`, `.msi`, `.exe`) and can be extended to also produce update artifacts.
- The application uses Tauri v2, which has built-in auto-update plugin support.
- GitHub Releases is the update distribution channel; no separate update server is needed.
- Users have sufficient disk space to download and apply updates.
- The signing key pair will be generated once and the private key stored as a GitHub Actions secret.
- The application currently has no update configuration in `tauri.conf.json` and no updater plugin dependency, so both need to be added.
