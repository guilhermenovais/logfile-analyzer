# Feature Specification: Search UX Improvements

**Feature Branch**: `020-search-ux-improvements`  
**Created**: 2026-06-22  
**Status**: Draft  
**Input**: User description: "Improve search UX with horizontal scrolling, larger navigation buttons with tooltips, keyboard shortcuts for result navigation, wrap lines option, and pagination for large result sets."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Horizontal Scrolling in Search Results (Priority: P1)

A user searches a log file containing very long lines. Currently, lines in the search results panel are truncated with CSS (`truncate`). The user wants to scroll horizontally within the results list to read the full content of matching lines without switching to another view.

**Why this priority**: Long lines are extremely common in log files (stack traces, JSON payloads, URLs). Users need to see the full content to determine which match is relevant before navigating to it.

**Independent Test**: Can be tested by searching a file with lines exceeding the panel width and verifying horizontal scrolling appears and works.

**Acceptance Scenarios**:

1. **Given** a search returns results with lines wider than the panel, **When** the user views the results list, **Then** a horizontal scrollbar appears on the results list allowing the user to scroll and read full line content.
2. **Given** a search returns results where all lines fit within the panel width, **When** the user views the results list, **Then** no horizontal scrollbar appears.

---

### User Story 2 - Larger Navigation and Close Buttons with Tooltips (Priority: P1)

A user navigating search results finds the up/down arrow buttons and the close button too small to comfortably click. The user wants larger click targets and tooltips that explain each button's function (including keyboard shortcut hints).

**Why this priority**: Small buttons create friction in a core workflow (navigating results). Tooltips improve discoverability for all users.

**Independent Test**: Can be tested by hovering over each button to see tooltips and verifying increased button size visually.

**Acceptance Scenarios**:

1. **Given** search results are displayed, **When** the user hovers over the "Previous match" button, **Then** a tooltip appears reading "Previous match (Shift+↑)".
2. **Given** search results are displayed, **When** the user hovers over the "Next match" button, **Then** a tooltip appears reading "Next match (Shift+↓)".
3. **Given** search results are displayed, **When** the user hovers over the "Close" button, **Then** a tooltip appears reading "Close search results".
4. **Given** search results are displayed, **When** the user looks at the navigation and close buttons, **Then** the buttons are noticeably larger than before with comfortable click targets.

---

### User Story 3 - Search History Button Tooltip (Priority: P2)

A user sees the clock icon button in the search bar but doesn't know what it does. Hovering over it should show a tooltip explaining its purpose.

**Why this priority**: Improves discoverability of the search history feature without requiring users to click an unknown button.

**Independent Test**: Can be tested by hovering over the search history button and verifying the tooltip appears.

**Acceptance Scenarios**:

1. **Given** the search bar is displayed, **When** the user hovers over the search history button (clock icon), **Then** a tooltip appears reading "Search history".

---

### User Story 4 - Keyboard Shortcuts for Result Navigation (Priority: P1)

A user wants to quickly navigate through search results using the keyboard instead of clicking the small up/down buttons. Pressing Shift+Up and Shift+Down should move to the previous and next match respectively, mirroring the button functionality.

**Why this priority**: Power users working with log files rely heavily on keyboard navigation. This significantly speeds up the workflow of reviewing matches.

**Independent Test**: Can be tested by performing a search and pressing Shift+Up/Shift+Down to verify navigation through results.

**Acceptance Scenarios**:

1. **Given** search results are displayed with multiple matches, **When** the user presses Shift+Down, **Then** the next match is selected and scrolled into view.
2. **Given** search results are displayed with multiple matches, **When** the user presses Shift+Up, **Then** the previous match is selected and scrolled into view.
3. **Given** the search results panel is not open, **When** the user presses Shift+Up or Shift+Down, **Then** nothing happens (shortcuts are only active when results are visible).
4. **Given** the user is at the last match, **When** the user presses Shift+Down, **Then** the selection wraps around to the first match (consistent with existing button behavior).
5. **Given** the user is at the first match, **When** the user presses Shift+Up, **Then** the selection wraps around to the last match (consistent with existing button behavior).
6. **Given** the search results panel is open and the user is focused on any element (including the search input), **When** the user presses Shift+Up or Shift+Down, **Then** result navigation occurs (shortcuts work globally, consistent with existing Up/Down navigation).

---

### User Story 5 - Wrap Lines Option for Search Results (Priority: P2)

A user viewing search results with long lines wants the option to toggle line wrapping on or off within the search results section. When enabled, long lines wrap within the panel instead of requiring horizontal scrolling.

**Why this priority**: Complements horizontal scrolling by giving users a choice based on their preference and the type of content they're inspecting.

**Independent Test**: Can be tested by toggling the wrap lines option and verifying that long lines either wrap or remain on a single line with horizontal scrolling.

**Acceptance Scenarios**:

1. **Given** search results contain long lines, **When** the user enables the "Wrap lines" option, **Then** all result lines wrap within the panel width and no horizontal scrollbar is shown on the results list.
2. **Given** search results contain long lines, **When** the user disables the "Wrap lines" option, **Then** result lines are displayed on a single line with horizontal scrolling available.
3. **Given** the user toggles the wrap lines option, **When** the user performs another search, **Then** the wrap lines preference is preserved.
4. **Given** the user opens search results for the first time in a session, **When** they view results with long lines, **Then** wrap lines is OFF by default and horizontal scrolling is available.

---

### User Story 6 - Pagination for Large Result Sets (Priority: P2)

