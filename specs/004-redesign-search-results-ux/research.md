# Phase 0 Research: Redesigned Search Results UX

All "NEEDS CLARIFICATION" items from the spec were already resolved during
`/speckit-clarify` (see spec.md "Clarifications"). This phase records the
remaining implementation-level decisions needed before design.

## 1. Results panel data source

- **Decision**: The results panel (FR-001) and the gray match-highlighting /
  navigation in the main view (FR-005–FR-007) are driven by the existing
  `search` Tauri command (`SearchMatchBatch { matches: { line_index, content
  }[] }`), not `search_with_context`.
- **Rationale**: `search` already returns exactly the shape FR-001 needs (no
  before/after context lines), already streams in `MAX_MATCH_BATCH = 500`
  batches (Principle VI), and already returns line indices in ascending
  order — the order needed for prev/next navigation and wrap-around
  (FR-017). Switching avoids sending unused context-line payloads.
- **Alternatives considered**: Keep using `search_with_context` and hide the
  `before`/`after` arrays in the UI — rejected, it sends data the redesigned
  UI never renders and couples the results panel to context-window sizing it
  no longer needs. `search_with_context` remains unchanged for the MCP tool
  and stays in `commands::search`/`logfile::query` (FR-029 shared engine).

## 2. Per-file search UI state (results, panel open/closed, nav position)

- **Decision**: Introduce a small Zustand store, keyed by file alias, holding
  the per-file search UI state: `query`, `searchType`, `timeFrom`, `timeTo`,
  `results`, `truncated`, `panelOpen`, `currentMatchIndex`, and a
  `scrollNonce` used to (re-)trigger scrolling in `LogViewer`. This is the
  first real use of the `zustand` dependency already declared in
  `package.json`.
- **Rationale**: FR-016 requires the results panel, gray highlighting, and
  nav controls to persist (hidden, not destroyed) when the user switches to a
  different file and to reappear when they switch back. The existing
  `useSearch`/`useLogStream` pattern *resets* state when `alias` changes,
  which is the opposite of what FR-016 needs. A Zustand store keyed by alias
  keeps state alive across the `selectedAlias` changes in `WorkspacePage`
  without prop-drilling between `SearchBar`, the new results panel, and
  `LogViewer`. The constitution designates Zustand for "app-wide client
  state," and this is cross-component UI state that outlives any single
  component's mount.
- **Alternatives considered**: `useState`/`Map` lifted into `WorkspacePage` —
  rejected, it would reinvent a subset of what Zustand already provides
  (subscriptions without re-rendering the whole tree) with more boilerplate.
  React Context — rejected for the same reason, plus provider boilerplate.

## 3. Distinguishing search-match highlighting from the existing star highlight

- **Decision**: Add a new CSS custom property `--search-match` (and
  `--color-search-match` theme token in `App.css`, alongside the existing
  `--accent`/`--muted` tokens) for the FR-005 gray background in the main log
  view. The existing star-highlight styling (`bg-accent`) is left unchanged.
  When a line is both a search match and star-highlighted, both visual
  treatments are applied (e.g. the star-highlight background plus a
  `search-match` border/ring), so the two remain distinguishable per the
  spec's Assumptions.
