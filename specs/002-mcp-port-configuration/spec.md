# Feature Specification: User-Configurable MCP Server Port

**Feature Branch**: `002-mcp-port-configuration`
**Created**: 2026-06-13
**Status**: Draft
**Input**: User description: "Currently, the MCP port of this app is dynamically set, as it is defined in src-tauri/src/mcp/server.rs. I want it to be defined by the user. When the app is initialized, if the mcp port is still undefined, a dialog should be shown asking the user to define the port. If the port the user chose isn't available, he should be asked to choose another one. After he chooses, the port, I want a dialog to be displayed showing how to configure the MCP in some popular agent tools. There should be a select to select the tool, and when selected, a command should be shown, with the option to copy it. For claude-cli, for example, the command would be claude mcp add --transport http logfile-analyzer http://localhost:<port>/mcp. I specifically want kiro-ide instructions to be available. After this first definition, the user should still be able to define the port on the settings. For this, the settings dialog should be defined, and the settings button should be added to the toolbar. Whenever starting the app, if the mcp port cannot be initialized for any reason, an error dialog should be shown informing this to the user"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose the MCP server port on first launch (Priority: P1)

When a user opens the application and no MCP server port has been configured yet, they are asked to choose a port number for the local MCP server. If the port they choose is already in use, they are told it isn't available and asked to pick a different one, repeating until a usable port is selected.

**Why this priority**: The MCP server is the application's headline capability for connecting AI agent tools. Without a configured, working port, neither the agent-connection instructions (User Story 2) nor later port changes (User Story 3) have anything to act on. This is the foundation the rest of the feature builds on.

**Independent Test**: Start the application with no MCP port configured, enter a port number, and verify that either the port is accepted and the MCP server becomes reachable on it, or — if the port is already taken — the user is informed and prompted again until an available port is chosen.

**Acceptance Scenarios**:

1. **Given** a fresh installation with no MCP port configured, **When** the application starts, **Then** a dialog appears asking the user to enter a port number for the MCP server, and the application waits for a valid, available port before continuing.
2. **Given** the port-selection dialog is open, **When** the user enters a port number that is free, **Then** the port is saved, the MCP server starts on that port, and the dialog closes.
3. **Given** the port-selection dialog is open, **When** the user enters a port number that is already in use by another process, **Then** the user sees a message that the port is unavailable and is prompted to enter a different port.
4. **Given** the port-selection dialog is open, **When** the user enters a value that is not a valid port number (e.g., non-numeric or outside the valid range), **Then** the user sees a validation message and cannot continue until they enter a valid value.

---

### User Story 2 - Get agent tool connection instructions after choosing a port (Priority: P2)

Immediately after successfully choosing a port for the first time, the user sees a dialog that explains how to connect popular AI agent tools to the MCP server. They can pick a tool from a list — including Claude Code CLI and Kiro IDE — and see the exact command or steps needed to connect that tool, with the chosen port already filled in, plus a way to copy the command.

**Why this priority**: Configuring a port is only useful if the user knows how to put it to work. This is the moment of "value delivery" for the headline feature, but it depends on a port already being chosen (User Story 1).

**Independent Test**: After completing port setup, verify the instructions dialog appears, that switching the selected tool changes the displayed command/steps to match, and that the copy action places the correct, port-specific command on the clipboard.

**Acceptance Scenarios**:

1. **Given** the user has just chosen an available MCP port for the first time, **When** the port is saved, **Then** a dialog appears showing agent tool connection instructions.
2. **Given** the instructions dialog is open, **When** the user selects an agent tool from the list, **Then** the displayed command or setup steps update to match that tool, including the configured port number.
3. **Given** a command is shown for the selected tool, **When** the user activates the copy action, **Then** the full command text is copied to the clipboard and the user gets confirmation that it was copied.
4. **Given** the user selects Kiro IDE from the tool list, **When** the instructions are displayed, **Then** the steps shown are specific to adding this application's MCP server to Kiro IDE, using the configured port.
5. **Given** the user selects Claude Code CLI from the tool list, **When** the instructions are displayed, **Then** the command shown follows the form `claude mcp add --transport http logfile-analyzer http://localhost:<port>/mcp`, with `<port>` replaced by the configured port number.
6. **Given** the instructions dialog is open, **When** the user closes it, **Then** the main application becomes usable as normal.

