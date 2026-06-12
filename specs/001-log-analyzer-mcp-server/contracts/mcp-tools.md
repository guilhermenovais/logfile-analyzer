# Contract: MCP Tools (agent-facing)

Exposed by the in-process MCP server (`rmcp`, SSE transport) bound to
`127.0.0.1`. All tools operate on the single **active workspace**
(FR-030). If no workspace is open, every tool returns the `no_active_workspace`
error (spec Edge Cases).

**Conventions**

- Files are addressed by their workspace **alias** (FR-026).
- `line_index` convention: **1-based** (line 1 = first line). Fixed across MCP
  and UI. Out-of-range → `line_out_of_range`.
- All inputs validated/canonicalized in Rust (Principle II). Errors are returned
  as structured tool errors, never as crashes/hangs.

**Common errors**: `no_active_workspace`, `file_not_found` (unknown alias),
`file_unavailable` (alias known but file missing on disk), `line_out_of_range`,
`invalid_query`, `time_range_unavailable`.

---

## tool: `list_files`  (FR-026)

List the aliases of all files in the active workspace.

- **Input**: none.
- **Output**:
  ```json
  { "files": [ { "alias": "app", "available": true },
               { "alias": "nginx", "available": false } ] }
  ```
- **Maps to**: US2 scenario 1.

## tool: `get_file_properties`  (FR-027)

Retrieve a file's properties.

- **Input**: `{ "alias": "app" }`
- **Output**:
  ```json
  { "alias": "app",
    "total_lines": 5234101,
    "has_timestamp_format": true,
    "available": true,
    "indexing_complete": true }
  ```
- **Notes**: `total_lines` is reported once indexing completes; while indexing,
  `indexing_complete=false` and `total_lines` reflects lines indexed so far.
- **Maps to**: US2 scenario 2.

## tool: `get_line`  (FR-028)

Retrieve the content of a specific line by index.

- **Input**: `{ "alias": "app", "line_index": 42 }`
- **Output**: `{ "line_index": 42, "content": "..." }`
- **Errors**: `line_out_of_range` if `line_index < 1` or `> total_lines`
  (spec Edge Cases).
- **Maps to**: US2 scenario 3.

## tool: `search_with_context`  (FR-025, FR-021/FR-022)

Search a file and return each match with surrounding lines.

- **Input**:
  ```json
  { "alias": "app",
    "query": "\"error\" AND \"db\"",
    "search_type": "logical",            // "logical" | "regex"
    "surrounding_count": 5,               // optional; default 5; clamped to max 200
    "time_from": "2026-06-12T00:00:00Z",  // optional (only if format detected)
    "time_to":   "2026-06-12T01:00:00Z" } // optional
  ```
- **Output**:
  ```json
  { "matches": [
      { "line_index": 1190,
        "before": [ { "line_index": 1188, "content": "..." }, { "line_index": 1189, "content": "..." } ],
        "match":  { "line_index": 1190, "content": "...error...db..." },
        "after":  [ { "line_index": 1191, "content": "..." } ] }
    ],
    "truncated": false }
  ```
- **Rules**:
  - `surrounding_count` defaults to **5**, capped at **200** (FR-025); values
    above 200 are clamped, not rejected.
  - Near file start/end, return as many before/after lines as exist — no error
    (spec Edge Cases).
  - Invalid regex / malformed logical expression → `invalid_query` (FR — no
    crash/hang).
  - `time_from`/`time_to` on a file without a detected format →
    `time_range_unavailable` (US5 scenario 4).
  - Large result sets are paginated/streamed; `truncated` signals more available.
- **Side effect**: records a SearchHistoryEntry (FR-024) — visible in the UI
  (FR-029).
- **Maps to**: US2 scenario 4, US3, US5 scenario 3.

## tool: `list_highlights`  (FR-020)

Retrieve highlighted lines for a file.

- **Input**: `{ "alias": "app" }`
- **Output**:
  ```json
  { "highlights": [
      { "line_index": 1190, "content": "...", "label": "root cause" },
      { "line_index": 1190, "content": "...", "label": null } ] }
  ```
- **Maps to**: US4 scenario 4.

## tool: `set_highlight`  (FR-017, FR-018)

Add or update a highlight (with optional label) on a line.

- **Input**: `{ "alias": "app", "line_index": 1190, "label": "root cause" }`
  (`label` optional; omit/null = highlight without label).
- **Output**: `{ "ok": true }`
- **Behavior**: creates the highlight (origin = `mcp_agent`) or updates its label
  if one already exists on that line. Reflected immediately in the UI (FR-029,
  US4 scenario 2).
- **Errors**: `line_out_of_range`.

## tool: `clear_highlight`  (FR-017)

Remove a highlight from a line.

- **Input**: `{ "alias": "app", "line_index": 1190 }`
- **Output**: `{ "ok": true }`
- **Behavior**: removes the highlight (and its label) if present; reflected in UI.

---

## Consistency requirement

Per FR-029, the highlight/search/context tools above MUST read and write the
exact same workspace state as the equivalent UI actions, so changes made by an
agent are visible to the user and vice versa.
