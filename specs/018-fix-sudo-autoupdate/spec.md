# Feature Specification: Fix Sudo Auto-Update on Linux

**Feature Branch**: `018-fix-sudo-autoupdate`  
**Created**: 2026-06-22  
**Status**: Draft  
**Input**: User description: "Currently, at least on linux, when auto-updating, a sudo command is ran. This means that to auto update I need to run the app on a terminal that used sudo recently, otherwise it will wait indefinitely for the password. I need this to be fixed."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Seamless Auto-Update Without Privilege Escalation (Priority: P1)

As a Linux user running the logfile-analyzer application, I want updates to download and install without requiring system-level (sudo/root) privileges, so that the application can update itself regardless of how it was launched (from a desktop shortcut, file manager, or terminal without prior sudo usage).

**Why this priority**: This is the core problem. The current update mechanism blocks indefinitely on Linux when sudo credentials are not cached, making auto-update effectively broken for most Linux users.

**Independent Test**: Launch the application from a fresh terminal session (no prior sudo usage) or from the desktop environment, trigger an update check, accept the update, and confirm the download + install completes without hanging or prompting for a password.

**Acceptance Scenarios**:

1. **Given** a Linux user launches the app from a desktop shortcut (no terminal), **When** an update is available and the user clicks "Update Now", **Then** the update downloads and installs without hanging or requiring password entry.
2. **Given** a Linux user launches the app from a terminal that has never run sudo, **When** an update is available and the user clicks "Update Now", **Then** the update completes successfully and the user is prompted to restart.
3. **Given** a Linux user launches the app from a terminal with cached sudo credentials, **When** an update is available and the user clicks "Update Now", **Then** the update behavior is unchanged and completes successfully (no regression).

---

### User Story 2 - Clear Error Feedback on Update Failure (Priority: P2)

As a Linux user, if the update cannot be applied due to a permissions issue or any other reason, I want to see a clear and actionable error message instead of the application hanging silently.

**Why this priority**: Even after fixing the primary update path, edge cases may arise where permissions are insufficient. Users need to understand what happened and what to do next.

**Independent Test**: Simulate an update failure scenario (e.g., read-only install directory) and verify the user receives an actionable error message within a reasonable time.

**Acceptance Scenarios**:

1. **Given** the update process encounters a permission-related error, **When** the installation step fails, **Then** the user sees an error message explaining the issue and is offered both a "Retry install" button (reuses downloaded artifact) and a link to the releases page for manual download.
2. **Given** the update process hangs for any reason, **When** the 120-second hard timeout is exceeded, **Then** the user is informed that the update could not be completed and is given the option to dismiss.
3. **Given** the download phase completes successfully, **When** the UI transitions to the install phase, **Then** the user sees a distinct "Installing..." state, and a polkit/pkexec graphical authentication dialog is presented (not a terminal sudo prompt).

---

### Edge Cases

- What happens when the application is installed in a system-wide location (e.g., `/usr/bin/`) that requires root to modify? The update should either install to a user-writable location or clearly inform the user that manual update is required.
- What happens when the user denies a polkit/pkexec prompt? The user should see a clear "update cancelled" message rather than the app hanging.
- What happens when pkexec is not available on the system (e.g., minimal Linux installs without a polkit agent)? The user should see an error message directing them to download the update manually from the releases page. No sudo fallback is attempted.
- What happens on non-Linux platforms (macOS, Windows)? Behavior should remain unchanged — no regressions.
- What happens when the download succeeds but the install/replace step fails due to the binary being in use? The user should be informed to restart the app and try again.

## Clarifications

### Session 2026-06-22

- Q: Which Linux bundle format should auto-update target? → A: .deb/.rpm — keep current format but replace terminal-based sudo with polkit/pkexec graphical prompt.
- Q: What should happen if pkexec is not available on the system? → A: Show error directing user to download manually from the releases page (no sudo fallback).
- Q: Should there be a hard maximum timeout that aborts the entire update operation? → A: Yes, 120 seconds — abort and show error with manual download option.
- Q: Should the update process separate download and install into distinct UI phases? → A: Yes — show "Downloading..." then "Installing..." as separate phases; on install failure, offer "Retry install" without re-downloading.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The update process MUST NOT invoke sudo or any command that requires a terminal-based password prompt. Instead, privilege escalation MUST use polkit/pkexec to present a graphical authentication dialog.
- **FR-002**: The update process MUST complete successfully when the application is launched without elevated privileges (e.g., from a desktop shortcut or a terminal without prior sudo usage).
- **FR-003**: The update process MUST NOT hang indefinitely under any circumstances — if an operation cannot proceed, it MUST fail gracefully with a user-facing error message. A hard timeout of 120 seconds applies to the entire update operation (download + install); if exceeded, the operation is aborted.
- **FR-004**: The update process MUST continue to work correctly on macOS and Windows without regressions.
- **FR-005**: If the update cannot be installed due to filesystem permissions, the system MUST display an actionable error message to the user, including a link or reference to the releases page for manual download.
- **FR-006**: The update download and verification steps MUST remain unchanged — only the installation step (file replacement) needs to avoid privilege escalation.
- **FR-007**: If pkexec is not available on the system, the update process MUST NOT fall back to sudo. It MUST display an error directing the user to download manually from the releases page.
- **FR-008**: The update process MUST present download and install as separate UI phases ("Downloading..." then "Installing..."). If the install phase fails, the user MUST be offered a "Retry install" option that reuses the already-downloaded artifact without re-downloading.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can successfully auto-update the application on Linux when launched from a desktop environment (no terminal) 100% of the time when network connectivity is available and the update is valid.
- **SC-002**: The update process never hangs for more than 30 seconds without providing user feedback (progress indication or error message).
- **SC-005**: The entire update operation (download + install) MUST complete or abort within 120 seconds. If exceeded, the operation is aborted and the user is shown an error with a manual download option.
- **SC-003**: All existing update functionality on macOS and Windows continues to work identically (zero regressions).
- **SC-004**: Users who encounter a permissions-related update failure receive an error message within 10 seconds of the failure.

## Assumptions

- The application is distributed as .deb/.rpm Linux packages. The update installation step requires elevated privileges, which will be obtained via polkit/pkexec (graphical authentication dialog) instead of terminal-based sudo.
- The Tauri updater plugin (`tauri-plugin-updater`) install step needs to be customized at the application level to use pkexec instead of sudo for privilege escalation.
- Cross-platform behavior (macOS, Windows) is not affected by this change.