---

### User Story 3 - Change the MCP server port later from Settings (Priority: P2)

At any time after initial setup, the user can open a Settings dialog — reached via a Settings button in the toolbar — and change the MCP server port. The same availability checks and feedback from initial setup apply: if the new port is unavailable, the user is told and can try a different one.

**Why this priority**: Port needs change over time (conflicts with other local apps, user preference), so an ongoing way to adjust the setting is essential for usability — but it depends on a port already existing to display and change (User Story 1).

**Independent Test**: With the application already running on a previously configured port, open Settings from the toolbar, change the port to a different available value, save, and confirm the MCP server is reachable on the new port and the setting persists across restarts.

**Acceptance Scenarios**:

1. **Given** the application is running with a configured MCP port, **When** the user activates the Settings button in the toolbar, **Then** a Settings dialog opens showing the currently configured MCP port.
2. **Given** the Settings dialog is open, **When** the user enters a new, available port number and saves, **Then** the MCP server becomes reachable on the new port, the old port is released, and the new value is remembered for future launches.
3. **Given** the Settings dialog is open, **When** the user enters a port number that is unavailable and tries to save, **Then** the user sees a message that the port is unavailable, the save does not complete, and the previously configured port remains active.
4. **Given** the Settings dialog is open, **When** the user enters a value that is not a valid port number, **Then** a validation message is shown and the save action cannot be completed until the value is corrected.
5. **Given** the Settings dialog is open, **When** the user makes no changes and closes it, **Then** the MCP server configuration remains unchanged.

---

### User Story 4 - Be informed when the MCP server fails to start (Priority: P3)

Whenever the application starts, if the local MCP server cannot be initialized for any reason — for example the configured port has become unavailable, or another startup problem occurs — the user sees an error dialog explaining that the MCP server is unavailable.

**Why this priority**: This is a safety net rather than core functionality: the rest of the application (log viewing and analysis) remains usable without the MCP server, but users need to know agent connectivity isn't working and have a way to address it. It depends on a port configuration already existing (User Story 1) and benefits from access to Settings (User Story 3) to fix the problem.

**Independent Test**: Configure a port, then make that port unavailable before the next launch (e.g., by occupying it with another process), start the application, and verify an error dialog explains the MCP server could not start while the rest of the application remains usable.

**Acceptance Scenarios**:

1. **Given** a previously configured MCP port is no longer available when the application starts, **When** startup completes, **Then** an error dialog informs the user that the MCP server could not be started and explains why, to the extent known.
2. **Given** the MCP server failed to start, **When** the user dismisses the error dialog, **Then** they can continue using the rest of the application (e.g., opening and analyzing log files) normally.
3. **Given** the MCP server failed to start, **When** the user is shown the error dialog, **Then** they are offered a way to go to Settings to choose a different port.

---

### Edge Cases

