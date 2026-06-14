# Feature Specification: Selectable Log Lines

**Feature Branch**: `006-log-line-selection`
**Created**: 2026-06-14
**Status**: Draft
**Input**: User description: "I want logs lines to be clickable, and clicking a line should select it. Only one line can be selected at a time. The selected line should have a blue border. The user should still be able to easily selecting text by clicking and dragging. If no text is selected and the user presses CTRL + C, the selected line should be copied. Otherwise, the selected text should be copied. Therefore: single click: select line. Click, hold and move: select text (can be multiline). The selected line should be shown both on the main section and on the search result section (if present). When navigating through the search results using the arrows, each match should become the selected line when it is navigated upon. The user should also be able to use the keyboard up and down arrow keys to change the selected line. In these cases, both the main and search result sections should follow the selected line (if the selected line isn't a search match, the search result section shouldn't move)."

## Clarifications

### Session 2026-06-14

- Q: Does line selection (click-to-select, blue border) apply in the "Highlighted only" filtered view (the flat list of starred lines), or only in the normal log view? → A: It applies the same way in both - it's the same per-file selection state, kept in sync with the search panel per the existing rules.
- Q: Each line has a star (☆/★) highlight-toggle button at its start - does clicking that button also select the line, or only toggle the highlight? → A: Clicking the star button only toggles the highlight and does not change the selected line; selection is triggered by clicking elsewhere on the row.
- Q: FR-008 says the active match's entry in the search results panel must be indicated as selected "consistent with" the main view's blue-border indicator - should the panel entry use that same blue-border treatment, or a distinct background tint? → A: The same blue-border treatment as the main log view's selected-line indicator.
- Q: Do arrow-key selection navigation and Ctrl+C line-copy require the user to first click into the log view to give it focus, or are they active by default whenever focus isn't in a text input? → A: Active by default whenever the file is open and focus isn't in a text input - no extra click/focus step on the log view itself.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Select a log line by clicking it (Priority: P1)

As a user reviewing a log file, I want to click on a line to mark it as "selected" with a clear blue border, so that I can keep track of a specific line of interest while reading through the surrounding context, without losing the ability to select and copy arbitrary text by clicking and dragging.

**Why this priority**: This is the foundational interaction the rest of the feature depends on. The visual selection indicator and the click-vs-drag distinction must exist before selection can be copied, synced with search results, or driven by the keyboard.

**Independent Test**: Open a log file, click on a line, and verify it shows a blue border. Click a different line and verify the border moves there and disappears from the first line. Click and drag across text within or across lines and verify the dragged text becomes highlighted (selected) per normal text-selection behavior, without changing which line shows the blue border.

**Acceptance Scenarios**:

1. **Given** a log file is open in the main view, **When** the user clicks (presses and releases without moving the pointer) on a line, **Then** that line displays a blue border indicating it is selected.
2. **Given** a line is currently selected, **When** the user clicks on a different line, **Then** the blue border moves to the newly clicked line and no longer appears on the previous line.
3. **Given** a line is currently selected, **When** the user clicks the same line again, **Then** the line remains selected (selection is not toggled off).
4. **Given** the main view is displayed, **When** the user presses the mouse button down on a line, moves the pointer across part of that line or onto other lines, and releases, **Then** the dragged-over text becomes highlighted as a normal text selection, and the currently selected line (if any) does not change.

---

### User Story 2 - Copy the selected line's content with Ctrl+C (Priority: P1)

As a user, I want to press Ctrl+C (or Cmd+C) to copy the full text of the line I have selected, so I can paste it elsewhere (e.g., a search engine, a ticket, or a chat message) without first having to manually highlight that text.

**Why this priority**: This is the primary payoff of having a "selected line" at all - a fast way to grab a whole line's content without precise text-dragging.

**Independent Test**: Click a line to select it (without dragging any text), press Ctrl+C, paste into another field, and verify the pasted content matches that line's full text exactly. Then click-drag to highlight a different piece of text, press Ctrl+C, and verify the highlighted text is copied instead.

**Acceptance Scenarios**:

1. **Given** a line is selected and no text on the page is highlighted, **When** the user presses Ctrl+C (or Cmd+C), **Then** the full content of the selected line is copied to the clipboard.
2. **Given** a line is selected and the user has also click-dragged to highlight a span of text, **When** the user presses Ctrl+C, **Then** the highlighted text span is copied to the clipboard instead of the selected line's content.
3. **Given** no line is selected and no text is highlighted, **When** the user presses Ctrl+C, **Then** no clipboard action occurs.

---

### User Story 3 - Selected line stays in sync with the search results panel (Priority: P2)

