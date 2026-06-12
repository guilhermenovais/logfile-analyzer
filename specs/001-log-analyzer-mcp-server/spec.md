# Feature Specification: Log Analyzer Desktop App with MCP Server

**Feature Branch**: `001-log-analyzer-mcp-server`
**Created**: 2026-06-12
**Status**: Draft
**Input**: User description: "I want to develop a desktop application to analyze log files, with it's main functionality being the MCP server opened by the desktop app. I want the following features in it: Workspace concept with log files, aliases, persistence of file paths/highlighted lines/search history, unsaved-workspace recovery and save prompts, automatic timestamp detection, line highlighting and labeling, line wrap toggle, search with logical operators and regex, and an MCP server exposing file listing, file properties, search with context, and get-line-by-index. Non-functional: performant loading and search for files larger than 5GB."

## Clarifications

### Session 2026-06-12

- Q: How should an AI agent connect to the MCP server exposed by the desktop app? → A: Local network transport (HTTP/SSE on localhost) — the always-running desktop app exposes a local port that agent clients connect to
- Q: When a newly added log file's alias (default or user-specified) collides with an existing alias in the workspace, what should happen? → A: Reject — the add operation fails with a validation error; the user/agent must supply a different alias
- Q: When a user or MCP agent attempts to add a log file whose path already exists in the workspace, what should happen? → A: Reject — the add operation fails with a clear "file already in workspace" error
- Q: What concrete default/maximum values should apply to the MCP `surrounding_count` parameter for "search with context"? → A: Default 5, maximum 200
- Q: When a user saves a workspace and the chosen workspace alias collides with an existing saved workspace's alias, what should happen? → A: Reject — the save fails with a clear "alias already in use" error; the user must choose a different alias

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View and Navigate Large Log Files (Priority: P1)

A user opens the desktop app, creates a workspace, and adds one or more log files from disk (each given an alias, defaulting to the file name without its extension). The user can immediately start viewing log lines, scroll through the file, and toggle line wrap, even while a multi-gigabyte file is still being fully loaded in the background.

**Why this priority**: This is the foundational capability of the product. Without fast, responsive viewing of log content, no other feature (search, highlighting, MCP access) has anything to operate on.

**Independent Test**: Create a new workspace, add a 5GB log file, and verify that log lines begin appearing on screen within a couple of seconds, the host system remains responsive, and the user can scroll through and toggle line wrap on/off.

**Acceptance Scenarios**:

1. **Given** an empty workspace, **When** the user adds a log file from disk without specifying an alias, **Then** the file is added to the workspace using its file name (without extension) as the alias.
2. **Given** an empty workspace, **When** the user adds a log file and specifies a custom alias, **Then** the file is added to the workspace under that alias.
3. **Given** a workspace with a large (multi-gigabyte) log file being added, **When** the file starts loading, **Then** the user sees the first portion of log lines rendered before the entire file has finished loading.
4. **Given** a file open in the viewer, **When** the user toggles line wrap on, **Then** long lines wrap within the viewport; **When** toggled off (the default), long lines extend horizontally with scrolling.

---

### User Story 2 - AI Agent Queries Workspace via MCP Server (Priority: P1)

An AI agent connects to the MCP server exposed by the running desktop app and uses it to discover what log files are available in the workspace, inspect file properties, fetch specific lines, and run searches with surrounding context — all without the user manually copying log content.

**Why this priority**: The MCP server is described as the application's main functionality. Delivering core read/query capability to an AI agent provides immediate standalone value, independent of UI polish.

**Independent Test**: With a workspace containing at least one loaded log file, connect an MCP client and call the "list files," "get file properties," "get line by index," and "search with context" tools, verifying each returns correct data for the loaded file.

**Acceptance Scenarios**:

1. **Given** a workspace with multiple log files added, **When** an MCP client requests the list of files, **Then** it receives the alias of every file currently in the workspace.
2. **Given** a log file in the workspace, **When** an MCP client requests its properties, **Then** it receives the total line count and whether a timestamp format was detected/loaded for that file.
3. **Given** a log file with at least N lines, **When** an MCP client requests line N by index, **Then** it receives the exact content of that line.
4. **Given** a log file and a search query plus a `surrounding_count`, **When** an MCP client performs a search with context, **Then** it receives each matching line together with up to `surrounding_count` lines immediately before and after it.

---

### User Story 3 - Search with Logical Operators and Regular Expressions (Priority: P2)

A user (or an AI agent via the MCP server) searches a log file's content using combinations of quoted terms with logical operators (AND, OR, NOT/`!`) or a regular expression, and receives matching lines quickly even on very large files.

**Why this priority**: Search is the primary way users and agents extract meaning from large log files; it builds directly on the viewing capability from Story 1.

