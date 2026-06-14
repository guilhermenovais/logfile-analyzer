# Feature Specification: Redesign App Shell UI

**Feature Branch**: `005-redesign-app-shell-ui`
**Created**: 2026-06-13
**Status**: Draft
**Input**: User description: "I want to improve the UI of my app. There are some points that specially annoy me. First, there is no clear separation of what should be on the top bar and what should be on the sidebar. The top bar should be a menu bar, with the following top-level menu items: Workspace, Options and Help. Workspace show have the items New, Open and Save. Options should just open the settings dialog (the cog icon should be removed from the top bar and replace by this). Help should have an About item, which should open a dialog displaying the app version. The sidebar on the left should be the current workspace section. On the top of it, the name of the workspace should be shown. When clicking the name, one should be able to rename it. There should be an "Add file" button. Bellow it, there should be the list of files in the workspace. Improve the appearence of this list. Another thing that annoys me is that the search type select (Logical/Regex) is taller than the search text field, and the search button and history icon are shorter. fix this row items height."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use a proper menu bar for app-level actions (Priority: P1)

As a user, I want the top bar to act as a menu bar with clearly grouped actions (Workspace, Options, Help), so that workspace actions, app settings, and help/about information are all discoverable in one consistent, predictable place instead of scattered icons.

**Why this priority**: This is the structural change that establishes the new top bar/sidebar separation. It removes the standalone settings cog and consolidates workspace-level actions (New, Open, Save) that currently live in or near the sidebar, directly fixing the "no clear separation" complaint. Without this, the rest of the redesign has no consistent shell to sit in.

**Independent Test**: Can be fully tested by opening the app, using the top menu bar to create a new workspace, open a saved workspace, save the current workspace, open settings via "Options", and view the app version via "Help > About" — all without using any sidebar controls or a visible gear/cog icon.

**Acceptance Scenarios**:

1. **Given** the app is open, **When** the user looks at the top bar, **Then** they see exactly three top-level menu entries: "Workspace", "Options", and "Help", and no standalone settings (cog/gear) icon is present.
2. **Given** the user opens the "Workspace" menu, **When** they view its contents, **Then** they see "New", "Open", and "Save" items.
3. **Given** the user selects "New" from the Workspace menu, **When** the action completes, **Then** a new empty workspace is created, following the same safeguards (e.g., prompting to save unsaved changes) as the current "New" control.
4. **Given** the user selects "Open" from the Workspace menu, **When** the action completes, **Then** the user is shown their saved workspaces to choose one to open, equivalent to the current "Saved" control.
5. **Given** the user selects "Save" from the Workspace menu, **When** the current workspace is unnamed, **Then** the existing save-naming prompt is shown; **When** it is already named, **Then** it is saved using its current name.
6. **Given** the user opens the "Options" menu, **When** they select it, **Then** the settings dialog opens directly (no submenu items).
7. **Given** the user opens the "Help" menu, **When** they select "About", **Then** a dialog opens showing the application's current version number.

---

### User Story 2 - Rename and manage the workspace from the sidebar (Priority: P2)

As a user, I want the sidebar to clearly represent my current workspace — showing its name at the top (renamable by clicking it), an "Add file" action, and a cleaner-looking list of the files in the workspace — so the sidebar feels like a focused "current workspace" panel rather than a mix of unrelated controls.

**Why this priority**: This delivers the second half of the "clear separation" goal: once workspace-creation actions move to the menu bar (User Story 1), the sidebar can be simplified to focus purely on the active workspace's identity and contents. It also adds a new capability (renaming) and a visual improvement (file list appearance) that are valuable even if delivered after the menu bar change.

**Independent Test**: Can be fully tested by opening a workspace, clicking its name in the sidebar to rename it, confirming the new name persists, adding a file via the "Add file" button, and visually reviewing the file list for improved layout/styling.

**Acceptance Scenarios**:

1. **Given** a workspace is open, **When** the user looks at the top of the sidebar, **Then** the current workspace's name is displayed.
2. **Given** the workspace name is displayed, **When** the user clicks on it, **Then** it becomes editable in place, allowing the user to type a new name.
3. **Given** the user has edited the workspace name and confirms it (e.g., by pressing Enter or clicking away), **When** the edit is committed, **Then** the workspace's new name is saved and reflected everywhere it is shown (sidebar, saved workspaces list, window title if applicable).
4. **Given** the user cancels the rename (e.g., presses Escape), **When** the edit is cancelled, **Then** the original workspace name is restored unchanged.
5. **Given** a workspace is open, **When** the user looks below the workspace name, **Then** an "Add file" button is visible and, when clicked, opens the existing add-file flow.
6. **Given** the workspace contains one or more files, **When** the user views the file list below the "Add file" button, **Then** each file is presented with improved visual styling (clear spacing, alignment, and visibility of status indicators such as availability warnings and indexing state) compared to the current plain list.
7. **Given** the workspace contains no files, **When** the user views the file list area, **Then** an empty state is shown indicating no files have been added yet.

---

### User Story 3 - Consistent height for search row controls (Priority: P3)

As a user, I want the search type selector, search text field, search button, and search history icon to all have the same height in their row, so the search bar looks visually aligned and professional instead of having mismatched control sizes.

**Why this priority**: This is a focused visual polish fix, independent of the menu bar and sidebar changes. It's lower priority because it's a cosmetic alignment issue affecting a single row, but it's a quick, high-visibility win for perceived quality.

**Independent Test**: Can be fully tested by opening a file and viewing the search row — the search type select (Logical/Regex), the search text input, the search submit button, and the search history icon should all render at the same height and be vertically aligned within the row.

**Acceptance Scenarios**:

