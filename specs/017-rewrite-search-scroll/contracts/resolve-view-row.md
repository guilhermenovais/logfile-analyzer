# Contract: `resolve_view_row`

## Purpose

Maps a 1-based file line index to its 1-based view-row under the current view
filter for `alias`. Used by the frontend scroll mechanism to compute the correct
virtualizer index before calling `scrollToIndex`.

## IPC Signature

**Rust command**: `resolve_view_row(alias: String, line_index: u32) -> Result<u32>`
**Frontend wrapper**: `resolveViewRow(alias: string, lineIndex: number) -> Promise<number>`

## Behaviour

| Condition | Result |
|-----------|--------|
| No view filter active (`view_filter` is `None`) | Returns `line_index` (identity) |
| View filter active, `line_index` found | Returns `position + 1` (1-based view-row) |
| View filter active, `line_index` not found | Returns `Err(LineOutOfRange)` |
| File not loaded | Returns `Err(FileNotFound)` or `Err(FileUnavailable)` |

## Implementation Notes

- Uses `Vec::binary_search` on the `view_filter` Vec (sorted, ascending 1-based
  file line indices). O(log n) time, no allocation.
- Reuses `resolve_runtime` from `commands::files` for alias → runtime resolution.
- Acquires a read lock on `FileRuntime.view_filter` (same lock pattern as
  `stream_lines`).

## Capability

Uses existing `default` capability — no new permissions required (the command
reads in-memory state, no filesystem or shell access).

## Registration

Add `viewing::resolve_view_row` to `specta_builder()` in `src-tauri/src/lib.rs`.
Specta will auto-generate the TS binding in `src/bindings/index.ts`.
