# Feature Specification: Redesigned Search Results UX

**Feature Branch**: `004-redesign-search-results-ux`
**Created**: 2026-06-13
**Status**: Draft
**Input**: User description: "I want to change the ux of the searching feature in the desktop app. The search result section, which appears right bellow the search bar after the search is made, should display only the search matches. Each line should be clickable, and clicking it should move the main section to the location of the clicked line. This section should be cloaseable. When the search result section is open, the main section should display the search matches with a gray background (like is currently done on the search result section). When the search result section is open, there should be up and down arrows to allow navigating through the search matches in the main section. The history section, which currently shows the previous searches, should be removed. The last 5 searches should be shown as autocomplete options in the search text field. A history icon (clock) should be added on the right of the search text field. When clicked, it should show an overlayed scrollable list of all searches made in that workspace. The search history should be persisted in a per workspace basis, and should resist app restarts."

## Clarifications

### Session 2026-06-13

- Q: When the same search (same query text, search type, and time range) is executed multiple times, should it appear once or as repeated entries in the "5 most recent" suggestions and history overlay? → A: Deduplicate - re-running an identical search updates that entry's timestamp/position (moves it to the top) instead of creating a new row
- Q: Existing search history is currently stored per-file (with no dedup). When this feature ships and history becomes workspace-scoped, what should happen to that existing per-file history data? → A: Migrate existing per-file history entries into their workspace's history, applying the new deduplication rule, so users retain their accumulated search history across the transition
- Q: Where should the previous/next match navigation controls (up/down arrows, FR-006) be located in the UI? → A: In the search bar / results panel header area, similar to a browser's find-in-page bar, near the close control and match count
- Q: Should the "5 most recent searches" autocomplete suggestions (FR-010) be filtered as the user types, or always show the same top-5 list? → A: Filter across all history - as the user types, suggestions are drawn from the full workspace history (not just the 5 most recent), filtered to matches, showing up to 5 results ordered most-recent-first

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Jump to a match from the results list (Priority: P1)

A user searches the active log file and gets back a results list showing only the lines that matched (no surrounding context lines). The user clicks one of the result lines and the main log view scrolls to and reveals that exact line.

**Why this priority**: This is the core value of search - getting from "I found something interesting" to "I'm looking at it in context" with a single click. Without this, the rest of the redesign has no purpose.

**Independent Test**: Run a search that returns multiple matches, click any result entry, and verify the main log view scrolls so that line is visible. Can be tested independently of history/autocomplete changes.

**Acceptance Scenarios**:

1. **Given** a search has been executed and returned one or more matches, **When** the results panel is shown, **Then** it lists only the matching lines (their line numbers/content), without the surrounding "before"/"after" context lines.
2. **Given** the results panel is showing matches, **When** the user clicks a result entry, **Then** the main log view scrolls so the corresponding line is visible.

---

### User Story 2 - Browse all matches highlighted in the main view (Priority: P2)

While the results panel is open, the user wants to see where all the matches are within the full context of the log, and step through them one by one using up/down arrows, without having to keep clicking individual entries in the results list.

**Why this priority**: Builds directly on Story 1 by letting users review matches in their natural surrounding context and move between them quickly, which is the main efficiency win of the redesign.

**Independent Test**: With the results panel open, verify every matching line in the main log view is shown with a gray background, and that the up/down arrow controls move the view to the previous/next match in sequence.

**Acceptance Scenarios**:

1. **Given** the results panel is open, **When** the main log view is displayed, **Then** every line that matches the current search is shown with a gray background (the same shade currently used to highlight matches in the results panel).
2. **Given** the results panel is open and the main view is showing a match, **When** the user activates the "next match" (down) control, **Then** the main view scrolls to the next match below the current one.
3. **Given** the results panel is open and the main view is showing a match, **When** the user activates the "previous match" (up) control, **Then** the main view scrolls to the previous match above the current one.

---

### User Story 3 - Close the results panel (Priority: P2)

After reviewing matches, the user closes the results panel to get back to a normal, uncluttered view of the log, while keeping their search query in the search field.

**Why this priority**: Without a way to dismiss the panel and its associated highlighting/navigation controls, the new always-visible match highlighting would permanently clutter the main view.

