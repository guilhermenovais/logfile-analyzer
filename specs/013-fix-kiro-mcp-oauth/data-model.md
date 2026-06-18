# Data Model: Fix MCP OAuth Compatibility for Kiro CLI

This feature introduces no new persistent entities, database changes, or IPC types. The only new
data structure is the HTTP response body for the well-known endpoint.

## HTTP Response: Protected Resource Metadata (RFC 9728)

Served at `GET /.well-known/oauth-protected-resource`.

### Response Shape

```json
{
  "resource": "http://127.0.0.1:{port}/mcp"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `resource` | string (URL) | Yes | Identifies the protected resource (RFC 9728 §2). Points to the MCP endpoint. |
| `authorization_servers` | array of strings | No | List of authorization server URLs. **Omitted** to signal no auth is required. |
| `scopes_supported` | array of strings | No | OAuth scopes the resource accepts. **Omitted** — no auth means no scopes. |

### HTTP Response Headers

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| HTTP Status | `200 OK` |

### Validation Rules

- The `resource` field MUST use the actual bound port, not a placeholder
- The `resource` field MUST use `http://` (not `https://`) since this is a localhost-only server

## State Transitions

N/A — this feature adds a stateless HTTP handler.

## Relationship to Existing Entities

```text
McpServerHandle
├── port: u16           ← used to construct the `resource` URL
└── cancellation_token  ← unchanged

axum::Router
├── /mcp                ← existing MCP service (unchanged)
└── /.well-known/oauth-protected-resource  ← NEW static GET handler
```
