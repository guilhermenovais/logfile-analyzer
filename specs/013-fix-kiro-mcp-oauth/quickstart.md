# Quickstart: Fix MCP OAuth Compatibility for Kiro CLI

## What Changed

The MCP server now serves a `/.well-known/oauth-protected-resource` endpoint (RFC 9728) that
returns a minimal Protected Resource Metadata document. This tells MCP clients like Kiro CLI that
the server exists but has no authorization server — effectively signaling "no auth required."

## How to Test

### Prerequisites
- The logfile-analyzer app running with an MCP server configured on a port
- Kiro CLI installed and configured to connect to the MCP server
- Claude CLI (for backward compatibility verification)

### Manual Test Steps

1. **Start the app** with an MCP port configured (e.g., port 9100)

2. **Verify the well-known endpoint**:
   ```bash
   curl -s http://127.0.0.1:9100/.well-known/oauth-protected-resource | jq .
   ```
   Expected:
   ```json
   {
     "resource": "http://127.0.0.1:9100/mcp"
   }
   ```

3. **Connect with Kiro CLI** — should succeed without OAuth errors:
   ```json
   {
     "mcpServers": {
       "logfile-analyzer": {
         "url": "http://127.0.0.1:9100/mcp"
       }
     }
   }
   ```

4. **Connect with Claude CLI** — should continue to work exactly as before

5. **Invoke a tool from each client** (e.g., `list_files`) — verify identical results

### Automated Tests

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

## Files Modified

| File | Change |
|------|--------|
| `src-tauri/src/mcp/server.rs` | Added `/.well-known/oauth-protected-resource` route to axum router |
