# Feature Specification: Workspace and Log File Session Restore

**Feature Branch**: `003-fix-workspace-file-persistence`
**Created**: 2026-06-13
**Status**: Draft
**Input**: User description: "I want to fix the behavior of workspaces and log files. Currently, when you are in an unsaved workspace and you close the app and open it again, the app isn't able to load the file (message FileUnavailable). When the workspace is saved, this doesn't happen, the files can be loaded normally. But when the workspace is saved, when you close the app and open it again, the app isn't opened on the workspace that was open before, as would be expected."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Unsaved workspace files survive a restart (Priority: P1)

A user adds one or more log files to their current (unsaved/draft) workspace, then closes the application without explicitly saving the workspace. When they relaunch the application, the files they were working with are still loaded and viewable — they do not see a "file unavailable" message for files that are still present on disk.

**Why this priority**: This is the most common workflow (most users never explicitly "save" a workspace) and the current broken behavior makes the tool feel unreliable every time it is restarted, forcing users to re-add files manually.

**Independent Test**: Open the app, add one or more log files without saving the workspace, close the app, reopen it, and confirm the files are loaded and readable without any "file unavailable" indicator.

**Acceptance Scenarios**:

1. **Given** an unsaved workspace with one log file added, **When** the user closes and reopens the application, **Then** the log file is automatically reloaded and its contents can be viewed and searched without error.
2. **Given** an unsaved workspace with multiple log files added, **When** the user closes and reopens the application, **Then** all of the log files are automatically reloaded and accessible.

---

### User Story 2 - Application reopens to the last active saved workspace (Priority: P2)

A user opens a previously saved workspace and works in it. When they close the application and reopen it later, the application automatically returns to that same saved workspace (with its files loaded), instead of starting somewhere else (e.g., an empty draft workspace).

**Why this priority**: Saved workspaces represent a deliberate choice by the user to group specific files for ongoing analysis; not returning to that workspace forces extra manual navigation every time the app starts, undermining the purpose of saving a workspace.

**Independent Test**: Open (or create and save) a named workspace containing at least one log file, close the application while that workspace is active, reopen the application, and confirm it opens directly into that same saved workspace with its files loaded.

**Acceptance Scenarios**:

1. **Given** a saved workspace is the active workspace when the application is closed, **When** the application is relaunched, **Then** the application opens directly into that same saved workspace.
2. **Given** the application opens into the restored saved workspace, **When** the workspace finishes loading, **Then** all of its previously associated log files are loaded the same way they would be if the user had opened the workspace manually.
3. **Given** the user switches back to the unsaved/draft workspace and closes the application while it is active, **When** the application is relaunched, **Then** the application opens into the unsaved/draft workspace (not the previously used saved workspace).

---

### User Story 3 - Missing files don't block restoring the rest of a workspace (Priority: P3)

A user restarts the application after a log file referenced by their previously active workspace (saved or unsaved) has been moved, renamed, or deleted. The workspace and its other files still load normally, with only the missing file flagged as unavailable.

**Why this priority**: This protects the core fix (restoring workspaces and files on restart) from being undermined by edge cases involving missing files, and keeps behavior consistent with how missing files are already handled when opening a saved workspace manually today.

**Independent Test**: Add two log files to a workspace, delete or move one of the files on disk, close and reopen the application, and confirm the workspace loads with the remaining file fully accessible and the missing file clearly marked as unavailable (without an application error).

**Acceptance Scenarios**:

1. **Given** a restored workspace references a log file that no longer exists at its recorded location, **When** the application finishes restoring the workspace, **Then** that file is marked as unavailable in the interface while the rest of the workspace and its other files load normally.
2. **Given** all files referenced by a restored workspace are missing, **When** the application finishes restoring the workspace, **Then** the workspace itself still opens (showing all files as unavailable) rather than failing to restore at all.

---

### Edge Cases

- What happens if the saved workspace that was active at last close has since been deleted? The application falls back to opening the unsaved/draft workspace, without showing an error.
- What happens on the very first launch of the application, when there is no prior session to restore? The application opens to an empty unsaved/draft workspace, as it does today.
- What happens if a log file in the unsaved/draft workspace has been moved or deleted since the last session? That file is marked unavailable (consistent with how saved workspaces already handle this), while the rest of the draft workspace loads normally.
- What happens if the user never adds any files and simply closes and reopens the application repeatedly? The application restores to the same (empty) workspace each time without errors.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST automatically reload, on application startup, all log files that were associated with the unsaved/draft workspace at the time the application was last closed.
- **FR-002**: The system MUST NOT report a log file in the unsaved/draft workspace as unavailable if that file still exists at its previously recorded location.
- **FR-003**: The system MUST record which workspace (the unsaved/draft workspace, or a specific saved workspace) was active in the application at the time it was closed.
- **FR-004**: On startup, the system MUST automatically open the workspace that was active when the application was last closed, without requiring any user action.
- **FR-005**: When restoring a saved workspace on startup, the system MUST load its associated log files using the same process used when a user manually opens that saved workspace, including availability checks per file.
- **FR-006**: If the workspace recorded as "last active" no longer exists (e.g., a saved workspace was deleted between sessions), the system MUST fall back to opening the unsaved/draft workspace without showing an error to the user.
- **FR-007**: The system MUST correctly repeat the restore-on-launch behavior across repeated close-and-reopen cycles, not only immediately after the fix is applied.
- **FR-008**: If an individual log file referenced by the restored workspace (saved or unsaved) cannot be found at its recorded location, the system MUST mark only that file as unavailable while still loading the rest of the workspace and its other files.
- **FR-009**: On the first-ever launch of the application (no previously recorded active workspace), the system MUST default to an empty unsaved/draft workspace.

### Key Entities

- **Workspace**: A named or unnamed collection of log files being analyzed together. May be the single "unsaved/draft" workspace (automatically maintained) or one of several user-named "saved" workspaces.
- **Log File Reference**: An association between a workspace and a specific log file's location on disk, including a display name and an availability status (available or unavailable).
- **Last Active Workspace**: A record of which workspace (draft or a specific saved workspace) was open in the application at the moment it was last closed, used to restore that workspace automatically the next time the application starts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After closing and relaunching the application with an unsaved workspace, 100% of previously added log files that remain at their original location load successfully with no "file unavailable" message.
- **SC-002**: After closing and relaunching the application while a saved workspace was active, the application opens directly into that same saved workspace with no additional navigation required from the user.
- **SC-003**: A user can close and reopen the application at least 5 times in a row, with the active workspace and its files correctly restored every time.
- **SC-004**: When a file referenced by the restored workspace is missing, the remaining files in that workspace, and the workspace itself, still load successfully (0% chance of the missing file blocking the whole workspace from opening).

## Assumptions

- The application maintains a single active workspace at any given time (no multi-window or multi-session state to restore).
- The existing behavior for handling individually missing files within a saved workspace (marking the file unavailable without blocking the rest of the workspace) is correct and should be extended to the unsaved/draft workspace, rather than redesigned.
- No changes are required to how users manually switch between workspaces during a session — this feature only affects what happens automatically at application startup.
- "Closing the application" refers to a normal application close/quit; abrupt process termination (e.g., a crash or forced kill) is not guaranteed to update the recorded "last active workspace."