When a search returns more than 500 matches, the results are currently truncated with a message. The user wants the ability to load the next page of results to see additional matches beyond the first 500.

**Why this priority**: Users searching large log files frequently encounter the 500-match limit. Being able to paginate past it enables thorough investigation without requiring the user to narrow the query.

**Independent Test**: Can be tested by performing a search that returns more than 500 matches and clicking a "next page" control to load more results.

**Acceptance Scenarios**:

1. **Given** a search returns more than 500 matches, **When** the user views the search results, **Then** a control is displayed allowing the user to navigate to the next page of results.
2. **Given** the user is viewing a subsequent page of results, **When** the user clicks a "previous page" control, **Then** the previous page of results is displayed.
3. **Given** a search returns 500 or fewer matches, **When** the user views the search results, **Then** no pagination controls are displayed.
4. **Given** the user navigates to a subsequent page, **When** the results load, **Then** the match counter updates to reflect the current position within the full result set (e.g., "501 of 1200").
5. **Given** a search returns more than 500 matches, **When** the first page is displayed, **Then** the counter initially shows "1 of 500+" while the total count is computed asynchronously, then updates to the exact total (e.g., "1 of 1200") once known.

---

### Edge Cases

- What happens when the user presses Shift+Up/Shift+Down while typing in the search input field? The shortcuts work globally regardless of focus, consistent with the existing Up/Down navigation shortcuts.
- What happens when the user toggles wrap lines while the panel is scrolled to a particular match? The scroll position should be preserved as closely as possible to keep the currently selected match visible.
- What happens when results are paginated and the user performs a new search? Pagination should reset to the first page.
- What happens while a new page of results is loading? A lightweight loading indicator (e.g., spinner) is shown in the results area until the page loads.
- What happens when the user navigates with keyboard shortcuts across page boundaries? Navigation should stay within the current page; the user must explicitly change pages.

## Clarifications

### Session 2026-06-22

- Q: Should the "Wrap lines" toggle default to ON or OFF? → A: OFF by default (horizontal scrolling is the initial experience).
- Q: Should Shift+Up/Down shortcuts be suppressed in text inputs? → A: No — shortcuts work globally regardless of focus, matching existing Up/Down navigation behavior.
- Q: Should total match count be computed eagerly or progressively? → A: Hybrid — show first 500 results immediately, then compute total count asynchronously and update the counter.
- Q: Should there be a loading indicator during pagination page transitions? → A: Yes, show a lightweight loading indicator (e.g., spinner) in the results area.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Search results list MUST support horizontal scrolling when line content overflows the panel width.
- **FR-002**: The "Previous match," "Next match," and "Close search results" buttons MUST have increased click target sizes for easier interaction.
- **FR-003**: The "Previous match" button MUST display a tooltip reading "Previous match (Shift+↑)" on hover.
- **FR-004**: The "Next match" button MUST display a tooltip reading "Next match (Shift+↓)" on hover.
- **FR-005**: The "Close search results" button MUST display a tooltip reading "Close search results" on hover.
- **FR-006**: The search history button (clock icon) MUST display a tooltip reading "Search history" on hover.
- **FR-007**: Users MUST be able to navigate to the next match by pressing Shift+Down when search results are visible.
- **FR-008**: Users MUST be able to navigate to the previous match by pressing Shift+Up when search results are visible.
- **FR-009**: Keyboard shortcuts (Shift+Up/Shift+Down) MUST work globally regardless of which element is focused, consistent with the existing Up/Down navigation behavior.
- **FR-010**: The search results section MUST include a "Wrap lines" toggle that wraps long lines within the panel when enabled.
- **FR-011**: The wrap lines preference MUST default to OFF (horizontal scrolling) and persist across searches within the same session.
- **FR-012**: When wrap lines is enabled, horizontal scrolling on the results list MUST be suppressed.
- **FR-013**: When search matches exceed 500, a pagination control MUST appear allowing the user to load the next page of results.
- **FR-014**: Pagination controls MUST include both "next page" and "previous page" navigation when applicable.
- **FR-015**: The search MUST first compute and display the first page of results (up to 500 matches) immediately, then compute the total match count asynchronously and update the match counter to reflect the current position within the full result set (e.g., "501 of 1200").
- **FR-016**: Performing a new search MUST reset pagination to the first page.
- **FR-017**: A loading indicator MUST be displayed in the results area while a pagination page transition is in progress.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can read the full content of any search result line without leaving the search results panel.
- **SC-002**: All interactive buttons in the search area display informative tooltips on hover within 300ms.
- **SC-003**: Users can navigate through all search results using only the keyboard (Shift+Up/Shift+Down) at the same speed as clicking the buttons.
- **SC-004**: Users can toggle between wrapped and unwrapped line display in the search results with a single click.
- **SC-005**: Users can access search results beyond the 500-match limit through pagination, viewing the complete result set in pages.
- **SC-006**: Navigation button click targets are at least 28×28 pixels for comfortable interaction on both mouse and touch input.

## Assumptions

- The existing search backend already supports offset-based result retrieval (or can be extended to do so) for pagination.
- The 500-match limit per page is an appropriate page size; users do not need to customize it.
- The wrap lines preference does not need to persist across application restarts (session-level persistence is sufficient).
- The keyboard shortcuts Shift+Up and Shift+Down do not conflict with existing application shortcuts.
- Tooltips follow the application's existing tooltip pattern (if any) or use native browser title attributes as a baseline.