**Independent Test**: In a workspace with a large log file loaded, run a search such as `"abc" AND "def" OR !"ghi"` and a separate regex search, and verify both return the correct matching lines within a reasonable time without freezing the UI.

**Acceptance Scenarios**:

1. **Given** a loaded log file, **When** the user searches for `"abc" AND "def"`, **Then** only lines containing both terms are returned.
2. **Given** a loaded log file, **When** the user searches for `"abc" OR "def"`, **Then** lines containing either term are returned.
3. **Given** a loaded log file, **When** the user searches for `!"ghi"`, **Then** lines NOT containing "ghi" are returned.
4. **Given** a loaded log file, **When** the user enters a valid regular expression, **Then** lines matching the pattern are returned.
5. **Given** a search is performed, **When** it completes, **Then** the query is recorded in the workspace's search history.

---

### User Story 4 - Highlight and Label Lines (Priority: P2)

A user, or an AI agent via the MCP server, marks specific lines as highlighted and optionally attaches a text label to them. The user can filter the log view to show only highlighted lines, and an agent can retrieve the set of highlighted lines and their labels.

**Why this priority**: Highlighting turns raw search results into durable findings that can be reviewed, filtered, and shared between the user and an agent — a key analysis workflow once search (Story 3) exists.

**Independent Test**: Highlight a handful of lines (some with labels, some without) in a loaded file, enable the "highlighted only" view filter and confirm only those lines appear, then query highlighted lines via the MCP server and confirm the same lines and labels are returned.

**Acceptance Scenarios**:

1. **Given** a loaded log file, **When** the user highlights a line and adds a label, **Then** the line is marked as highlighted and stores that label.
2. **Given** a loaded log file, **When** an MCP agent highlights a line (with or without a label), **Then** the highlight is reflected in the workspace and visible to the user.
3. **Given** a file with some highlighted lines, **When** the user enables the "highlighted only" filter, **Then** only highlighted lines are shown, preserving their labels.
4. **Given** a file with highlighted lines, **When** an MCP agent queries highlighted lines, **Then** it receives each highlighted line's index, content, and label (if any).

---

### User Story 5 - Automatic Timestamp Detection and Time-Range Search (Priority: P3)

When a log file is added to a workspace, the system samples its first lines to detect a common timestamp format. If a format is confidently detected, timestamps are parsed for the file, enabling the user and MCP agents to search or filter lines by a time range.

**Why this priority**: Time-range filtering is a high-value analysis tool but depends on the file already being loaded and viewable, so it builds on Stories 1-3.

**Independent Test**: Add a log file whose lines consistently start with an ISO-8601 timestamp, confirm the app reports a detected timestamp format for that file, then perform a time-range search and verify only lines within that range are returned. Repeat with a file that has no consistent timestamp and confirm no format is detected and time-range search is unavailable for it.

**Acceptance Scenarios**:

1. **Given** a newly added log file where at least 70% of a sample of its first lines match a recognized timestamp format, **When** the file finishes its initial sampling, **Then** the system marks the file as having a detected timestamp format and parses each line's timestamp.
2. **Given** a newly added log file where no recognized timestamp format reaches the 70% threshold across the sample, **When** sampling completes, **Then** the file is marked as having no detected timestamp format.
3. **Given** a file with a detected timestamp format, **When** the user or an MCP agent performs a search restricted to a time range, **Then** only lines whose parsed timestamp falls within that range (and matching any other search criteria) are returned.
4. **Given** a file with no detected timestamp format, **When** the user attempts a time-range search on it, **Then** the system indicates time-range search is unavailable for that file.

---

### User Story 6 - Workspace Persistence and Save Prompts (Priority: P2)

A user's workspace (files, aliases, highlights, labels, search history) is automatically preserved across app restarts even if never explicitly saved. When the user tries to close an unsaved workspace or start a new one while one is open, the app asks whether to save it; declining discards it, and accepting requires the user to provide an alias before persisting it as a named, reopenable workspace.

**Why this priority**: This protects the user's analysis work (highlights, search history) from being lost, which becomes important once Stories 1-5 generate state worth keeping.

**Independent Test**: Add files, highlight lines, and run searches in an unsaved workspace; close and relaunch the app and confirm the same state is restored. Then attempt to create a new workspace, choose to save the current one with an alias, confirm it appears in the list of saved workspaces, and confirm it can be reopened with its state intact.

**Acceptance Scenarios**:

1. **Given** an unsaved workspace with files, highlights, and search history, **When** the app is closed and reopened, **Then** the same workspace (files, highlights, labels, search history) is restored automatically.
2. **Given** an unsaved workspace is open, **When** the user attempts to close it or create a new workspace, **Then** the app asks whether to save the current workspace.
3. **Given** the save prompt is shown, **When** the user declines to save, **Then** the unsaved workspace is discarded and the requested action (close/new) proceeds.
4. **Given** the save prompt is shown, **When** the user accepts to save and provides an alias, **Then** the workspace is persisted under that alias and becomes available in the list of saved workspaces.
5. **Given** one or more previously saved workspaces exist, **When** the user chooses to open a saved workspace, **Then** its files, highlights, labels, and search history are loaded as they were when last saved.

