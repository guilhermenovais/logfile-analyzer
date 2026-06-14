//! MCP tool handlers (contracts/mcp-tools.md), operating on the shared
//! [`AppState`] so agents and the UI stay consistent (FR-029).

use std::sync::Arc;

use rmcp::handler::server::wrapper::{Json, Parameters};
use rmcp::{schemars, tool, tool_router};
use serde::{Deserialize, Serialize};

use crate::commands::{files, highlights};
use crate::error::AppError;
use crate::logfile::{query, search, timestamp};
use crate::persistence::repo::highlight::HighlightOrigin;
use crate::persistence::repo::search_history;
use crate::state::AppState;

/// Structured tool-error payload (contracts/mcp-tools.md "Common errors").
#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct McpToolError {
    pub kind: &'static str,
    pub message: String,
}

fn map_error(err: AppError) -> Json<McpToolError> {
    let kind = match &err {
        AppError::NoActiveWorkspace => "no_active_workspace",
        AppError::WorkspaceNotFound => "workspace_not_found",
        AppError::FileAlreadyInWorkspace => "file_already_in_workspace",
        AppError::AliasCollision => "alias_collision",
        AppError::WorkspaceAliasInUse => "workspace_alias_in_use",
        AppError::InvalidWorkspaceName => "invalid_workspace_name",
        AppError::FileNotFound => "file_not_found",
        AppError::FileUnavailable => "file_unavailable",
        AppError::LineOutOfRange => "line_out_of_range",
        AppError::InvalidQuery => "invalid_query",
        AppError::TimeRangeUnavailable => "time_range_unavailable",
        AppError::InvalidPort => "invalid_port",
        AppError::PortUnavailable(_) => "port_unavailable",
        AppError::Io(_) => "io_error",
    };
    Json(McpToolError {
        kind,
        message: err.to_string(),
    })
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct FileSummary {
    pub alias: String,
    pub available: bool,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct ListFilesOutput {
    pub files: Vec<FileSummary>,
}

#[derive(Debug, Default, Deserialize, schemars::JsonSchema)]
pub struct AliasInput {
    pub alias: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct GetFilePropertiesOutput {
    pub alias: String,
    pub total_lines: usize,
    pub has_timestamp_format: bool,
    pub available: bool,
    pub indexing_complete: bool,
}

#[derive(Debug, Default, Deserialize, schemars::JsonSchema)]
pub struct GetLineInput {
    pub alias: String,
    pub line_index: usize,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct LineContent {
    pub line_index: usize,
    pub content: String,
}

#[derive(Debug, Clone, Copy, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SearchTypeArg {
    Logical,
    Regex,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SearchWithContextInput {
    pub alias: String,
    pub query: String,
    pub search_type: SearchTypeArg,
    #[serde(default)]
    pub surrounding_count: Option<usize>,
    #[serde(default)]
    pub time_from: Option<String>,
    #[serde(default)]
    pub time_to: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct SearchMatch {
    pub line_index: usize,
    pub before: Vec<LineContent>,
    #[serde(rename = "match")]
    pub matched: LineContent,
    pub after: Vec<LineContent>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct SearchWithContextOutput {
    pub matches: Vec<SearchMatch>,
    pub truncated: bool,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct HighlightEntry {
    pub line_index: usize,
    pub content: String,
    pub label: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct ListHighlightsOutput {
    pub highlights: Vec<HighlightEntry>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SetHighlightInput {
    pub alias: String,
    pub line_index: usize,
    #[serde(default)]
    pub label: Option<String>,
}

#[derive(Debug, Default, Deserialize, schemars::JsonSchema)]
pub struct ClearHighlightInput {
    pub alias: String,
    pub line_index: usize,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct OkOutput {
    pub ok: bool,
}

/// MCP-facing view of the shared [`AppState`] (FR-029): every handler reads
/// and writes the same workspace state as the Tauri commands.
pub struct LogAnalyzerMcpServer {
    state: Arc<AppState>,
}

impl LogAnalyzerMcpServer {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }
}

#[tool_router(server_handler)]
impl LogAnalyzerMcpServer {
    #[tool(description = "List the aliases of all files in the active workspace.")]
    pub fn list_files(&self) -> Result<Json<ListFilesOutput>, Json<McpToolError>> {
        files::list_file_summaries(&self.state)
            .map(|summaries| {
                Json(ListFilesOutput {
                    files: summaries
                        .into_iter()
                        .map(|s| FileSummary {
                            alias: s.alias,
                            available: s.available,
                        })
                        .collect(),
                })
            })
            .map_err(map_error)
    }

    #[tool(description = "Retrieve a file's properties (total lines, indexing state, etc.).")]
    pub fn get_file_properties(
        &self,
        Parameters(input): Parameters<AliasInput>,
    ) -> Result<Json<GetFilePropertiesOutput>, Json<McpToolError>> {
        files::file_properties(&self.state, &input.alias)
            .map(|props| {
                Json(GetFilePropertiesOutput {
                    alias: input.alias,
                    total_lines: props.total_lines as usize,
                    has_timestamp_format: props.has_timestamp_format,
                    available: props.available,
                    indexing_complete: props.indexing_complete,
                })
            })
            .map_err(map_error)
    }

    #[tool(description = "Retrieve the content of a specific 1-based line index.")]
    pub fn get_line(
        &self,
        Parameters(input): Parameters<GetLineInput>,
    ) -> Result<Json<LineContent>, Json<McpToolError>> {
        u32::try_from(input.line_index)
            .map_err(|_| AppError::LineOutOfRange)
            .and_then(|line_index| files::line_content(&self.state, &input.alias, line_index))
            .map(|content| {
                Json(LineContent {
                    line_index: content.line_index as usize,
                    content: content.content,
                })
            })
            .map_err(map_error)
    }

    #[tool(
        description = "Search a file (logical AND/OR/NOT or regex) and return each match with surrounding lines."
    )]
    pub fn search_with_context(
        &self,
        Parameters(input): Parameters<SearchWithContextInput>,
    ) -> Result<Json<SearchWithContextOutput>, Json<McpToolError>> {
        run_search_with_context(&self.state, input)
            .map(Json)
            .map_err(map_error)
    }

    #[tool(description = "Retrieve highlighted lines for a file.")]
    pub fn list_highlights(
        &self,
        Parameters(input): Parameters<AliasInput>,
    ) -> Result<Json<ListHighlightsOutput>, Json<McpToolError>> {
        highlights::list_highlight_entries(&self.state, &input.alias)
            .map(|entries| {
                Json(ListHighlightsOutput {
                    highlights: entries
                        .into_iter()
                        .map(|e| HighlightEntry {
                            line_index: e.line_index as usize,
                            content: e.content,
                            label: e.label,
                        })
                        .collect(),
                })
            })
            .map_err(map_error)
    }

    #[tool(description = "Add or update a highlight (with optional label) on a line.")]
    pub fn set_highlight(
        &self,
        Parameters(input): Parameters<SetHighlightInput>,
    ) -> Result<Json<OkOutput>, Json<McpToolError>> {
        highlights::set_highlight_entry(
            &self.state,
            &input.alias,
            input.line_index,
            input.label,
            HighlightOrigin::McpAgent,
        )
        .map(|()| Json(OkOutput { ok: true }))
        .map_err(map_error)
    }

    #[tool(description = "Remove a highlight from a line.")]
    pub fn clear_highlight(
        &self,
        Parameters(input): Parameters<ClearHighlightInput>,
    ) -> Result<Json<OkOutput>, Json<McpToolError>> {
        highlights::clear_highlight_entry(&self.state, &input.alias, input.line_index)
            .map(|()| Json(OkOutput { ok: true }))
            .map_err(map_error)
    }
}

fn line_content_to_dto(line: query::LineContent) -> LineContent {
    LineContent {
        line_index: line.line_index,
        content: line.content,
    }
}

/// Parses an optional ISO-8601 `time_from`/`time_to` bound to epoch-ms,
/// mapping unparseable strings to `InvalidQuery`.
fn parse_time_bound(value: &Option<String>) -> Result<Option<i64>, AppError> {
    value
        .as_deref()
        .map(|s| timestamp::parse_iso8601(s).ok_or(AppError::InvalidQuery))
        .transpose()
}

/// Implements `search_with_context` (contracts/mcp-tools.md): compiles
/// `input.query`, scans the file with surrounding context, records a
/// `SearchHistoryEntry` (FR-024), and maps the result to the tool's output
/// shape. `time_from`/`time_to` are rejected with `TimeRangeUnavailable`
/// until timestamp detection (User Story 5) populates `timestamp_profile`.
fn run_search_with_context(
    state: &AppState,
    input: SearchWithContextInput,
) -> Result<SearchWithContextOutput, AppError> {
    let runtime = files::resolve_runtime(state, &input.alias)?;

    let search_type = match input.search_type {
        SearchTypeArg::Logical => search::SearchType::Logical,
        SearchTypeArg::Regex => search::SearchType::Regex,
    };
    let compiled = search::CompiledQuery::compile(search_type, &input.query)?;

    let has_time_range = input.time_from.is_some() || input.time_to.is_some();
    let time_from = parse_time_bound(&input.time_from)?;
    let time_to = parse_time_bound(&input.time_to)?;

    let index = runtime.index.read().unwrap();
    if has_time_range && index.timestamp_profile.is_none() {
        return Err(AppError::TimeRangeUnavailable);
    }

    let time_filter = has_time_range.then(|| {
        (
            index.line_timestamps.as_deref().unwrap_or(&[]),
            time_from,
            time_to,
        )
    });

    let surrounding_count = query::resolve_surrounding_count(input.surrounding_count);
    let result = query::search_with_context(
        &runtime.mmap,
        &index.line_offsets,
        &compiled,
        surrounding_count,
        time_filter,
    );
    drop(index);

    let history_search_type = match input.search_type {
        SearchTypeArg::Logical => search_history::SearchType::Logical,
        SearchTypeArg::Regex => search_history::SearchType::Regex,
    };
    {
        let db = state.db.lock().unwrap();
        let workspace_id = *state.active_workspace_id.lock().unwrap();
        search_history::record(
            &db,
            workspace_id,
            &input.query,
            history_search_type,
            time_from,
            time_to,
        )?;
    }

    Ok(SearchWithContextOutput {
        matches: result
            .matches
            .into_iter()
            .map(|m| SearchMatch {
                line_index: m.line_index,
                before: m.before.into_iter().map(line_content_to_dto).collect(),
                matched: line_content_to_dto(m.matched),
                after: m.after.into_iter().map(line_content_to_dto).collect(),
            })
            .collect(),
        truncated: result.truncated,
    })
}