**Independent Test**: With a search active and the results panel open, click the close control and verify the panel disappears, the gray match highlighting is removed from the main view, and the up/down navigation controls disappear.

**Acceptance Scenarios**:

1. **Given** the results panel is open, **When** the user activates its close control, **Then** the results panel is hidden, the gray match highlighting is removed from the main log view, and the up/down navigation controls are no longer shown.
2. **Given** the results panel has been closed, **When** the user inspects the search field, **Then** the previously entered search query is still present.

---

### User Story 4 - Reuse recent and past searches (Priority: P3)

Instead of a permanently visible history list, the user gets quick access to their 5 most recent searches as suggestions while typing, plus a clock icon that opens a scrollable overlay listing every search made in the current workspace. This history is saved per workspace and is still available after restarting the app.

**Why this priority**: This is a quality-of-life improvement for repeat searches. It's valuable but independent of the core results/navigation redesign in Stories 1-3.

**Independent Test**: Perform several searches, reload/restart the app, then verify the 5 most recent searches appear as suggestions in the search field and that the clock icon opens an overlay listing all past searches for that workspace.

**Acceptance Scenarios**:

1. **Given** a "History" section previously appeared below the search results, **When** this feature ships, **Then** that standalone history section is no longer shown.
2. **Given** the user has performed one or more searches in the current workspace, **When** the user focuses the empty search field, **Then** up to 5 of the most recent searches for this workspace are offered as autocomplete suggestions; **When** the user types into the field, **Then** the suggestions update to show up to 5 entries from the full workspace history whose query text matches the typed text, most-recent-first.
3. **Given** the search field is shown, **Then** a clock/history icon is displayed to the right of the field.
4. **Given** the user clicks the clock/history icon, **When** the overlay opens, **Then** it shows a scrollable list of every search previously executed in the current workspace, most recent first.
5. **Given** the user has performed searches and then restarts the application, **When** the user reopens the same workspace, **Then** the same search history (suggestions and overlay list) is still available.

---

### Edge Cases