As a user navigating search matches, I want the currently active match to be indicated as selected in both the main log view and the search results panel, and I want stepping through matches with the previous/next controls to update that selection, so I always know exactly which line I'm looking at in both places.

**Why this priority**: This ties the new selection indicator together with the search results panel introduced previously, making match navigation visually unambiguous. It depends on User Story 1's selection mechanism but is not required for the core select/copy value.

**Independent Test**: Run a search that returns several matches and open the results panel. Use the next/previous match controls and verify that each step shows the same line with a blue border in the main view and as selected in the results panel. Click a line in the main view that is also a search match and verify the corresponding results-panel entry becomes indicated as selected. Click a line that is not a match and verify no results-panel entry shows a selection indicator.

**Acceptance Scenarios**:

1. **Given** the search results panel is open and showing matches, **When** the user activates the "next match" or "previous match" control, **Then** the corresponding line becomes the selected line, shown with a blue border in the main view and indicated as selected in the results panel.
2. **Given** the search results panel is open, **When** the user clicks a line in the main view that is also listed in the results panel, **Then** that line's entry in the results panel is also indicated as selected.
3. **Given** the search results panel is open, **When** the user clicks a line in the main view that is not one of the listed matches, **Then** no entry in the results panel is indicated as selected.

---

### User Story 4 - Move the selected line with the keyboard (Priority: P3)

As a user, I want to move my line selection up and down with the keyboard arrow keys, so I can step through the log without reaching for the mouse, with the main view (and the search results panel, when relevant) following the selection.

**Why this priority**: A convenience/efficiency enhancement on top of the core selection and search-sync behaviors. Valuable, but not essential to the primary "select & copy" and "search sync" value delivered by User Stories 1-3.

**Independent Test**: Select a line, press the Down arrow key repeatedly, and verify the selection (and blue border) moves to each following line, with the main view scrolling as needed. With the search results panel open, verify it scrolls to follow only when the newly selected line is one of the listed matches, and stays put otherwise. Press Up arrow while the first line is selected and Down arrow while the last line is selected, and verify the selection does not move past the file's bounds.

**Acceptance Scenarios**:

1. **Given** a line is selected, **When** the user presses the Down arrow key, **Then** the line immediately below becomes selected, and the main view scrolls if needed to keep it visible.
2. **Given** a line is selected, **When** the user presses the Up arrow key, **Then** the line immediately above becomes selected, and the main view scrolls if needed to keep it visible.
3. **Given** the search results panel is open and the newly selected line (from arrow-key navigation) is one of the listed matches, **When** the selection changes, **Then** the results panel scrolls to reveal that entry and indicates it as selected.
4. **Given** the search results panel is open and the newly selected line (from arrow-key navigation) is NOT one of the listed matches, **When** the selection changes, **Then** the results panel's scroll position and selection indicator remain unchanged.
5. **Given** the first line of the file is selected, **When** the user presses the Up arrow key, **Then** the selection does not change; **Given** the last line of the file is selected, **When** the user presses the Down arrow key, **Then** the selection does not change.

---

### Edge Cases

