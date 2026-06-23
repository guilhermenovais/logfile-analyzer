# Quickstart: Search UX Improvements

**Feature**: `020-search-ux-improvements` | **Date**: 2026-06-22

## Prerequisites

```bash
# From repo root
npm install
cd src-tauri && cargo build && cd ..
```

No new dependencies to install. No database migrations.

## Dev Workflow

```bash
# Start dev server (frontend + Tauri)
npm run tauri dev

# Run frontend tests
npm test

# Run backend tests
cd src-tauri && cargo test

# Type-check frontend
npx tsc --noEmit

# Lint frontend
npx eslint .

# Rust checks
cd src-tauri && cargo clippy -- -D warnings && cargo fmt --check
```

## Regenerate Type Bindings

After modifying Rust types in `src-tauri/src/commands/types.rs` or command
signatures in `search.rs`, rebuild to regenerate `src/bindings/index.ts`:

```bash
npm run tauri dev
# Specta regenerates bindings on dev server start
```

Verify the generated types include the new fields:
- `SearchMatchBatch.total_count: number`
- `commands.search()` accepts `offset: number | null` parameter

## Testing Strategy

### Frontend (Vitest + React Testing Library)

Files to create/modify:
- `src/components/SearchResultsPanel.test.tsx` — extend with tests for:
  - Horizontal scrolling (no `truncate` class, `overflow-x-auto` present)
  - Larger button sizes (min-w-7, min-h-7 classes)
  - Tooltip `title` attributes on all buttons
  - Wrap lines toggle visibility and behavior
  - Pagination controls (visible when totalCount > 500, hidden otherwise)
  - Loading indicator during page transition
- `src/components/SearchBar.test.tsx` — extend with:
  - Search history button tooltip (title="Search history")
- `src/hooks/useSearchUiStore.test.ts` — extend with:
  - `wrapLines` toggle behavior
  - Pagination state management (setPageResults, page reset on new search)
- `src/hooks/useLineSelectionKeyboard.test.ts` — extend with:
  - Shift+Down calls nextMatch
  - Shift+Up calls prevMatch
  - Works when focused on text input (not suppressed)
  - No-op when panel is not open

### Backend (cargo test)

Files to modify:
- `src-tauri/tests/search_test.rs` — extend with:
  - `search` with `offset: Some(500)` returns second page of results
  - `search` with `offset: None` returns first page (backward compatible)
  - `total_count` reflects full match count regardless of offset
  - `truncated` is false when offset + matches.len() >= total_count

## Key Files to Modify

| File | Changes |
|------|---------|
| `src-tauri/src/commands/types.rs` | Add `total_count: u32` to `SearchMatchBatch` |
| `src-tauri/src/commands/search.rs` | Add `offset: Option<u32>` param, compute `total_count` |
| `src/ipc/search.ts` | Add `offset` param to `search()` wrapper |
| `src/hooks/useSearchUiStore.ts` | Add `wrapLines`, `currentPage`, `totalCount`, `isPageLoading` |
| `src/hooks/useSearch.ts` | Pass offset, handle `total_count` in response |
| `src/hooks/useLineSelectionKeyboard.ts` | Add Shift+Up/Down handlers before `isTextInput` guard |
| `src/components/SearchResultsPanel.tsx` | Horizontal scroll, larger buttons, tooltips, wrap toggle, pagination |
| `src/components/SearchBar.tsx` | Add `title="Search history"` to clock button |

## Verification Checklist

After implementation, verify in the running app:

1. **Horizontal scroll**: Search a file with long lines → results show full
   content with horizontal scrollbar
2. **Larger buttons**: ↑ ↓ × buttons are visibly larger (≥28×28px)
3. **Tooltips**: Hover over ↑ → "Previous match (Shift+↑)", ↓ → "Next match
   (Shift+↓)", × → "Close search results", clock → "Search history"
4. **Shift+Up/Down**: With results open, press Shift+Down → next match selected;
   Shift+Up → previous match selected; works from search input focus
5. **Wrap toggle**: Click "Wrap lines" → long lines wrap; unclick → horizontal
   scroll returns; preserved across searches
6. **Pagination**: Search for a term with >500 matches → see page controls;
   click Next → page 2 loads with spinner; counter shows "501 of N"
7. **Page reset**: Perform new search while on page 2 → resets to page 1