---

### Edge Cases

- What happens when a log file referenced by a workspace has been moved, renamed, or deleted on disk since it was added? The system MUST indicate the file is unavailable rather than failing the whole workspace load.
- What happens when the user adds a file that is already in the workspace (same path)? The system MUST reject the add operation with a clear "file already in workspace" error.
- What happens when two files in the same workspace end up with the same alias (e.g., same file name from different directories)? The system MUST reject the add operation with a clear validation error if the resulting alias (default or user-specified) would collide with an existing alias in the workspace.
- How does the system handle a search using an invalid regular expression or malformed logical expression (e.g., unbalanced quotes/operators)? The system MUST report a clear validation error without crashing or hanging.
- How does the system handle a request (UI or MCP) for a line index that is out of range for the file? The system MUST return a clear "not found"/out-of-range response.
- How does the system handle timestamp detection when the sampled lines contain a mix of formats, none reaching the 70% threshold? The file is marked as having no detected timestamp format (per User Story 5).
- How does the system handle an MCP `surrounding_count` request near the start or end of a file, where fewer than `surrounding_count` lines exist on one side? The system MUST return as many lines as are available on that side without erroring.
- What happens if the user tries to open a saved workspace whose underlying log files no longer all exist? The workspace MUST still open, with unavailable files clearly marked.
- What happens if the MCP server receives a request while no workspace is open? The system MUST return a clear error indicating no active workspace.

## Requirements *(mandatory)*

### Functional Requirements

**Workspace Management**

- **FR-001**: Users MUST be able to create a new workspace.
- **FR-002**: Users MUST be able to add log files to a workspace by selecting them from the local file system. If the selected file's path already exists in the workspace, the system MUST reject the add operation with a clear "file already in workspace" error.
- **FR-003**: When adding a log file, users MUST be able to specify an alias for it; if none is provided, the system MUST default to the file's name without its extension. If the resulting alias (default or specified) collides with an existing alias in the workspace, the system MUST reject the add operation with a clear validation error and require a different alias.
- **FR-004**: The system MUST persist, per workspace, the set of file paths and aliases, highlighted lines and their labels, and search history.
- **FR-005**: The system MUST automatically restore the most recent unsaved workspace's state when the application is reopened.
- **FR-006**: When the user attempts to close an unsaved workspace, or to create a new workspace while an unsaved one is open, the system MUST prompt the user to choose whether to save it.
- **FR-007**: If the user declines to save, the system MUST discard the unsaved workspace and proceed with the requested action.
- **FR-008**: If the user chooses to save, the system MUST require a workspace alias and persist the workspace (files, highlights, labels, search history) under that alias. If the chosen alias collides with an existing saved workspace's alias, the system MUST reject the save with a clear "alias already in use" error and require a different alias.
- **FR-009**: Users MUST be able to browse and open previously saved workspaces, restoring their persisted state.

**Timestamp Detection**

- **FR-010**: When a log file is added, the system MUST take a sample of its initial lines (e.g., the first 1000) and attempt to detect a common timestamp format among them.
- **FR-011**: If a candidate timestamp format is found in at least 70% of the sampled lines, the system MUST record the file as having a detected timestamp format and parse a timestamp for each line of the file.
- **FR-012**: If no candidate format reaches the 70% threshold, the system MUST record the file as having no detected timestamp format.
- **FR-013**: For files with a detected timestamp format, users and MCP agents MUST be able to restrict searches/views to lines whose timestamps fall within a specified time range.

**Viewing**

- **FR-014**: The system MUST display log lines to the user incrementally as a file is read, without requiring the entire file to be loaded first.
- **FR-015**: Users MUST be able to toggle line wrap on or off for the log view, with line wrap off by default.
- **FR-016**: Users MUST be able to navigate directly to a specific line by its index/number.

**Highlighting and Labeling**

- **FR-017**: Users and MCP agents MUST be able to mark a line as highlighted and remove that highlight.
- **FR-018**: Users and MCP agents MUST be able to attach an optional text label to a highlighted line, and update or remove that label.
- **FR-019**: Users MUST be able to filter the log view to show only highlighted lines.
- **FR-020**: MCP agents MUST be able to retrieve the set of highlighted lines for a file, including each line's index, content, and label (if any).

**Searching**