- **Rationale**: In the current theme, `--accent` and `--muted` resolve to
  the *same* oklch value in both light and dark mode. The results panel's
  current "gray background for the matched line" (`bg-accent`) is therefore
  visually identical to the existing star-highlight background, which also
  uses `bg-accent`. Reusing `bg-accent` verbatim for the new main-view
  search-match highlight (per the spec's literal wording) would make it
  indistinguishable from the star highlight — directly contradicting the
  spec's own Assumption that the two must "remain visually distinguishable."
  A new, separate gray token resolves the conflict while staying "gray" and
  keeps the star-highlight styling untouched, as the Assumption also requires.
- **Alternatives considered**: Reuse `bg-accent` as written — rejected for
  the conflict above. Recolor the star highlight — rejected, the Assumption
  says star styling "remain[s] unchanged."

## 4. Search history storage: per-file → per-workspace with dedup

- **Decision**: Change `search_history_entries` from `file_id`-scoped (FK →
  `log_file_entries`, `ON DELETE CASCADE`) to `workspace_id`-scoped (FK →
  `workspaces`, `ON DELETE CASCADE`), rename `executed_at` to `last_used_at`,
  and add a `UNIQUE` index on
  `(workspace_id, query, search_type, COALESCE(time_from, <sentinel>),
  COALESCE(time_to, <sentinel>))`. `schema::migrate` detects the old
  `file_id`-based table (via `PRAGMA table_info`), and for each existing row
  resolves `workspace_id` from `log_file_entries.workspace_id`, then
  re-inserts into the new table applying the same dedup/upsert rule (keeping
  the latest `executed_at` as `last_used_at`), before dropping the old table.
- **Rationale**: FR-013 requires history scoped to the workspace, not a
  file; FR-019 requires migrating existing per-file rows into that
  workspace-scoped, deduplicated form. Switching the FK to `workspace_id`
  also fixes a latent correctness issue: under the old schema, removing a
  file from a workspace (`ON DELETE CASCADE` from `log_file_entries`) would
  silently delete search history that conceptually belongs to the workspace.
- **Alternatives considered**: Keep `file_id` and resolve `workspace_id` via
  a join at read time — rejected, doesn't fix the cascade-delete issue and
  doesn't satisfy "migrate existing data" (FR-019) since the dedup has to
  happen somewhere; doing it at read time on every query is wasteful and
  non-idempotent for the "first run after upgrade" migration.
- **Dedup via `COALESCE`-keyed UNIQUE index**: SQLite treats `NULL` as
  distinct from `NULL` in `UNIQUE` constraints/indexes, so a plain
  `UNIQUE (workspace_id, query, search_type, time_from, time_to)` would allow
  unlimited duplicate rows whenever `time_from`/`time_to` are both `NULL`
  (the common case — no time range). Wrapping the nullable columns in
  `COALESCE(col, <sentinel>)` (a value outside the valid epoch-ms domain,
  e.g. `i64::MIN`) in the index expression makes two "no time range" entries
  collide as intended, enabling `INSERT ... ON CONFLICT (...) DO UPDATE SET
  last_used_at = excluded.last_used_at` for the FR-012 dedup/reorder rule.

## 5. Search history read path: workspace-scoped, no per-file alias

- **Decision**: `get_search_history` drops its `alias` parameter and returns
  the active workspace's full history (most-recent-first by `last_used_at`),
  resolved via `state.active_workspace_id` (same pattern as `search`/
  `search_with_context` already use for `workspace::touch`). The frontend
  fetches this list once per workspace (TanStack Query, cached) and derives
  both the autocomplete suggestions (FR-010: filter by substring match on
  `query`, most-recent-first, capped at 5) and the full history overlay
  (FR-012) from the same cached array — no separate "search history search"
  command.
- **Rationale**: Search-history size is bounded by how many distinct searches
  a user runs, not log size — fetching the full list and filtering
  client-side is simple (Principle III) and keeps the autocomplete and
  overlay trivially consistent with each other.
- **Alternatives considered**: A backend `search_history_suggestions(query)`
  command doing the filtering/limiting in SQL — rejected as premature given
  the expected data volume; would also require a second round-trip on every
  keystroke.

## 6. Scroll-to-line in `LogViewer`

- **Decision**: `LogViewer` gains a `scrollToLine?: { lineIndex: number;
  nonce: number } | null` prop. An effect calls
  `virtualizer.scrollToIndex(lineIndex - 1, { align: "center" })` whenever
  `nonce` changes.
- **Rationale**: Keeps `LogViewer` a controlled component consistent with its
  existing prop-driven design (`highlights`, `highlightedOnly`,
  `onToggleHighlight`). The `nonce` lets the parent re-request a scroll to the
  *same* line (e.g. clicking the same result entry twice, or "next" wrapping
  from the last match back to the first) — a plain `lineIndex` prop wouldn't
  re-trigger the effect if the value doesn't change.
- **Alternatives considered**: `forwardRef`/`useImperativeHandle` exposing an
  imperative `scrollToLine()` method — rejected as inconsistent with the
  rest of the component's prop-driven API and harder to test with RTL.

## 7. Per-file gray highlighting + nav vs. global active search

- **Decision**: `currentMatchIndex` and `results` live in the per-alias
  Zustand slice (Decision 2). `WorkspacePage` only passes
  `searchMatchLines`/`scrollToLine` down to `LogViewer` for the *currently
  selected* alias's slice when that slice's `panelOpen` is true; for any
  other alias the slice still exists in the store (so it's restored on
  switch-back per FR-016) but isn't rendered.
- **Rationale**: Directly implements FR-016's "hide when switching away,
  restore when switching back" without re-running the search or losing nav
  position.
