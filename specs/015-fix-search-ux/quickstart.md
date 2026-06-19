# Quickstart: Fix Search UX

## Prerequisites

- Node.js, pnpm, Rust toolchain (see project README)
- `pnpm install` in project root

## Development

```bash
# Frontend dev server (hot reload)
pnpm dev

# Type check
pnpm exec tsc --noEmit

# Lint
pnpm exec eslint .

# Frontend tests
pnpm test
```

## Files to Modify

1. **`src/App.css`** — Add `.scrollbar-visible` utility class
2. **`src/components/SearchResultsPanel.tsx`** — Border placeholder, scrollbar class, shrink-0
3. **`src/components/SearchBar.tsx`** — Add shrink-0, min-w-0 on input wrapper
4. **`src/pages/WorkspacePage.tsx`** — Ensure layout constraints on non-LogViewer children

## Testing Strategy

- **Visual**: Run `pnpm tauri dev`, load a file, search for a common term, verify:
  - All toolbar controls visible (Story 1)
  - Click a result → main view scrolls to it (Story 2)
  - Scrollbar visible in results panel when many results (Story 3)
  - No text shift on selection/deselection in results (Story 4)
- **Unit tests**: Update `SearchResultsPanel.test.tsx` and `SearchBar.test.tsx` for className assertions
- **Quality gates**: `tsc --noEmit`, `eslint .`, `pnpm test` must all pass

## Key Patterns

- **Border placeholder**: `border-2 border-transparent` → `border-2 border-selected-line` on selection (see `LogLine.tsx:39-48`)
- **Flex layout**: Non-scrollable children use `shrink-0`; the scrollable LogViewer uses `flex-1 overflow-hidden`
- **State flow**: `useSearchUiStore` → `selectMatch` → `scrollNonce` → `LogViewer` scroll effect
