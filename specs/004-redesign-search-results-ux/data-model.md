# Phase 1 Data Model: Redesigned Search Results UX

Two layers, as in 001/003: **Persisted** (SQLite) and **Runtime/Frontend**
(in-memory, never stored). This feature changes one persisted entity
(`SearchHistoryEntry`) and adds frontend-only state; `Search Match` and
`Search Results Set` from the spec's Key Entities are runtime-only (derived
from a `search` response, never persisted).

---

## Persisted entities

### SearchHistoryEntry (MODIFIED)

A record of a previously executed search, now scoped to a **workspace**
instead of a file (FR-013/FR-015/FR-019).

| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | unchanged |
| workspace_id | FK → Workspace, `ON DELETE CASCADE` | **was `file_id` → LogFileEntry**. Searches recorded against `*state.active_workspace_id`. |
| query | text | unchanged (FR-015) |
| search_type | enum (`logical`/`regex`) | unchanged |
| time_from | integer (epoch ms), nullable | unchanged (FR-015) |
| time_to | integer (epoch ms), nullable | unchanged (FR-015) |
| last_used_at | timestamp | **was `executed_at`**. Set on insert; updated to "now" whenever an identical search (see Uniqueness) re-runs (FR-012). |

- **Uniqueness / dedup (FR-010/FR-012)**: `UNIQUE` index on
  `(workspace_id, query, search_type, COALESCE(time_from, MIN_I64),
  COALESCE(time_to, MIN_I64))`, where `MIN_I64` is a sentinel
  (`i64::MIN`) standing in for `NULL` so two "no time range" entries with the
  same `query`/`search_type` collide. Recording a search that matches an
  existing entry on this key `UPDATE`s that row's `last_used_at` instead of
  inserting a new row (re-running an identical search moves it to the top,
  per FR-012).
- **Ordering**: `list_for_workspace` returns rows `ORDER BY last_used_at
  DESC` (most-recent-first, FR-012).
- **Validation**: none beyond the existing `search_type` `CHECK` constraint
  (unchanged).
- **Migration (FR-019)**: on first run after upgrade, `schema::migrate`
  detects the old `file_id`-based table via `PRAGMA table_info`, and for each
  existing row:
  1. Resolves `workspace_id` from `log_file_entries.workspace_id` (joining on
     the old `file_id`).
  2. Groups rows by the new uniqueness key
     `(workspace_id, query, search_type, time_from, time_to)`.
  3. Inserts one row per group into the new table, with `last_used_at =
     MAX(executed_at)` across the group's rows.
  4. Drops the old table.

  If a referenced `log_file_entries` row no longer exists (shouldn't happen
  under `ON DELETE CASCADE`, but defensive), that old row is skipped.

---

## Runtime entities (unchanged shape, reused)

### Search Match / `SearchMatchEntry`

`{ line_index: u32, content: string }` — one line satisfying the active
query. Already defined in `commands::types::SearchMatchEntry` and streamed by
`search` in `SearchMatchBatch`. FR-001 results panel rows = this shape
directly (no `before`/`after`).

### Search Results Set

The accumulated `SearchMatchEntry[]` from one `search` invocation, plus
`truncated: bool` (from hitting `MAX_MATCH_BATCH` across batches — existing
truncation semantics, Assumptions). Held in frontend state (below), not
persisted. Drives:
- the results panel list (FR-001–FR-004)
- the set of line indices given `bg-search-match` styling in `LogViewer`
  (FR-005)
- the ordered sequence for prev/next navigation, including wrap-around
  (FR-006/FR-017)

---

## Frontend-only state: `SearchUiState` (per file alias, Zustand)

New store `useSearchUiStore`, keyed by file alias (research.md §2/§7). Not
persisted — reset on app restart (only `SearchHistoryEntry` persists, per
FR-014).

| Field | Type | Notes |
|-------|------|-------|
| query | string | Current search-field text (FR-008: survives panel close). |
| searchType | `"logical" \| "regex"` | |
| timeFrom / timeTo | number \| null | epoch ms, optional time-range bounds |
| results | `SearchMatchEntry[]` | from the latest `search` run for this alias |
| truncated | boolean | from the latest `search` run |
| panelOpen | boolean | drives results panel visibility + main-view highlighting/nav (FR-004/FR-007) |
| currentMatchIndex | number | index into `results`; `-1` if none. Updated by clicking a result row, or by prev/next (FR-006/FR-017, wraps). |
| scrollNonce | number | incremented whenever `currentMatchIndex` changes via a user action that should scroll the main view (research.md §6). |

**Derived values** (computed, not stored):
- `searchMatchLines: number[]` = `results.map(r => r.line_index)`, passed to
  `LogViewer` only while `panelOpen` (FR-005/FR-007).
- `scrollToLine` passed to `LogViewer` = `panelOpen && currentMatchIndex >= 0
  ? { lineIndex: results[currentMatchIndex].line_index, nonce: scrollNonce }
  : null`.

**Transitions**:
- Run search → `results`/`truncated` replaced, `panelOpen = true`,
  `currentMatchIndex = results.length > 0 ? 0 : -1`, `scrollNonce++` (US1/US2,
  scrolls to first match).
- Click result row *i* → `currentMatchIndex = i`, `scrollNonce++` (FR-002/
  FR-003).
- Next/previous → `currentMatchIndex = (currentMatchIndex + 1) %
  results.length` / `(currentMatchIndex - 1 + results.length) %
  results.length`, `scrollNonce++` (FR-006/FR-017).
- Close panel → `panelOpen = false`; `query`, `results`, `currentMatchIndex`
  untouched (FR-008).
- Switch away from this alias → slice untouched, simply not rendered
  (FR-016).
- Select autocomplete suggestion / history overlay entry → `query`,
  `searchType`, `timeFrom`, `timeTo` set from the entry, then "run search"
  transition above fires immediately (FR-018).

---

## Workspace (unchanged)

No schema change. `SearchHistoryEntry.workspace_id` references the existing
`workspaces.id`; cascade-deletes with the workspace as before (just no longer
indirectly via `log_file_entries`).
