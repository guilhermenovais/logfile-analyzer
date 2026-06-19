# Feature Specification: Fix Search UX

**Feature Branch**: `015-fix-search-ux`  
**Created**: 2026-06-19  
**Status**: Draft  
**Input**: User description: "Fix search feature: click-to-navigate from results to main view, consistent line margins in results panel, scrollbar for results panel, and layout overflow when results panel opens."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Search results panel breaks page layout (Priority: P1)

When a user performs a search and the search results panel appears, the overall layout becomes broken. Elements on the right side of the toolbar area (search button, search history button, search result navigation buttons) are pushed off-screen and become inaccessible. This makes the entire search feature unusable since the user cannot interact with navigation or close the panel.

**Why this priority**: This is a blocking issue that renders the search feature effectively unusable once triggered. Users cannot access key controls (navigation arrows, close button) once search results appear.

**Independent Test**: Perform any search that returns results and verify all toolbar and panel controls remain visible and clickable within the viewport.

**Acceptance Scenarios**:

1. **Given** a file is loaded with content, **When** the user performs a search that returns results and the results panel opens, **Then** all elements in the search bar (input field, type selector, search button, history button) remain fully visible and accessible.
2. **Given** the search results panel is open, **When** the user resizes the window to a smaller width, **Then** the layout adapts gracefully without pushing controls off-screen.
3. **Given** the search results panel is open, **When** the user looks at the search results panel header (match counter, navigation arrows, close button), **Then** all controls are visible and clickable.

---

### User Story 2 - Click search result to navigate main view (Priority: P2)

When a user clicks on a line in the search results panel, the main log viewer should scroll to that line's position. This allows users to quickly jump to relevant log entries from the search results without having to manually scroll through the main viewer.

**Why this priority**: This is a core navigation workflow. Without it, users must mentally note line numbers from search results and scroll manually, which defeats the purpose of having a results panel.

**Independent Test**: Perform a search, click on any result entry, and verify the main log viewer scrolls to center that line in view.

**Acceptance Scenarios**:

1. **Given** search results are displayed, **When** the user clicks on a result line, **Then** the main log viewer scrolls to position that line visibly in the viewport.
2. **Given** search results are displayed and the user clicks a result far from the current scroll position, **When** the main view scrolls to the clicked result, **Then** the clicked line is centered (or near-centered) in the main viewer.
3. **Given** the user clicks the same search result multiple times, **When** the main view is already showing that line, **Then** the view remains stable without jarring re-scrolls.

---

### User Story 3 - Search results panel needs a scrollbar (Priority: P3)

The search results panel should have a visible scrollbar (consistent with the main log viewer's scrollbar) to allow fast movement through a large list of search results. Currently, the panel has overflow scrolling but lacks a visible, easily draggable scrollbar for rapid navigation.

**Why this priority**: With many search matches, navigating the results list is cumbersome without a visible scrollbar. Users need to be able to quickly scan and jump through results.

**Independent Test**: Perform a search that returns many results (more than fit in the panel's visible area) and verify a visible scrollbar appears that can be dragged for fast navigation.

**Acceptance Scenarios**:

1. **Given** a search returns more results than fit in the visible panel area, **When** the results panel is displayed, **Then** a visible scrollbar appears allowing drag-based fast scrolling.
2. **Given** the results panel scrollbar is visible, **When** the user drags it, **Then** the results list scrolls proportionally and smoothly.

---

### User Story 4 - Consistent line margins in search results (Priority: P4)

Lines in the search results panel should have a small margin/border placeholder so that when a line is selected (and gets a blue selection border), the text content does not shift horizontally. The main log viewer already handles this with a transparent border that becomes colored on selection; the search results panel should follow the same pattern.

**Why this priority**: This is a visual polish issue. The text shift on selection is jarring and makes it harder to track which line was clicked. Consistent margins improve readability.

**Independent Test**: Click on different search result lines and verify that the text content does not shift position when the selection border appears or disappears.

**Acceptance Scenarios**:

1. **Given** the search results panel is showing results, **When** a result line is not selected, **Then** it has a transparent placeholder border matching the selected-state border width.
2. **Given** a result line is not selected, **When** the user clicks it and it becomes selected, **Then** the text and line number do not shift position; only the border color changes.
3. **Given** a result line is selected, **When** the user clicks a different result, **Then** the previously selected line's text does not shift when the border reverts to transparent.

### Edge Cases

- What happens when a search returns zero results? The panel should still display correctly without layout issues.
- What happens when the search results panel is opened and closed rapidly? Layout should remain stable.
- What happens when the clicked search result refers to a line that is far outside the currently loaded/virtualized range in the main viewer? The main viewer should still attempt to scroll to that position.
- What happens when the window is very narrow? The search bar controls should wrap or remain accessible rather than overflowing off-screen.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST keep all search bar elements (input, type selector, search button, history button) visible and accessible when the search results panel is open.
- **FR-002**: System MUST keep all search results panel controls (match counter, navigation arrows, close button) visible and accessible regardless of viewport width.
- **FR-003**: System MUST scroll the main log viewer to the corresponding line position when the user clicks a search result entry.
- **FR-004**: The main log viewer MUST center (or near-center) the target line in the viewport after a click-to-navigate action.
- **FR-005**: System MUST display a visible, draggable scrollbar in the search results panel when results exceed the visible area.
- **FR-006**: Search result lines MUST have a consistent border/margin placeholder so that text does not shift when the selection state changes.
- **FR-007**: The transparent placeholder border on unselected search result lines MUST match the width of the selected-state border.
- **FR-008**: The layout MUST remain stable when the search results panel opens, closes, or the window is resized.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All search bar and results panel controls remain fully visible and clickable at any reasonable viewport width (minimum 800px) when search results are displayed.
- **SC-002**: Clicking any search result line causes the main log viewer to scroll the corresponding line into view within 500ms.
- **SC-003**: Zero horizontal text shift occurs in search result lines when selection state changes (border width is constant).
- **SC-004**: Search results panel displays a visible scrollbar when result count exceeds the panel's visible capacity.
- **SC-005**: Users can complete the full search-and-navigate workflow (search, review results, click to navigate) without any controls becoming inaccessible.

## Assumptions

- The application is a desktop Tauri app with a minimum practical viewport width of ~800px.
- The main log viewer already has a working scrollbar and virtualized scrolling; the search results panel should achieve visual consistency with it.
- The main log viewer's `scrollToLine` mechanism (via `scrollNonce` and `virtualizer.scrollToIndex`) is the intended integration point for click-to-navigate.
- The existing `border-2 border-transparent`/`border-selected-line` pattern in `LogLine` is the correct approach for preventing text shift, and the search results panel should adopt the same pattern.
- The layout overflow issue is caused by the search results panel adding vertical content that isn't properly constrained within the flex layout.
