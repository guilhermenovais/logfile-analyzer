# IPC Contract Change: `get_file_properties` / `FileProperties`

Delta on top of `specs/001-log-analyzer-mcp-server/contracts/ipc-commands.md`.
Only `FileProperties` (and the `get_file_properties` Tauri command that
returns it) is affected; the `get_file_properties` MCP tool
(`GetFilePropertiesOutput`) and every other command/type keep their existing
contracts and signatures.

## `get_file_properties(alias: string) -> Result<FileProperties, AppError>`

Signature, error variants (`FileNotFound`), and existing fields are
unchanged.

### `FileProperties` (CHANGED — additive fields)

```ts
type FileProperties = {
  total_lines: number;
  has_timestamp_format: boolean;
  available: boolean;
  indexing_complete: boolean;
  first_timestamp: number | null; // NEW
  last_timestamp: number | null;  // NEW
};
```

| Field | Type | Description |
|-------|------|-------------|
| `first_timestamp` | `number \| null` | Epoch-ms timestamp of the first line containing a recognizable timestamp, or `null` if `has_timestamp_format` is `false`, indexing isn't complete yet, or no line matched (FR-011, US4). |
| `last_timestamp` | `number \| null` | Epoch-ms timestamp of the last line containing a recognizable timestamp, or `null` under the same conditions as `first_timestamp` (FR-011, US4). |

Both fields are derived from `FileIndex.line_timestamps`
(`Vec<Option<i64>>`, already populated by `timestamp::detect_and_parse`): the
first and last `Some` entries, in line order. No new file scan.

### Consumers

- **Tauri command `get_file_properties`** (`src-tauri/src/commands/files.rs`,
  `src/ipc/files.ts::getFileProperties`): gains the two fields automatically
  via the shared `FileProperties` struct/regenerated `src/bindings/index.ts`.
- **New frontend hook `useFileProperties(alias)`** (TanStack Query wrapper):
  the sole new consumer of these fields, used by `WorkspacePage` to pre-fill
  `useSearchUiStore`'s `timeFrom`/`timeTo` (FR-011–FR-013, research.md §6).
- **MCP tool `get_file_properties`** (`src-tauri/src/mcp/tools.rs`,
  `GetFilePropertiesOutput`): **unchanged** — it's constructed field-by-field
  from `FileProperties` and this feature does not add `first_timestamp`/
  `last_timestamp` to it (no MCP-facing requirement in this feature's FRs).
