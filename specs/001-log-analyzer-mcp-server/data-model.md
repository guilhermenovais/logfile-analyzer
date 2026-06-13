# Phase 1 Data Model: Log Analyzer Desktop App with MCP Server

Derived from the spec's Key Entities and Functional Requirements. Two layers:

- **Persisted** (SQLite, app-data dir) — durable workspace/analysis state.
- **Runtime** (in-memory, Rust `AppState`) — per-open-file engine state
  (mmap, offset index, parsed timestamps) that is rebuilt on load, never stored.

Log file *content* is never persisted (Assumptions: files are read-only).

---

## Persisted entities

### Workspace

A named or draft collection of log files and analysis state. Exactly one is
"active" at a time (FR-030); exactly one draft exists at a time (Assumptions).

| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | |
| alias | text, unique, nullable | Set only when saved (FR-008). NULL ⇒ draft. Uniqueness rejects save-alias collisions (FR-008). |
| is_draft | boolean | True for the single auto-maintained unsaved workspace (FR-005). |
| created_at | timestamp | |
| modified_at | timestamp | Updated on any state change (drives draft auto-recovery, SC-004). |

- **Validation**: saving with an in-use alias → reject "alias already in use"
  (FR-008). At most one row with `is_draft = true`.
- **State transition**: `draft → saved` on save-with-alias; opening a saved
  workspace while a dirty draft exists triggers the save/discard prompt (US6,
  FR-006/FR-007). Discard deletes the draft row + children.

### LogFileEntry

A reference to a log file on disk within a workspace.

| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | |
| workspace_id | FK → Workspace | cascade delete |
| path | text | Absolute, canonicalized in Rust (Principle II). |
| alias | text | Defaults to file name without extension (FR-003). |
| has_timestamp_format | boolean | Result of detection (FR-011/FR-012); recomputed on load. |
| availability | enum (`available`/`missing`) | Runtime-derived on load; file may be moved/deleted (Edge Cases, FR — missing files don't fail the whole workspace). |

- **Validation** (within a workspace): `path` unique → reject "file already in
  workspace" (FR-002); `alias` unique → reject alias-collision (FR-003).
- **Note**: `total_line_count` and `detected timestamp format` details are
  runtime values (see FileRuntime), surfaced once indexing completes.

### Highlight

A marker on a specific line of a log file.

| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | |
| file_id | FK → LogFileEntry | cascade delete |
| line_index | integer | 0- or 1-based — fix one convention across IPC + MCP (see contracts). |
| label | text, nullable | Optional, settable/updatable/removable (FR-018). |
| origin | enum (`user`/`mcp_agent`) | Who created it (FR-017, US4). |
| created_at | timestamp | |

- **Validation**: `line_index` must be in range for the file → else out-of-range
  error (Edge Cases). `(file_id, line_index)` unique (one highlight per line).
- Retrievable with index + content + label by both UI and MCP (FR-020).

### SearchHistoryEntry

A record of an executed search against a file.

| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | |
| file_id | FK → LogFileEntry | cascade delete |
| query | text | The raw expression/pattern (FR-024). |
| search_type | enum (`logical`/`regex`) | (FR-024). |
| time_from | timestamp, nullable | Optional time-range bound (US5/FR-013). |
| time_to | timestamp, nullable | Optional time-range bound. |
| executed_at | timestamp | (FR-024). |

- Recorded on every executed search (FR-024, US3 scenario 5), from UI or MCP.

---

## Runtime entities (in-memory, not persisted)

### FileRuntime

Per-open-file engine state held in `AppState`, rebuilt when a workspace/file is
loaded; backs viewing, search, get-line, and properties.

| Field | Type | Notes |
|-------|------|-------|
| mmap | memory-mapped handle | `memmap2`, read-only (research §2). |
| line_offsets | `Vec<u64>` | Byte offset of each line start; built in background (research §2). |
| total_lines | usize | Known once indexing completes (FR-027 line count). |
| index_state | enum (`indexing`/`ready`) | Drives incremental availability (FR-014/FR-032). |
| timestamp_profile | `Option<TimestampFormatProfile>` | Present iff detected (FR-011). |
| line_timestamps | `Option<Vec<Option<i64>>>` | Epoch-ms per line; present iff format detected (research §4). |

### TimestampFormatProfile

The detected timestamp pattern for a file (spec Key Entity).

| Field | Type | Notes |
|-------|------|-------|
| format_id | enum/identifier | Which recognized matcher won (ISO-8601 variant / epoch s / epoch ms). |
| match_ratio | float | Proportion of the 1000-line sample that matched (≥0.70 to be detected, FR-011). |

---

## Relationships

```text
Workspace 1───* LogFileEntry 1───* Highlight
                     │
                     └───* SearchHistoryEntry

LogFileEntry 1───1 FileRuntime (in-memory only) 0..1── TimestampFormatProfile
```

- Deleting a Workspace cascades to its LogFileEntries, Highlights, and
  SearchHistoryEntries.
- FileRuntime is reconstructed on load; if the file is `missing`, no FileRuntime
  is built and the entry is shown unavailable (Edge Cases).

## Consistency invariant (FR-029)

Highlights, search, and search-with-context mutate/read the **same** persisted
rows and the **same** `AppState.FileRuntime` regardless of whether the call
arrives via a Tauri command (UI) or an MCP tool (agent). There is no separate
agent-side store.
