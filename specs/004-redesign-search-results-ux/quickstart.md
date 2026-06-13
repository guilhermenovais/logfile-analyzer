# Quickstart: Redesigned Search Results UX

## Develop

```bash
pnpm install
pnpm tauri dev
```

## Try the redesigned flow (manual)

1. **US1 — Jump to a match (P1)**: open a file, run a search that returns
   several matches. The results panel below the search bar should list only
   the matching lines (line number + content, no surrounding context). Click
   any entry — the main log view scrolls so that line is visible.

2. **US2 — Browse all matches (P2)**: with the results panel open, confirm
   every matching line in the main view has the new gray
   (`bg-search-match`) background, distinct from any star-highlighted
   (`bg-accent`) lines. Use the up/down ("previous match"/"next match")
   controls in the results panel header (next to the close button and match
   count) to step through matches; confirm the main view scrolls to each one
   in line-number order, and that "next" from the last match wraps to the
   first (and "previous" from the first wraps to the last) (FR-017).

3. **US3 — Close the results panel (P2)**: click the panel's close control.
   The panel, gray highlighting, and prev/next controls disappear, but the
   search query remains in the search field (FR-008).

4. **US4 — Reuse recent and past searches (P3)**:
   - Run a few different searches. Confirm the standalone "History" section
     below the results is gone (FR-009).
   - Click into the empty search field — up to 5 most-recent searches for
     this workspace appear as suggestions. Start typing part of an earlier
     query — suggestions filter to matches across the *full* workspace
     history, most-recent-first, capped at 5 (FR-010).
   - Click the clock icon to the right of the search field — an overlay opens
     with a scrollable list of every search made in this workspace,
     most-recent-first (FR-011/FR-012).
   - Re-run an identical search (same query/type/time-range) — confirm it
     moves to the top of the history overlay rather than appearing twice
     (FR-012).
   - Select a suggestion or history entry — the field (and search
     type/time-range) populate and the search re-runs immediately (FR-018).
   - Restart the app and reopen the same workspace — the same history is
     still available (FR-014/SC-006).

5. **File-switch isolation (FR-016)**: with the results panel open on file A,
   switch to file B (no search run yet) — the panel/highlighting/nav should
   disappear. Switch back to file A — they reappear with the same results and
   nav position.

6. **Migration (FR-019)**: on a database from before this feature (per-file
   `search_history_entries`), the first launch after upgrading should migrate
   those rows into the new workspace-scoped, deduplicated table — prior
   searches should still show up in the history overlay.

## Quality gates (Principle IV)

```bash
# Frontend
pnpm exec tsc --noEmit
pnpm exec eslint .
pnpm test

# Backend (from src-tauri/)
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```