- A click-and-drag that selects text spanning multiple lines does not change which line (if any) is currently selected; Ctrl+C copies the dragged text, not the selected line.
- Pressing Ctrl+C when neither a line is selected nor any text is highlighted has no effect (nothing is copied, no error shown).
- If the search results panel is open but the currently selected line is not among its matches, the panel shows no selection indicator and its scroll position does not change in response to selection changes.
- Arrow-key selection navigation does not occur while keyboard focus is in a text input (e.g., the search field), so normal text-cursor movement in those fields is unaffected.
- If no line is currently selected when the user presses an arrow key, the first currently visible line becomes selected (as if it were clicked), and subsequent presses move from there.
- Up/Down arrow-key navigation stops at the first and last line of the file; it does not wrap around (this is independent from the search match "previous/next" controls, which wrap as previously specified).
- Running a new search, or switching the search results panel open/closed, does not clear the currently selected line; if the selected line becomes (or stops being) a search match as a result, the results-panel indicator updates accordingly.
- The selected-line indicator (blue border) remains visible and distinguishable when the same line also has the existing per-line highlight ("star") styling and/or the gray search-match background.
- Switching between open files preserves each file's own selected line independently; switching back to a file restores its previously selected line indicator (if any).
- If the selected line scrolls out of view due to manual scrolling (not a selection change), the selection state is retained even though the blue border is not currently visible.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow the user to select exactly one log line in the main log view by clicking it (pressing and releasing the pointer without moving it).
- **FR-002**: When a line is selected, the system MUST display a blue border around that line in the main log view.
- **FR-003**: Selecting a new line MUST remove the selection indicator from the previously selected line, so that at most one line is selected at a time.
- **FR-004**: The system MUST allow the user to highlight a span of text (within a single line or across multiple lines) by clicking and dragging, without altering the currently selected line.
- **FR-005**: When the user invokes the copy command (Ctrl+C / Cmd+C) while a text span is highlighted, the system MUST copy that highlighted text to the clipboard.
- **FR-006**: When the user invokes the copy command while no text span is highlighted but a line is selected, the system MUST copy the full content of the selected line to the clipboard.
- **FR-007**: When the user invokes the copy command while there is neither a highlighted text span nor a selected line, the system MUST take no clipboard action.
- **FR-008**: While the search results panel is open and the currently selected line is one of the listed matches, the system MUST indicate that match entry in the search results panel as selected using the same blue-border treatment as the main log view's selected-line indicator.
- **FR-009**: While the search results panel is open and the currently selected line is not one of the listed matches, the system MUST NOT show any entry in the search results panel as selected.
- **FR-010**: When the user activates the "previous match" or "next match" control in the search results panel, the system MUST set the resulting current match's line as the selected line, updating the indicator in both the main log view and the search results panel.
- **FR-011**: The system MUST allow the user to move the selected line to the immediately preceding or following line using the Up and Down arrow keys, respectively, except when keyboard focus is in a text input.
- **FR-012**: When the selected line changes (via click, arrow-key navigation, or search-match navigation), the main log view MUST scroll as needed so the selected line remains visible.
- **FR-013**: When the selected line changes via Up/Down arrow-key navigation, the search results panel (if open) MUST scroll to reveal the new selected line only if that line is one of the current search matches; otherwise the panel's scroll position MUST remain unchanged.
- **FR-014**: Up/Down arrow-key navigation of the selected line MUST stop at the first and last line of the file (no wraparound).
- **FR-015**: The selected-line indicator MUST remain visually distinguishable from the existing per-line highlight ("star") styling and the search-match background when any combination of these apply to the same line.
- **FR-016**: The system MUST maintain selection state (the currently selected line, if any) independently for each open file, so switching between files preserves each file's own selection.
- **FR-017**: The selected-line indicator (blue border) and click-to-select behavior MUST also apply when the "Highlighted only" filtered view is active, using the same per-file selection state as the normal log view (FR-008/FR-009 results-panel sync rules continue to apply).
- **FR-018**: Clicking a line's highlight-toggle ("star") control MUST only toggle that line's highlight and MUST NOT change the selected line; clicking is the line's selection trigger only when it occurs outside that control.
- **FR-019**: Arrow-key selection navigation (FR-011) and Ctrl+C line-copy (FR-006) MUST be active by default whenever a file is open, without requiring the user to first click into the log view to focus it, except when keyboard focus is in a text input (e.g., the search field).

### Key Entities

- **Selected Line**: The single log line currently marked as selected for a given open file, identified by its line number. Drives the blue-border indicator in the main log view and the corresponding selection indicator in the search results panel. At most one per open file at any time.
- **Log Line**: An existing line of text within a log file, now interactive - clickable to become the Selected Line, and individually or jointly text-selectable via click-and-drag.
- **Search Match**: A line that satisfies the active search criteria (as defined in the existing search results feature). A Search Match can simultaneously be the Selected Line, in which case both the main view and results panel show the selection indicator on it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can select any visible log line with a single click, with the blue-border indicator appearing immediately.
- **SC-002**: Users can copy the full text of any line to the clipboard in just two actions (click the line, press Ctrl+C), without manually selecting text, 100% of the time when no other text is highlighted.
- **SC-003**: Users can select and copy arbitrary multi-line text spans via click-and-drag with no change to that existing behavior, even when a line is selected.
- **SC-004**: While stepping through search matches with the previous/next controls, users can identify the active match at a glance in both the main view and the results list, with both views always indicating the same line.
- **SC-005**: Users can move the selection up or down one line at a time using the keyboard, with the main view (and, when applicable, the results panel) always keeping the selected line visible without additional manual scrolling.

## Assumptions

- A "click" is distinguished from a "click-and-drag" using the standard convention that pressing and releasing the pointer without significant movement is a click; any meaningful pointer movement between press and release is treated as a drag for text selection.
- Selection state is transient view state (not persisted to disk or workspace files across application restarts), consistent with other transient view state such as scroll position.
- The blue selected-line border is layered on top of the existing line styling and remains visually distinct from the existing highlight ("star") background and the gray search-match background.
- Arrow-key selection navigation is only active when keyboard focus is not inside a text input (e.g., the search field), so it never interferes with normal text editing/cursor movement.
