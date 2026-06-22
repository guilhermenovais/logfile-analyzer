# Feature Specification: Highlight Click Navigation

**Feature Branch**: `019-highlight-click-navigation`  
**Created**: 2026-06-22  
**Status**: Draft  
**Input**: User description: "The highlights section (shown when you click the 'Show highlights' button) should behave similarly to the search result section: clicking a line in it should select the line on all three sections, and should make the main section scroll to the position of the clicked highlight. Hovering over the star on the main section should show the highlight label."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Click Highlight to Navigate (Priority: P1)

A user has highlighted several important lines across a large log file. They open the highlights panel and click on one of the highlighted lines. The clicked line becomes selected across all three sections (highlight panel, search results panel, and main log view), and the main log view scrolls to bring the clicked line into view.

**Why this priority**: This is the core navigation behavior that makes the highlights panel actionable for quick jumping between important lines, matching the proven search results interaction pattern.

**Independent Test**: Can be fully tested by highlighting a few lines in a long log, opening the highlights panel, and clicking entries — the main view must scroll to the selected line with a visible selection border.

**Acceptance Scenarios**:

1. **Given** a file with highlighted lines and the highlights panel is open, **When** the user clicks a highlight entry, **Then** the clicked line becomes selected (highlighted border) in the main log view, the highlights panel, and the search results panel (if open), and the main log view scrolls to bring the selected line into the visible area.
2. **Given** a file with highlighted lines and the highlights panel is open, **When** the user clicks a highlight entry that is already visible in the main log view, **Then** the line becomes selected without unnecessary scroll jumps.
3. **Given** a file with highlighted lines and the highlights panel is open, **When** the user clicks different highlight entries in sequence, **Then** each click updates the selection and scrolls the main view to the newly selected line.

---

### User Story 2 - Hover Star to See Label (Priority: P2)

A user has assigned labels to highlighted lines (e.g., "error start", "root cause"). While scrolling through the main log view, the user hovers over the star icon on a highlighted line and sees a tooltip displaying the highlight's label, providing quick context without needing to open the highlights panel.

**Why this priority**: This complements the click-to-navigate feature by surfacing label information inline, reducing the need to keep the highlights panel open for reference.

**Independent Test**: Can be fully tested by adding a labeled highlight, then hovering over the star icon in the main log view — a tooltip must appear showing the label text.

**Acceptance Scenarios**:

1. **Given** a highlighted line with a label in the main log view, **When** the user hovers over the star icon (★), **Then** a tooltip appears showing the highlight's label text.
2. **Given** a highlighted line without a label in the main log view, **When** the user hovers over the star icon (★), **Then** no tooltip is shown (or an empty tooltip is not displayed).
3. **Given** a highlighted line with a label and the user is hovering over the star, **When** the user moves the cursor away from the star, **Then** the tooltip disappears.

---

### Edge Cases

- What happens when a highlighted line is clicked but the line no longer exists in the file (e.g., file was truncated)? The system should handle this gracefully without errors.
- What happens when the highlight panel has many entries and the user clicks one near the bottom? The main view should still scroll correctly.
- What happens when a highlight label is very long? The tooltip should display the full label without cutting it off (wrapping is acceptable).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Clicking a highlight entry in the highlights panel MUST select that line across all visible sections (main log view, highlights panel, search results panel).
- **FR-002**: Clicking a highlight entry in the highlights panel MUST scroll the main log view to the selected line using the same scroll-to-line function and positioning logic used by the search results panel.
- **FR-003**: The selection state from clicking a highlight entry MUST use the same visual indicator (border style) already used for search result selection and line click selection.
- **FR-004**: Hovering over the star icon (★) on a highlighted line in the main log view MUST display a tooltip containing the highlight's label text.
- **FR-005**: The star tooltip MUST NOT appear when the highlighted line has no label assigned.
- **FR-006**: The highlights panel line items MUST be visually interactive (appear clickable), consistent with the search results panel styling.
- **FR-007**: The currently selected highlight entry in the highlights panel MUST display a distinct selected/active visual state, matching the selected entry styling used in the search results panel.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can navigate to any highlighted line in the file with a single click from the highlights panel.
- **SC-002**: Users can identify the purpose of a highlighted line by hovering over its star icon, without opening the highlights panel.
- **SC-003**: The click-to-navigate behavior in the highlights panel is consistent with the search results panel — same selection visual, same scroll behavior.
- **SC-004**: All existing highlight functionality (adding, removing, label editing) continues to work without regressions.

## Clarifications

### Session 2026-06-22

- Q: Where should the main log view scroll the target line to when clicking a highlight entry? → A: Match existing search result scroll behavior exactly (reuse same scroll function).
- Q: Should the star tooltip use a native browser tooltip or a custom styled component? → A: Native browser tooltip (`title` attribute).
- Q: Should the currently selected highlight entry have a distinct visual state within the highlights panel? → A: Yes, match search results panel's selected entry styling.

## Assumptions

- The existing line selection store (`useLineSelectionStore`) and scroll-to-line mechanism used by the search results panel can be reused for highlight navigation without modification.
- The highlights panel is already accessible via the "Show highlights" button and displays the correct data; only the interactivity needs to be added.
- Tooltip is implemented as a native browser tooltip via the `title` attribute on the star icon element, inheriting standard browser/OS hover delay and styling.
- The three "sections" referred to are the main log view, the highlights panel, and the search results panel — all share the same line selection state per file.
