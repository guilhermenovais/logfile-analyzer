# Research: Fix MCP OAuth Compatibility for Kiro CLI

## 1. Root Cause Analysis

### Problem
Kiro CLI (Amazon Q Developer CLI MCP client) fails to connect to the logfile-analyzer MCP server
with error: *"OAuth discovery failed: the server does not advertise OAuth endpoints."*

### Discovery Flow (Kiro)
Kiro performs proactive OAuth endpoint discovery before/during MCP session establishment:

1. Probes `/.well-known/oauth-protected-resource` (RFC 9728) to find protected resource metadata
2. Probes `/.well-known/oauth-authorization-server` (RFC 8414) and variants to find OAuth server metadata
3. When **all probes fail** (404 or connection error) AND the server doesn't return 401, Kiro
   throws JSON-RPC error `-32002: "No authorization support detected"` and refuses to connect

### Why Claude CLI Works
Claude CLI follows the spec strictly: it sends the MCP `initialize` POST first, and only initiates
OAuth discovery if the server responds with `401 Unauthorized`. Since our server responds `200 OK`
to the initialize request, Claude CLI proceeds without authentication.

### Why Kiro Fails
Our axum router only mounts `StreamableHttpService` at `/mcp`. Requests to any other path receive
axum's default 404 response. Kiro interprets the absence of any well-known endpoint as a fatal
error rather than "no auth needed."

## 2. MCP Specification Analysis

### Auth is Optional (MCP 2025-03-26 / 2025-06-18)
The MCP specification states: **"Authorization is OPTIONAL for MCP implementations."** The
authentication flow is triggered by the server returning `401 Unauthorized` with a
`WWW-Authenticate` header. The absence of a `401` IS the signal that no auth is needed. Servers
without authentication are NOT required to implement RFC 9728 or serve well-known endpoints.

### RFC 9728 — Protected Resource Metadata
Defines `/.well-known/oauth-protected-resource` as a discovery document for OAuth-protected
resources. The document contains:
- `resource`: URL identifying the protected resource
- `authorization_servers`: list of authorization server URLs (optional)
- `scopes_supported`: list of OAuth scopes the resource accepts (optional)

A document that omits `authorization_servers` (or provides an empty list) signals the resource
has no associated authorization server — effectively unprotected.

### RFC 8414 — OAuth Authorization Server Metadata
Defines `/.well-known/oauth-authorization-server` for discovering OAuth server endpoints. Only
relevant for servers that actually run an authorization server. Our server does not, so returning
404 on this path is correct.

## 3. Solution: Serve Protected Resource Metadata

### Decision
Add a handler at `/.well-known/oauth-protected-resource` that returns a minimal RFC 9728
Protected Resource Metadata document with no `authorization_servers` field, signaling the resource
is unprotected.

### Rationale
- Follows RFC 9728 — the document itself is valid, it just says "no auth servers"
- Works with Kiro's proactive discovery — Kiro gets a 200 with valid JSON instead of 404
- Works with Claude CLI — Claude CLI doesn't probe this path, so no behavioral change
- Works with any future MCP client — the response is spec-compliant

### Alternatives Considered

| Alternative | Rejected Because |
|------------|------------------|
| Return 404 on well-known paths (current behavior) | This IS the current behavior and it breaks Kiro |
| Return 401 + empty WWW-Authenticate | Would be misleading — server doesn't require auth |
| Serve `/.well-known/oauth-authorization-server` with dummy metadata | We don't run an auth server; this would break clients that try to use the endpoints |
| Patch Kiro CLI | We don't control Kiro; server-side fix is the only option |

## 4. Implementation Approach

### Scope
- Add a single axum GET handler for `/.well-known/oauth-protected-resource` to `mcp/server.rs`
- The handler returns a JSON document: `{ "resource": "http://127.0.0.1:{port}/mcp" }`
- The `resource` field identifies the protected resource; absence of `authorization_servers` signals no auth
- Mount this route alongside the existing `/mcp` nest in the axum router

### Port Awareness
The `resource` field in the metadata document should reflect the actual bound port. Since the port
is determined at bind time (OS-assigned or configured), the handler needs access to the port value.
This can be achieved by capturing the port in a closure or passing it as axum state.

### Edge Cases
- **Client sends Authorization header anyway**: The MCP service already ignores unsolicited auth headers (they're just HTTP headers that don't affect request processing)
- **Client probes `/.well-known/oauth-authorization-server`**: Returns axum's default 404, which correctly signals "no OAuth server here." Kiro should handle this gracefully once it gets valid protected resource metadata.
- **Port changes between sessions**: The metadata document reflects the current bound port; no caching issues since it's generated per-request
