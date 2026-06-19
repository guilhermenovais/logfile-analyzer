# Quickstart: Fix Line Wrap Layout

**Feature Branch**: `014-fix-line-wrap-layout`
**Date**: 2026-06-19

## What this feature does

Fixes two layout bugs in the log viewer:
1. **Wrapped lines overlap**: When "wrap lines" is enabled, long lines wrap but their containers stay at a fixed 20px height, causing text to overlap adjacent lines.
2. **Selection border shifts content**: Clicking a line to select it adds a 2px blue border that shifts the text inside the line.

## Files to change

| File | Change |
|------|--------|
| `src/components/LogLine.tsx` | Add permanent transparent border; swap to colored border on selection |
| `src/components/LogViewer.tsx` | Enable TanStack Virtual's `measureElement` for dynamic row heights; invalidate measurements on `wrap` toggle |
| `src/components/LogLine.test.tsx` | Update tests for the new border behavior |
| `src/components/LogViewer.test.tsx` | Update tests to account for `data-index` attribute and `ref` callback |

## How to verify

1. Run `npm run dev` (or `cargo tauri dev`)
2. Open a log file with long lines
3. Toggle "Wrap lines" on — verify no overlap between lines
4. Click a line to select it — verify no text shift
5. Resize the window while wrap is on — verify lines re-wrap without overlap
6. Toggle wrap off — verify lines return to single-row, horizontal scroll
7. Scroll rapidly through a large file with wrap on — verify smooth performance

## Key decisions

- **Dynamic measurement via `measureElement`** over manual height calculation (research.md R-001, R-003)
- **Transparent border** over outline or padding swap for selection stability (research.md R-002)
- No new state, stores, or IPC — pure frontend fix