1. **Given** a log file is open and the search row is visible, **When** the user inspects the row, **Then** the search type select, search text input, search button, and search history icon all have equal height.
2. **Given** the search row controls now share a common height, **When** the user compares them, **Then** all controls remain vertically centered and aligned along the same horizontal baseline within the row.
3. **Given** the search row is displayed at different application window widths, **When** the window is resized, **Then** the controls continue to share the same height and remain aligned.

---

### Edge Cases

- What happens if the user tries to rename the workspace to an empty or whitespace-only name? The system should reject the change and keep the previous name.
- What happens if the user renames a workspace to a name that is identical to another saved workspace's name? The system should allow it (names are not required to be unique) unless existing save logic already enforces uniqueness, in which case that existing behavior is preserved.
- What happens if the user selects "New" from the Workspace menu while there are unsaved changes in the current workspace? The system should follow the same unsaved-changes handling that exists today for the equivalent action.
- What happens if the user selects "Save" before any file has been added to the workspace? The save flow proceeds as it does today for an empty workspace.
- How does the file list appear when a file is unavailable (e.g., moved/deleted) or still indexing? These existing status indicators (availability warning, indexing state) must remain visible and clear within the improved list styling.
- How do the menu bar items behave on very narrow window widths — do "Workspace", "Options", and "Help" remain visible and usable without overlapping or being clipped?
- What version value is shown in the "About" dialog if it cannot be determined at runtime? A fallback/placeholder should be shown rather than leaving the field blank or erroring.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The top bar MUST be presented as a menu bar containing exactly three top-level menu items: "Workspace", "Options", and "Help".
- **FR-002**: The "Workspace" menu MUST contain the items "New", "Open", and "Save".
- **FR-003**: Selecting "New" MUST create a new, empty workspace, preserving any existing safeguards for unsaved changes that apply to the current equivalent control.
- **FR-004**: Selecting "Open" MUST present the user's saved workspaces so one can be selected and opened, preserving the behavior of the current equivalent control.
- **FR-005**: Selecting "Save" MUST save the current workspace, prompting for a name if the workspace does not yet have one, preserving the behavior of the current equivalent control.
- **FR-006**: The "Options" top-level menu item MUST open the settings dialog directly when selected (it has no sub-items).
- **FR-007**: The standalone settings (cog/gear) icon and its control MUST be removed from the top bar.
- **FR-008**: The "Help" menu MUST contain an "About" item.
- **FR-009**: Selecting "About" MUST open a dialog that displays the application's current version.
- **FR-010**: The sidebar MUST display the name of the currently active workspace at the top of the sidebar.
- **FR-011**: Clicking the workspace name MUST allow the user to edit and rename the workspace in place.
- **FR-012**: The system MUST persist the renamed workspace name and reflect it consistently across the UI (sidebar, saved workspace listings, and any other location currently showing the workspace name).
- **FR-013**: The system MUST reject empty or whitespace-only workspace names, retaining the previous name in that case.
- **FR-014**: The sidebar MUST display an "Add file" button below the workspace name/rename area, preserving the existing add-file behavior.
- **FR-015**: The sidebar MUST display the list of files in the current workspace below the "Add file" button, with improved visual presentation (spacing, hierarchy, and readability) while preserving existing per-file information (alias, availability warning, indexing status, and removal action).
- **FR-016**: The sidebar file list MUST show a clear empty state when the workspace contains no files.
- **FR-017**: The search type select, search text field, search submit button, and search history icon MUST render with equal height and remain vertically aligned within their row, across supported window sizes.

### Key Entities

- **Workspace**: A named collection of log files the user is working with. Attributes relevant to this feature: name (now user-editable via the sidebar), and its list of associated files.
- **Menu Bar**: The application's top-level navigation, composed of top-level menus ("Workspace", "Options", "Help"), each exposing a set of actions or, in the case of "Options", opening a dialog directly.
- **File Entry**: A single log file within a workspace, shown in the sidebar list with its display name, availability status, and indexing status.
- **About Dialog**: A dialog surfaced from the Help menu that displays the application's current version information.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can locate and execute "New", "Open", and "Save" workspace actions entirely from the top menu bar, with no equivalent controls remaining in the sidebar.
- **SC-002**: No gear/cog icon is present anywhere in the top bar; app settings are reachable only via "Options" in the menu bar.
- **SC-003**: Users can rename the active workspace using no more than 2 interactions (click the name, type and confirm), with the new name visible immediately afterward.
- **SC-004**: Users can view the application's current version number within 2 interactions (open "Help", select "About").
- **SC-005**: 100% of the search row's controls (type select, text field, search button, history icon) render at the same height, verified across at least three window widths (narrow, medium, wide).
- **SC-006**: In a usability check, users correctly identify where to find workspace actions, app settings, and version/help information without guidance, based on the new menu structure.

## Assumptions

- "Open" in the Workspace menu corresponds to the app's existing "browse saved workspaces" capability (currently the "Saved" control); no new file-system "open" dialog is introduced.
- Renaming the workspace happens inline (click-to-edit text) rather than via a separate modal dialog, consistent with the user's description ("When clicking the name, one should be able to rename it").
- The application version shown in the About dialog is the same version value already tracked for the app (e.g., the app's package/build version), not a separately maintained value.
- "Improve the appearance of this list" is interpreted as applying visual/layout polish (spacing, alignment, hierarchy) to the existing file list, without changing what information is shown or removing existing per-file actions (e.g., remove file).
- The existing "New"/"Saved" buttons and their underlying logic in the sidebar are relocated into the "Workspace" menu rather than duplicated; the sidebar header area is freed up for the workspace name and rename control.
- Settings dialog content/behavior itself is unchanged by this feature — only its entry point moves from a top-bar icon to the "Options" menu item.
