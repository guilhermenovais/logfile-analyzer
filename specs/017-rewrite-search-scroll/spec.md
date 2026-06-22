# Feature Specification: Rewrite Search-to-Scroll Navigation

**Feature Branch**: `017-rewrite-search-scroll`  
**Created**: 2026-06-22  
**Status**: Draft  
**Input**: User description: "Completely rewrite the search result click-to-scroll feature that fails when the target line is far from the current viewport position."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Click Search Result Scrolls to Correct Line (Priority: P1)

A user searches for a term and sees matching results in the search results panel. They click any result — whether it is near the current viewport, far above it, or far below it — and the main log viewer reliably scrolls to display that exact line, visually centered in the viewport.

**Why this priority**: This is the core broken feature. The entire purpose of the search-to-scroll navigation is to let users jump directly to matching lines. If clicking a result does not reliably land on the correct line, the feature has no value.

**Independent Test**: Can be fully tested by performing a search, clicking on results at varying distances from the current viewport position (near, moderately far, and at the extreme ends of a large file), and verifying the target line is visible and centered each time.

**Acceptance Scenarios**:

1. **Given** a file with 100,000+ lines is loaded and the user has searched for a term with matches spread throughout, **When** the user clicks a search result whose line is more than 10,000 lines away from the current viewport, **Then** the main log viewer scrolls to display that exact line number, centered vertically in the viewport.
2. **Given** the user is viewing the end of a large file, **When** they click a search result near the beginning of the file, **Then** the main viewer scrolls to that line within 500 milliseconds and the line is visible and centered.
3. **Given** the user clicks the same search result twice in a row, **When** they have scrolled away from it between clicks, **Then** the viewer re-scrolls to that line each time.

---

### User Story 2 - Navigation Arrows Scroll Correctly (Priority: P2)

A user uses the up/down navigation arrows in the search results panel to cycle through matches. Each press advances to the next (or previous) match and the main log viewer scrolls to display the newly selected match line, regardless of the distance between consecutive matches.

**Why this priority**: Arrow navigation is the second most common way to traverse search results. If click-to-scroll works but arrow navigation does not, users lose the ability to sequentially review matches.

**Independent Test**: Can be fully tested by performing a search with multiple results, then pressing the next/previous arrows repeatedly and verifying each navigation scrolls the viewer to the correct line.

**Acceptance Scenarios**:

1. **Given** a search has produced results across the entire file, **When** the user clicks the "next match" arrow repeatedly, **Then** the main viewer scrolls to each successive match line, including when consecutive matches are thousands of lines apart.
2. **Given** the user is on the last match, **When** they click "next match", **Then** the viewer wraps to the first match and scrolls there.
3. **Given** the user is on the first match, **When** they click "previous match", **Then** the viewer wraps to the last match and scrolls there.

---

### User Story 3 - Scroll Works with Filtered Views (Priority: P3)

A user has an active time-range filter applied, which reduces the visible line set. When they click a search result, the viewer scrolls to the correct position within the filtered view, accounting for the fact that visible row positions differ from original file line numbers.

**Why this priority**: Time-range filtering changes the mapping between file line numbers and visible row positions. If the scroll mechanism does not account for this mapping, users will land on the wrong line or see no scroll at all.

**Independent Test**: Can be fully tested by applying a time-range filter, performing a search, clicking results, and verifying the correct filtered-view line is displayed.

**Acceptance Scenarios**:

1. **Given** a time-range filter is active and reduces the file from 50,000 lines to 5,000 visible lines, **When** the user clicks a search result, **Then** the viewer scrolls to the correct position within the filtered view and the line content matches the search result.
2. **Given** the user changes the time-range filter after searching, **When** they click a previously found result that is still within the new range, **Then** the viewer scrolls to the correct updated position.

---

### User Story 4 - Scroll Works with Line Wrapping Enabled (Priority: P3)

A user has line wrapping enabled, which causes some lines to occupy more vertical space than others. When they click a search result, the viewer scrolls to the correct line even though row heights vary.

**Why this priority**: Variable row heights are a known cause of scroll position miscalculation. The rewritten mechanism must handle this correctly.

**Independent Test**: Can be fully tested by enabling line wrapping on a file with long lines, searching, and clicking results to verify accurate scrolling.

**Acceptance Scenarios**:

1. **Given** line wrapping is enabled and the file contains lines of varying lengths (some wrapping to 3-4 visual rows), **When** the user clicks a search result 5,000+ lines away, **Then** the viewer scrolls to the correct line, not an offset caused by accumulated height estimation errors.

---

### Edge Cases

- What happens when the search result references a line at the very first or very last position in the file?
- How does the system behave when a search result is clicked while data for that region is still loading?
- What happens when the user rapidly clicks multiple different search results in quick succession?
- How does the system handle a search result click when the file has only a handful of lines (all fitting in the viewport)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST scroll the main log viewer to display the correct line when a user clicks any search result, regardless of the distance between the current viewport position and the target line.
- **FR-002**: The target line MUST be positioned at or near the vertical center of the viewport after scrolling.
- **FR-003**: The system MUST correctly scroll to the target line even when a time-range filter is active and the visible row positions differ from file line numbers.
- **FR-004**: The system MUST correctly scroll to the target line when line wrapping is enabled and rows have variable heights.
- **FR-005**: The system MUST support repeated scrolling to the same line (clicking the same result again after scrolling away must re-scroll).
- **FR-006**: The navigation arrows (next/previous match) MUST trigger the same reliable scrolling behavior as clicking a result directly.
- **FR-007**: The system MUST handle rapid successive clicks on different search results, with the final click's target being the displayed result.
- **FR-008**: The previous scroll-to-line implementation MUST be fully replaced — no incremental patches on the existing mechanism.
- **FR-009**: The rewritten mechanism MUST not break existing features: line selection highlighting, search match background highlighting, keyboard arrow-key navigation between matches.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Clicking any search result scrolls the viewer to the correct line 100% of the time, regardless of distance, in files up to 500,000 lines.
- **SC-002**: The target line is visually centered (within one viewport-height margin) after the scroll completes, within 500 milliseconds of the click.
- **SC-003**: Scroll-to-line works correctly with all combinations of: time-range filter on/off, line wrapping on/off.
- **SC-004**: All existing search-related features (match highlighting, line selection, arrow navigation, search history) continue to function correctly after the rewrite.
- **SC-005**: Users can navigate 20+ search results in sequence (via arrows or clicks) without any scroll failures or visible positioning errors.

## Assumptions

- The rewrite is scoped to the scroll-to-line navigation mechanism only; the search execution, result display, and result panel UI are not being changed.
- The existing state management for search (query, results, match index, scroll nonce) may be modified as needed to support the new scrolling strategy, but the external interface to other components should remain compatible.
- The problem is rooted in the current approach to programmatic scrolling within a virtualized list and needs a fundamentally different strategy, not incremental fixes to the existing one.
- Performance should remain acceptable for files up to 500,000 lines — the rewrite must not introduce noticeable lag or jank during navigation.
- The rewrite may change internal data flow and component responsibilities but must preserve the user-facing behavior described in the acceptance scenarios.
