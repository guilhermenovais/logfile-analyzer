//! Shared response DTOs for the Tauri command layer (contracts/ipc-commands.md).

use serde::{Deserialize, Serialize};

use crate::persistence::repo::highlight::HighlightOrigin;
use crate::persistence::repo::search_history::SearchType;

/// `LogFileSummary` (contracts/ipc-commands.md).
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct LogFileSummary {
    pub alias: String,
    pub path: String,
    pub available: bool,
    pub has_timestamp_format: bool,
    pub indexing_complete: bool,
}

/// `WorkspaceSummary` (contracts/ipc-commands.md).
///
/// `id` is `i32`, not the SQLite `i64` primary key: `specta`/`tauri-specta`
/// forbid exporting 64-bit integers (precision loss as JS `number`), and
/// workspace ids never approach `i32::MAX`.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct WorkspaceSummary {
    pub id: i32,
    pub alias: Option<String>,
    pub is_draft: bool,
    pub files: Vec<LogFileSummary>,
}

/// `{ dirty }` result of `is_workspace_dirty` (contracts/ipc-commands.md, FR-006).
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct WorkspaceDirty {
    pub dirty: bool,
}

/// `FileProperties` (contracts/ipc-commands.md, FR-027).
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct FileProperties {
    pub total_lines: u32,
    pub has_timestamp_format: bool,
    pub available: bool,
    pub indexing_complete: bool,
}

/// `{ line_index, content }` result of `get_line` (contracts/ipc-commands.md, FR-028).
///
/// `line_index` is `u32` (1-based, contracts/ipc-commands.md): `specta`
/// forbids exporting `usize` to TS.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct LineContent {
    pub line_index: u32,
    pub content: String,
}

/// `LineBatch` streamed by `stream_lines` (contracts/ipc-commands.md, FR-014/FR-032).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct LineBatch {
    pub start_index: u32,
    pub lines: Vec<String>,
}

/// `IndexProgress` streamed by `subscribe_index_progress` (contracts/ipc-commands.md, SC-001).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct IndexProgress {
    pub indexed_lines: u32,
    pub complete: bool,
}

/// One match entry in a `SearchMatchBatch` (contracts/ipc-commands.md, FR-021–FR-023).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SearchMatchEntry {
    pub line_index: u32,
    pub content: String,
}

/// `SearchMatchBatch` streamed by `search` (contracts/ipc-commands.md).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SearchMatchBatch {
    pub matches: Vec<SearchMatchEntry>,
}

/// A single match with its surrounding context, as streamed by
/// `search_with_context` (contracts/ipc-commands.md; shared shape with the
/// MCP `search_with_context` tool, FR-029).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ContextMatch {
    pub line_index: u32,
    pub before: Vec<LineContent>,
    #[serde(rename = "match")]
    pub matched: LineContent,
    pub after: Vec<LineContent>,
}

/// `SearchWithContextBatch` streamed by `search_with_context` (contracts/ipc-commands.md).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SearchWithContextBatch {
    pub matches: Vec<ContextMatch>,
    pub truncated: bool,
}

/// `Highlight` (contracts/ipc-commands.md, FR-020): a highlighted line with
/// its current content (FR-029, shared shape with the MCP `list_highlights`
/// tool).
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct HighlightEntry {
    pub line_index: u32,
    pub content: String,
    pub label: Option<String>,
    pub origin: HighlightOrigin,
}

/// `SearchHistoryEntry` (contracts/ipc-commands.md, FR-024).
///
/// `id`/`file_id` are `i32` and `time_from`/`time_to` are `f64`, not the
/// SQLite `i64` columns: `specta`/`tauri-specta` forbid exporting 64-bit
/// integers (precision loss as JS `number`), and these values never
/// approach the limits of either type.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct SearchHistoryEntry {
    pub id: i32,
    pub file_id: i32,
    pub query: String,
    pub search_type: SearchType,
    pub time_from: Option<f64>,
    pub time_to: Option<f64>,
    pub executed_at: String,
}
