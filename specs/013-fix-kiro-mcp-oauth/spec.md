# Feature Specification: Fix MCP OAuth Compatibility for Kiro CLI

**Feature Branch**: `013-fix-kiro-mcp-oauth`  
**Created**: 2026-06-18  
**Status**: Draft  
**Input**: User description: "On Claude CLI, the MCP of this project works normally. But on Kiro CLI, it fails with: OAuth discovery failed: the server does not advertise OAuth endpoints. Verify that the server URL is correct and that the server supports MCP authentication. I need this fixed so the MCP can be used on Kiro."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - MCP Server Works with Kiro CLI (Priority: P1)

A developer using the Kiro CLI connects to the logfile-analyzer MCP server. Kiro initiates an MCP connection over Streamable HTTP. The server responds in a way that Kiro recognizes as a valid, unauthenticated MCP endpoint, allowing the developer to use all MCP tools (list files, search, highlights, etc.) without errors.

**Why this priority**: This is the core issue — the MCP server is unusable from Kiro due to the OAuth discovery failure. Fixing this unblocks all Kiro users.

**Independent Test**: Can be fully tested by configuring the MCP server in Kiro CLI and verifying that tool calls (e.g., `list_files`) succeed without OAuth errors.

**Acceptance Scenarios**:

1. **Given** the logfile-analyzer app is running with its MCP server active, **When** a Kiro CLI user connects to the MCP endpoint, **Then** the connection is established without OAuth-related errors.
2. **Given** a Kiro CLI user is connected to the MCP server, **When** they invoke any MCP tool (e.g., `list_files`, `search_with_context`), **Then** the tool executes and returns results as expected.
3. **Given** the MCP server is configured to not require authentication, **When** Kiro CLI performs OAuth endpoint discovery, **Then** the server responds in a way that signals no authentication is required, and Kiro proceeds without error.

---

### User Story 2 - Backward Compatibility with Claude CLI (Priority: P1)

A developer using the Claude CLI continues to connect to the MCP server exactly as before. No existing functionality or connection behavior is broken by the changes made for Kiro compatibility.

**Why this priority**: Same as P1 — breaking the existing working integration would be a regression.

**Independent Test**: Can be fully tested by connecting Claude CLI to the MCP server and verifying all existing tools work.

**Acceptance Scenarios**:

1. **Given** the logfile-analyzer app is running, **When** a Claude CLI user connects to the MCP endpoint, **Then** the connection succeeds and all tools work identically to before the change.
2. **Given** the MCP server has been updated for Kiro compatibility, **When** Claude CLI sends tool requests, **Then** responses are identical in format and content.

---

### User Story 3 - Other MCP Clients Can Connect (Priority: P2)

Other MCP-compliant clients (beyond Claude and Kiro) can connect to the server. The server's authentication posture follows MCP specification standards so that any conformant client can interoperate.

**Why this priority**: Future-proofing the server for the broader MCP ecosystem adds long-term value but is secondary to fixing the immediate Kiro issue.

**Independent Test**: Can be tested by connecting any third-party MCP client over Streamable HTTP and verifying successful tool invocation.

**Acceptance Scenarios**:

1. **Given** the MCP server is running, **When** any standards-compliant MCP client connects over Streamable HTTP, **Then** the server communicates its authentication requirements (or lack thereof) in a way the client can interpret, and the connection succeeds.

---

### Edge Cases

- What happens when a client sends an OAuth token even though authentication is not required? The server should ignore unsolicited credentials and process the request normally.
- What happens when a client probes well-known OAuth discovery paths (e.g., `/.well-known/oauth-authorization-server`)? The server should respond with a clear signal that no authentication is needed (e.g., an appropriate HTTP status) rather than a connection error.
- What happens when the MCP server port changes between sessions? Clients should be able to reconnect to the new port without cached OAuth state causing issues.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The MCP server MUST respond to OAuth discovery requests in a way that MCP clients (including Kiro) can interpret as "no authentication required."
- **FR-002**: The MCP server MUST continue to serve all existing MCP tools over the Streamable HTTP transport without requiring any authentication credentials.
- **FR-003**: The MCP server MUST NOT break existing Claude CLI connectivity when adding Kiro compatibility.
- **FR-004**: The MCP server MUST handle requests from clients that include unsolicited authentication headers without errors.
- **FR-005**: The server MUST conform to the MCP specification's mechanism for advertising its authentication posture to connecting clients.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Kiro CLI users can successfully connect to the MCP server and invoke tools on their first attempt, with zero OAuth-related error messages.
- **SC-002**: Claude CLI users experience no change in behavior — all tools continue to work identically.
- **SC-003**: 100% of existing MCP integration tests continue to pass after the change.
- **SC-004**: Connection establishment from any MCP client completes within the same time frame as before (no perceptible latency added by authentication negotiation).

## Assumptions

- The Kiro CLI follows the MCP specification for OAuth discovery and respects the server's signal that authentication is not required.
- The fix can be achieved at the server level (transport configuration or HTTP response handling) without requiring changes to the Kiro CLI itself.
- The `rmcp` Rust crate (currently v1.7.0) supports configuration for advertising authentication posture, or the server can add the necessary HTTP endpoints/headers via the existing Axum router.
- The MCP server will continue to operate without authentication — adding actual OAuth support is out of scope.
- The server only needs to support the Streamable HTTP transport (no stdio or SSE transport required).
