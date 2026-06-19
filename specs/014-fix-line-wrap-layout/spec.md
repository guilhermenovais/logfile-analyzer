# Feature Specification: Fix Line Wrap Layout

**Feature Branch**: `014-fix-line-wrap-layout`  
**Created**: 2026-06-19  
**Status**: Draft  
**Input**: User description: "The wrap lines function is not working correctly, because apparently the line container is not growing vertically to accommodate the new line height. This causes lines to overlap one another. Since we will probably need to change the line container, we should also add a little margin to it, because when a line is selected, the blue border causes its text to shift a little, inside the container."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Wrapped Lines Display Without Overlapping (Priority: P1)

A user opens a log file containing long lines and enables the "wrap lines" toggle. Each line that wraps to multiple visual rows should expand its container vertically so that all text is fully visible. Currently, wrapped lines overlap the lines below them, making the log unreadable.

**Why this priority**: This is the core bug — line wrapping is effectively broken because overlapping text makes it impossible to read wrapped content.

**Independent Test**: Can be fully tested by opening any log file with long lines, toggling wrap on, and verifying that no text overlaps between adjacent lines.

**Acceptance Scenarios**:

1. **Given** a log file with lines exceeding the viewport width is open, **When** the user enables line wrapping, **Then** each line container grows vertically to fit all wrapped text and no text overlaps adjacent lines.
2. **Given** line wrapping is enabled and a long line wraps to three visual rows, **When** the user scrolls through the log, **Then** the three-row line and its neighbors are fully visible with no clipping or overlap.
3. **Given** line wrapping is enabled, **When** the user resizes the application window to be narrower, **Then** lines re-wrap to the new width and containers adjust their height accordingly without overlap.

---

### User Story 2 - Selected Line Border Does Not Shift Content (Priority: P2)

A user clicks on a log line to select it. A blue border appears around the selected line. The text inside the line should not shift or jump when the border appears or disappears, so the user can comfortably read and compare lines without visual disruption.

**Why this priority**: This is a visual polish issue that affects readability. While not as severe as overlapping lines, the content shifting on selection is distracting and undermines the selection feature's usability.

**Independent Test**: Can be fully tested by clicking on any log line to select it and verifying that the text position inside the line does not move.

**Acceptance Scenarios**:

1. **Given** a log file is open with wrapping enabled or disabled, **When** the user clicks a line to select it, **Then** the blue selection border appears and the text inside the line does not shift horizontally or vertically.
2. **Given** a line is selected (blue border visible), **When** the user clicks a different line, **Then** the previously selected line's text returns to its original position without shifting, and the newly selected line's text also does not shift.
3. **Given** a line is selected, **When** the user observes the selected line alongside adjacent unselected lines, **Then** all text remains aligned with no visible jump or offset.

---

### Edge Cases

- What happens when a single line is extremely long (e.g., thousands of characters) and wraps to many visual rows?
- How does the layout behave when wrapping is toggled on and off rapidly?
- What happens when a wrapped, selected line is scrolled out of view and then back into view?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The line container MUST grow vertically to accommodate the full height of wrapped text when line wrapping is enabled.
- **FR-002**: Adjacent lines MUST NOT overlap visually regardless of how many visual rows a wrapped line occupies.
- **FR-003**: The line container MUST include consistent spacing (margin or padding) so that the selection border does not cause text content to shift when a line is selected or deselected.
- **FR-004**: The selection border MUST appear without displacing the text content within the line.
- **FR-005**: The scroll position and overall layout MUST remain stable when the user toggles line wrapping on and off.
- **FR-006**: Scrolling through the log MUST remain smooth and performant when line wrapping is enabled, even for large log files.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero pixel overlap between any two adjacent line containers when line wrapping is enabled, verified across lines of varying lengths.
- **SC-002**: Zero pixel shift of text content within a line when it transitions between selected and unselected states.
- **SC-003**: Scrolling through a log file with line wrapping enabled feels smooth and responsive, with no visible jank or stutter for files of typical size (up to 100,000 lines).
- **SC-004**: Users can read all text in every wrapped line without any clipping or hidden content.

## Assumptions

- The application already has a working line wrapping toggle that sets the text wrapping style; only the container sizing and border behavior need to be fixed.
- The existing virtualized scrolling approach will be preserved, but may require changes to how row heights are calculated to support dynamic heights.
- The fix should not significantly degrade scrolling performance for large files.
- The blue selection border is an existing design choice that should be preserved; only its layout impact needs to be corrected.