- **FR-021**: Users and MCP agents MUST be able to search log content using one or more quoted terms combined with logical operators (AND, OR, NOT).
- **FR-022**: Users and MCP agents MUST be able to search log content using a regular expression.
- **FR-023**: Search results MUST identify the matching lines (index and content).
- **FR-024**: The system MUST record each executed search (query text/expression and type) in the workspace's search history.
- **FR-025**: MCP agents MUST be able to perform a "search with context" request, supplying a search expression and a `surrounding_count`, and receive each matching line accompanied by up to `surrounding_count` lines immediately before and after it. If `surrounding_count` is not supplied, the system MUST default it to 5; the system MUST cap `surrounding_count` at a maximum of 200.

**MCP Server Capabilities**

- **FR-026**: The MCP server MUST provide a capability to list the aliases of all files currently in the workspace.
- **FR-027**: The MCP server MUST provide a capability to retrieve a file's properties, including at least: total line count and whether a timestamp format was detected and loaded.
- **FR-028**: The MCP server MUST provide a capability to retrieve the content of a specific line by its index.
- **FR-029**: The MCP server's highlighting, search, and search-with-context capabilities MUST operate consistently with the equivalent UI-driven actions, such that changes made via one are visible via the other.

**Workspace/MCP Scope**

- **FR-030**: The application MUST support only a single open workspace at a time. The MCP server MUST always operate on this single active workspace. Switching to a different workspace (new or saved) is subject to the save/discard prompt flow defined in User Story 6.

**Live Updates**

- **FR-031**: Each log file MUST be treated as a static snapshot as of when it was added/loaded. The system is not required to detect or reflect lines appended to the file on disk after loading; to pick up new content, the user must re-add or reload the file.

**Performance**

- **FR-032**: The system MUST begin rendering log content to the user within a short, perceptible delay after a file is added, regardless of the file's total size.
- **FR-033**: The system MUST be able to execute searches (logical-operator and regex) over log files of at least 5GB without making the host system unresponsive, using techniques such as streaming, indexing, or background processing.
- **FR-034**: The system MUST avoid loading an entire large log file into memory at once when displaying or searching it.

### Key Entities

- **Workspace**: A named or unsaved collection of log files and associated analysis state. Attributes: alias/name (if saved), saved/unsaved status, list of member log files, creation/last-modified time.
- **Log File Entry**: A reference to a log file on disk within a workspace. Attributes: file path, alias, total line count (once known), detected timestamp format (if any), availability status (e.g., file missing on disk).
- **Highlighted Line**: A marker on a specific line within a log file. Attributes: line index, optional label, origin (user or MCP agent), creation time.
- **Search History Entry**: A record of a search performed against a file. Attributes: query expression, search type (logical/text or regex), optional time-range bounds, timestamp of execution.
- **Timestamp Format Profile**: The detected timestamp pattern for a log file, including the pattern definition and the proportion of sampled lines that matched it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a user adds a log file of any size up to at least 5GB, the first visible log lines appear on screen within 2 seconds.
- **SC-002**: A logical-operator or regex search across a 5GB log file returns results within 10 seconds, without the application becoming unresponsive during the search.
- **SC-003**: For log files where a recognized timestamp format appears in at least 70% of the first 1000 lines, the system correctly identifies and applies that format 100% of the time during testing.
- **SC-004**: Closing the app with an unsaved workspace and reopening it restores all files, highlights, labels, and search history exactly as left, with no data loss, across repeated test cycles.
- **SC-005**: An AI agent connected via the MCP server can successfully list workspace files, retrieve file properties, fetch any line by index, and run a context search, with correct results for files of any size including 5GB+.
- **SC-006**: Viewing or searching a 5GB log file does not cause the host system's available memory to be exhausted or the application to crash.
- **SC-007**: Users can highlight a line, add a label, switch to "highlighted only" view, and see exactly the expected lines, on the first attempt, without needing instructions.

## Assumptions

- The desktop application and its MCP server run on the same machine and are intended for local, single-user use; the MCP server exposes a local HTTP/SSE endpoint bound to localhost for AI agent clients to connect to, and is not exposed beyond the local host.
- Log files are treated as read-only by the application; highlights, labels, search history, and aliases are stored in the workspace's own persistence layer, not written back into the log files.
- Search logical-operator syntax supports `AND`, `OR`, and `NOT`/`!` applied to quoted literal terms, with standard precedence (NOT binds tightest, then AND, then OR) and is case-insensitive by default; regex searches use a widely-supported regular expression syntax.
- Recognized timestamp formats include common ISO-8601 variants (e.g., `2026-06-12T14:35:42Z`) and Unix epoch time in seconds or milliseconds (e.g., `1781274942123`); additional formats may be added later.
- "Unsaved workspace" refers to a single default/draft workspace that the application maintains automatically; only one such draft exists at a time.
- The MCP `surrounding_count` parameter defaults to 5 lines and is capped at a maximum of 200 lines to keep responses bounded.
- Workspace and analysis data (highlights, labels, search history, saved workspaces) are stored locally on the user's machine; no cloud sync is required for this feature.