- What happens if the user closes or dismisses the first-launch port-selection dialog without entering a valid, available port? The dialog remains open and blocks use of the application until a valid, available port is provided, since the MCP port must be defined before the application proceeds.
- What happens if the user enters the same port number that is already configured when editing Settings? The save succeeds as a no-op; no error is shown and the MCP server keeps running on that port.
- What happens if the user enters a port number in the privileged range (below 1024) that the operating system refuses to bind to? This is treated the same as any other unavailable port: the user is informed it can't be used and asked to choose another.
- What happens if two instances of the application are run at the same time? The second instance will find the configured port already in use by the first instance and follow the same "port unavailable" flow (initial setup) or startup error flow (later launches).
- What happens if the agent tool list needs a tool that isn't in the curated list? Out of scope for this feature; the curated list covers the most popular MCP-capable tools at the time of implementation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST determine, on every application startup, whether an MCP server port has previously been configured.
- **FR-002**: If no MCP server port has been configured, System MUST present a dialog prompting the user to enter a port number, and MUST NOT allow the user to proceed to the main application until a valid, available port has been provided.
- **FR-003**: System MUST validate any entered port number as a syntactically valid TCP port (a whole number within the valid port range) and MUST show a clear message and prevent submission when the value is invalid.
- **FR-004**: System MUST check whether a validly-formatted port number entered by the user is currently available for the MCP server to use.
- **FR-005**: If the entered port is unavailable, System MUST inform the user that the port cannot be used and prompt them to enter a different port, repeating the check until an available port is provided.
- **FR-006**: Once a valid, available port has been confirmed (first-time setup or via Settings), System MUST persist this choice so it is reused automatically on future launches without re-prompting.
- **FR-007**: Immediately after the port is confirmed for the first time, System MUST present a dialog containing instructions for connecting popular AI agent tools to the MCP server.
- **FR-008**: The agent-connection instructions dialog MUST let the user select among multiple supported agent tools from a list, which MUST include at minimum Claude Code CLI and Kiro IDE.
- **FR-009**: When the user selects an agent tool, System MUST display the connection command or setup steps specific to that tool, with the configured MCP port substituted into the displayed text wherever a port is required.
- **FR-010**: For Claude Code CLI, the displayed command MUST follow the form `claude mcp add --transport http logfile-analyzer http://localhost:<port>/mcp`, with `<port>` replaced by the configured port.
- **FR-011**: System MUST provide a control that copies the currently displayed command or instructions text to the clipboard, and MUST confirm to the user that the copy succeeded.
- **FR-012**: System MUST provide a Settings button in the application's toolbar that is reachable at all times during normal use.
- **FR-013**: Activating the Settings button MUST open a Settings dialog that displays the currently configured MCP server port.
- **FR-014**: The Settings dialog MUST allow the user to enter a new MCP server port, applying the same validation (FR-003) and availability checks (FR-004, FR-005) as first-time setup.
- **FR-015**: When the user saves a new valid, available port from Settings, System MUST reconfigure the running MCP server to use the new port and persist the change for future launches.
- **FR-016**: If saving a new port from Settings fails because the port is unavailable or invalid, System MUST leave the previously configured port active and unchanged.
- **FR-017**: On every application startup, System MUST attempt to initialize the MCP server using the configured port.
- **FR-018**: If the MCP server cannot be initialized for any reason during startup, System MUST display an error dialog informing the user that the MCP server is unavailable, including the reason when it is known.
- **FR-019**: System MUST allow the user to continue using the rest of the application (e.g., opening, viewing, and searching log files) even when the MCP server has failed to start.
- **FR-020**: The startup error dialog described in FR-018 MUST offer the user a way to navigate to Settings to choose a different port.
- **FR-021**: System MUST ensure that any agent-connection instructions or commands shown to the user (whether during first-time setup or revisited later) always reflect the currently configured MCP port.

### Key Entities *(include if feature involves data)*

- **MCP Server Configuration**: Represents the user's chosen port for the local MCP server. Persists across application launches. Has a configured/not-configured state and, once configured, an active port number.
- **Agent Tool Connection Profile**: Represents one supported AI agent tool's connection instructions (display name, and a command or step-by-step template that incorporates the configured MCP port). Used to populate the tool-selection list and the displayed instructions in User Story 2.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of first launches without a previously configured port require the user to choose a working port before they can use any other part of the application.
- **SC-002**: Users are able to reach a usable (available) MCP port within 2 submissions on average, including any port-unavailable retries.
- **SC-003**: After choosing a port, a user can find and copy the correct connection command for a given agent tool in under 30 seconds.
- **SC-004**: Users can change the MCP server port from Settings and have the new port active immediately, without restarting the application or editing any files by hand.
- **SC-005**: When the MCP server fails to start, 100% of affected users see an explanatory error dialog and remain able to use the log-viewing and analysis features of the application.

## Assumptions

- The first-launch port-selection dialog is mandatory and non-dismissible until a valid, available port is chosen, since the MCP server is a core capability the application is built around.
- "Available port" means a port number within the valid TCP port range (1-65535) that the application can successfully bind to on the local machine at the time of the check; reasons a port may be unavailable (already in use, insufficient privilege for low-numbered ports, etc.) are all surfaced to the user with the same "choose another port" guidance.
- The MCP server configuration is a single, application-wide setting — not specific to any individual workspace.
- Beyond Claude Code CLI and Kiro IDE (explicitly required), the curated list of agent tools in the connection-instructions dialog includes a small set of other popular MCP-capable AI agent tools, to be finalized during planning.
- Changing the port from Settings takes effect immediately for the running application (the MCP server is reconfigured to the new port without requiring a full application restart).
- The agent-connection instructions dialog from User Story 2 can also be reopened later (e.g., from Settings), so users can revisit setup instructions for a different tool after the first run.
