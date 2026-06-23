# Data Model: Search UX Improvements

**Feature**: `020-search-ux-improvements` | **Date**: 2026-06-22

## 1. Modified Rust Types

### SearchMatchBatch (src-tauri/src/commands/types.rs)

```rust
// BEFORE
pub struct SearchMatchBatch {
    pub matches: Vec<SearchMatchEntry>,
    pub truncated: bool,
}

// AFTER — add total_count
pub struct SearchMatchBatch {
    pub matches: Vec<SearchMatchEntry>,
    pub truncated: bool,
    /// Total number of matches across all pages (before offset/limit slicing).
    pub total_count: u32,
}
```

**Impact**: Specta auto-generates the corresponding TypeScript type in
`src/bindings/index.ts`. All consumers of `SearchMatchBatch` must handle the
new field.

### search command signature (src-tauri/src/commands/search.rs)

```rust
// BEFORE
pub fn search(
    state: State<'_, Arc<AppState>>,
    alias: String,
    query: String,
    search_type: SearchType,
    time_from: Option<f64>,
    time_to: Option<f64>,
    channel: Channel<SearchMatchBatch>,
) -> Result<()>

// AFTER — add offset parameter
pub fn search(
    state: State<'_, Arc<AppState>>,
    alias: String,
    query: String,
    search_type: SearchType,
    time_from: Option<f64>,
    time_to: Option<f64>,
    offset: Option<u32>,
    channel: Channel<SearchMatchBatch>,
) -> Result<()>
```

**Behavior change**: When `offset` is `Some(n)`, skip the first `n` matches
before collecting up to `MAX_MATCH_BATCH` (500). `total_count` is always set
to the full number of matches found. `truncated` is true when
`total_count > offset + matches.len()`.

## 2. Modified Frontend State

### SearchUiState (src/hooks/useSearchUiStore.ts)

```typescript
// NEW fields added to SearchUiState interface
interface SearchUiState {
  // ... existing fields unchanged ...

  /** Whether long lines in results wrap (FR-010–FR-012). Default: false. */
  wrapLines: boolean;
  /** Current pagination page (0-based). Reset to 0 on new search (FR-016). */
  currentPage: number;
  /** Total matches across all pages, from backend total_count (FR-015). */
  totalCount: number;
  /** Whether a page transition is in progress (FR-017 loading indicator). */
  isPageLoading: boolean;
}
```

**Default values**:
```typescript
const DEFAULT_SEARCH_UI_STATE: SearchUiState = {
  // ... existing defaults unchanged ...
  wrapLines: false,
  currentPage: 0,
  totalCount: 0,
  isPageLoading: false,
};
```

**New store methods**:
```typescript
interface SearchUiStoreState {
  // ... existing methods unchanged ...

  /** Toggle wrap lines for results (FR-010). */
  toggleWrapLines: (alias: string) => void;
  /** Set pagination state from search response. */
  setPageResults: (
    alias: string,
    results: SearchMatchEntry[],
    truncated: boolean,
    totalCount: number,
    page: number,
  ) => void;
  /** Set page loading state (FR-017). */
  setPageLoading: (alias: string, loading: boolean) => void;
}
```

**Modified methods**:
- `setResults`: Now also accepts `totalCount`, sets `currentPage: 0`,
  `totalCount`, resets pagination state. Replaces direct calls to the existing
  `setResults` where the response now includes `total_count`.

## 3. Modified IPC Layer

### search() wrapper (src/ipc/search.ts)

```typescript
// BEFORE
export async function search(
  alias: string,
  query: string,
  searchType: SearchType,
  timeFrom: number | null,
  timeTo: number | null,
  onBatch: (batch: SearchMatchBatch) => void,
): Promise<void>

// AFTER — add offset parameter
export async function search(
  alias: string,
  query: string,
  searchType: SearchType,
  timeFrom: number | null,
  timeTo: number | null,
  onBatch: (batch: SearchMatchBatch) => void,
  offset?: number | null,
): Promise<void>
```

## 4. Constants

| Name | Location | Value | Purpose |
|------|----------|-------|---------|
| `MAX_MATCH_BATCH` | `search.rs:23` | 500 | Matches per page (unchanged) |
| `PAGE_SIZE` | `useSearchUiStore.ts` | 500 | Frontend mirror of backend page size |

## 5. Data Flow: Paginated Search

```text
User clicks "Next Page"
  → useSearch.runSearch(query, type, timeFrom, timeTo, offset=page*500)
    → ipc/search.ts: search(alias, query, type, timeFrom, timeTo, onBatch, offset)
      → Rust search command: scan_matches → filter_by_time_range → slice [offset..offset+500]
        → channel.send(SearchMatchBatch { matches, truncated, total_count })
      → onBatch callback
    → useSearchUiStore.setPageResults(alias, matches, truncated, totalCount, page)
      → Updates results, currentPage, totalCount, selects first match on new page
      → LogViewer scrolls to first match on new page
```

## 6. Data Flow: Wrap Toggle

```text
User clicks "Wrap lines" checkbox
  → useSearchUiStore.toggleWrapLines(alias)
    → wrapLines flipped in store
    → SearchResultsPanel re-renders with updated CSS classes
    → useEffect scrolls currently selected entry into view
```

## 7. No Database Changes

No schema changes required. Search history already captures all needed fields.
The pagination offset is not persisted — it's ephemeral UI state.

## 8. No New Tauri Capabilities

No new permissions needed. The `search` command already exists; adding an
`offset` parameter does not require a new capability entry.