- What happens when a search returns no matches? The results panel should reflect "no matches" rather than an empty list, and the gray highlighting/navigation arrows in the main view should not appear.
- What happens when the number of matches exceeds the existing results limit? The existing "showing first N matches" truncation notice continues to apply to both the results list and the gray highlighting/navigation in the main view.
- What happens if the user switches to a different open file while the results panel is open? The results panel, gray highlighting, and navigation controls are tied to the file they were created for: they hide when the user switches to a different file, and reappear (showing that file's own last results, if any) when the user switches back to the original file.
- What happens when the user reaches the last match and activates "next", or the first match and activates "previous"? Navigation wraps around: "next" from the last match goes to the first match, and "previous" from the first match goes to the last match.
- What happens when the user selects a suggestion from the autocomplete list or an entry from the history overlay? The search field (and any associated search type/time range) is populated with that entry's settings and the search is immediately re-executed, matching today's history-click behavior.
- What happens when the workspace has no search history yet? The autocomplete suggestion list and the history overlay should indicate there is nothing to show yet, rather than appearing empty/broken.
- What happens to highlight-related controls (the star/highlight toggle) on lines that are also search matches? Both the existing highlight styling and the new gray search-match styling should remain visually distinguishable from one another.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The results panel that appears after a search MUST list only the matching lines (no surrounding "before"/"after" context lines), identified by their line position in the file.
- **FR-002**: Each entry in the results panel MUST be clickable.
- **FR-003**: Clicking a results panel entry MUST cause the main log view to scroll to and reveal the corresponding line.
- **FR-004**: The results panel MUST provide a control that closes (hides) it.
- **FR-005**: While the results panel is open, the main log view MUST visually mark every line that matches the current search using a gray background, consistent with the shade currently used to mark matches within the results panel.
- **FR-006**: While the results panel is open, the system MUST provide "previous match" and "next match" controls, located in the search bar / results panel header area (alongside the close control and match count, similar to a browser's find-in-page bar), that move the main log view to the previous/next matching line, in line-number order.
- **FR-007**: Closing the results panel MUST remove the gray match highlighting from the main log view and remove the previous/next match controls.
- **FR-008**: Closing the results panel MUST NOT clear the current search query from the search field.
- **FR-009**: The standalone "History" section that previously listed previous searches below the search results MUST be removed from the search area.
- **FR-010**: The search field MUST offer autocomplete suggestions drawn from the workspace's full search history, filtered to entries whose query text matches the current input (or, when the field is empty, the most recent entries), showing up to 5 results ordered most-recent-first. History entries are deduplicated by query text, search type, and time range (see Search History Entry).
- **FR-011**: The search field MUST display a history (clock) icon to its right.
- **FR-012**: Activating the history icon MUST open an overlay containing a scrollable list of every distinct search previously executed in the current workspace, ordered most-recent-first (per the Search History Entry deduplication rule, re-running an identical search updates its position to most-recent rather than adding a separate entry).
- **FR-013**: Search history (used for both the autocomplete suggestions and the history overlay) MUST be scoped per workspace - i.e., it reflects searches made across the files of that workspace, not just the currently active file.
- **FR-014**: Search history MUST be persisted such that it remains available after the application is closed and reopened.
- **FR-015**: Each stored search history entry MUST retain enough information to be re-run later (query text, search type, and optional time range), consistent with what is recorded today.
- **FR-016**: The results panel, gray match highlighting, and previous/next navigation controls MUST be associated with the file they were produced for: switching to a different open file MUST hide them, and switching back to the original file MUST restore them along with that file's results.
- **FR-017**: The previous/next match navigation MUST wrap around - activating "next" while on the last match MUST move to the first match, and activating "previous" while on the first match MUST move to the last match.
- **FR-018**: Selecting an autocomplete suggestion or a history overlay entry MUST populate the search field (and associated search type/time range) with that entry's settings and immediately execute the search.
- **FR-019**: Pre-existing per-file search history recorded before this feature ships MUST be migrated into the corresponding workspace's history (applying the deduplication rule from FR-010) so users retain their previously accumulated search history.

### Key Entities

- **Search Match**: A single line in a log file that satisfied the active search criteria. Has a line position/number and content; rendered in the results panel and, while the panel is open, highlighted with a gray background in the main log view.
- **Search Results Set**: The ordered collection of Search Matches produced by one search execution, plus whether the set was truncated. Drives the results panel contents, the gray highlighting in the main view, and the previous/next navigation order.
- **Search History Entry**: A record of a previously executed search (query text, search type, optional time range, and when it was last run), scoped to a workspace. Unique per combination of query text, search type, and time range; re-running an identical search updates the existing entry's "last run" time (and its resulting order) rather than creating a new entry. Used to populate autocomplete suggestions (5 most recent) and the full history overlay.
- **Workspace**: The container that groups one or more open log files and their associated saved data, including the search history shared across those files.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a results list with multiple matches, a user can land on any specific match's location in the main log view with a single click, 100% of the time.
- **SC-002**: With the results panel open, a user can move through every match in the log using only the previous/next controls, without needing to return to or re-click the results list.
- **SC-003**: A user can identify all matching lines in their surrounding context at a glance, via consistent gray highlighting, without re-running the search or scrolling through a separate list.
- **SC-004**: A user can re-select any matching past search for the current workspace directly from the search field's autocomplete suggestions, without retyping the full query.
- **SC-005**: A user can browse the complete search history for a workspace (not just the last 5) via the history overlay.
- **SC-006**: After restarting the application and reopening a workspace, 100% of previously recorded search history for that workspace (used for suggestions and the overlay) is still available.

## Assumptions

- The "gray background" referenced by the user corresponds to the existing match-highlight styling already used in the results panel; the redesign reuses that same visual treatment for matches in the main log view.
- The existing limit/truncation behavior for very large result sets (currently shown as "Showing the first N matches") is retained and applies equally to the results list and to the gray highlighting/navigation in the main view.
- "All searches made in that workspace" means search history is no longer scoped to an individual file, but to the workspace as a whole, even though searches are executed against a specific file. This is a change from the current per-file history scope.
- The history overlay is a read-only, scrollable list for browsing and reusing past searches; bulk-clearing or deleting individual history entries is out of scope for this feature unless called out as a future enhancement.
- The existing per-line highlight ("star") feature and its styling remain unchanged and must remain visually distinct from the new gray search-match styling.
