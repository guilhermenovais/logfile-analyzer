//! `search`, `search_with_context`, `get_search_history` (contracts/ipc-commands.md,
//! FR-021–FR-025, FR-029).

use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::State;

use crate::commands::files::resolve_runtime;
use crate::commands::types::{
    ContextMatch, LineContent, SearchHistoryEntry, SearchMatchBatch, SearchMatchEntry,
    SearchWithContextBatch,
};
use crate::error::{AppError, Result};
use crate::logfile::mmap_index::line_bytes;
use crate::logfile::query as lf_query;
use crate::logfile::search::{scan_matches, CompiledQuery, SearchType as EngineSearchType};
use crate::persistence::repo::search_history::{self, SearchType};
use crate::persistence::repo::workspace;
use crate::state::AppState;

/// Soft cap on the number of matches sent per `SearchMatchBatch` (Principle VI).
const MAX_MATCH_BATCH: usize = 500;

fn engine_search_type(search_type: SearchType) -> EngineSearchType {
    match search_type {
        SearchType::Logical => EngineSearchType::Logical,
        SearchType::Regex => EngineSearchType::Regex,
    }
}

fn line_content_to_dto(line: lf_query::LineContent) -> LineContent {
    LineContent {
        line_index: line.line_index as u32,
        content: line.content,
    }
}

fn context_match_to_dto(m: lf_query::ContextMatch) -> ContextMatch {
    ContextMatch {
        line_index: m.line_index as u32,
        before: m.before.into_iter().map(line_content_to_dto).collect(),
        matched: line_content_to_dto(m.matched),
        after: m.after.into_iter().map(line_content_to_dto).collect(),
    }
}

/// Streams every matching line for `query` over `alias` (FR-021–FR-023) and
/// records the search in history (FR-024). Shared with the MCP layer via
/// the same `logfile::search` engine (FR-029).
#[tauri::command]
#[specta::specta]
pub fn search(
    state: State<'_, Arc<AppState>>,
    alias: String,
    query: String,
    search_type: SearchType,
    time_from: Option<f64>,
    time_to: Option<f64>,
    channel: Channel<SearchMatchBatch>,
) -> Result<()> {
    let runtime = resolve_runtime(&state, &alias)?;
    let compiled = CompiledQuery::compile(engine_search_type(search_type), &query)?;

    let index = runtime.index.read().unwrap();
    if (time_from.is_some() || time_to.is_some()) && index.timestamp_profile.is_none() {
        return Err(AppError::TimeRangeUnavailable);
    }

    let mut match_indices = scan_matches(&runtime.mmap, &index.line_offsets, &compiled);
    if time_from.is_some() || time_to.is_some() {
        let effective_timestamps = index.effective_timestamps.as_deref().unwrap_or(&[]);
        match_indices = lf_query::filter_by_time_range(
            match_indices,
            effective_timestamps,
            time_from.map(|v| v as i64),
            time_to.map(|v| v as i64),
        );
    }

    let truncated = match_indices.len() > MAX_MATCH_BATCH;
    let matches = match_indices
        .into_iter()
        .take(MAX_MATCH_BATCH)
        .map(|line_index| {
            let content = line_bytes(&runtime.mmap, &index.line_offsets, line_index)
                .map(|bytes| String::from_utf8_lossy(bytes).into_owned())
                .unwrap_or_default();
            SearchMatchEntry {
                line_index: line_index as u32,
                content,
            }
        })
        .collect();
    drop(index);

    channel
        .send(SearchMatchBatch { matches, truncated })
        .map_err(|err| AppError::Io(err.to_string()))?;

    let db = state.db.lock().unwrap();
    let workspace_id = *state.active_workspace_id.lock().unwrap();
    search_history::record(
        &db,
        workspace_id,
        &query,
        search_type,
        time_from.map(|v| v as i64),
        time_to.map(|v| v as i64),
    )?;
    workspace::touch(&db, workspace_id)?;

    Ok(())
}

/// Streams every match for `query` over `alias` with up to `surrounding_count`
/// lines of context (FR-021–FR-025) and records the search in history
/// (FR-024). Shares the windowing logic with the MCP `search_with_context`
/// tool (FR-029).
#[allow(clippy::too_many_arguments)] // each parameter is a distinct IPC argument (contracts/ipc-commands.md)
#[tauri::command]
#[specta::specta]
pub fn search_with_context(
    state: State<'_, Arc<AppState>>,
    alias: String,
    query: String,
    search_type: SearchType,
    surrounding_count: Option<u32>,
    time_from: Option<f64>,
    time_to: Option<f64>,
    channel: Channel<SearchWithContextBatch>,
) -> Result<()> {
    let runtime = resolve_runtime(&state, &alias)?;
    let compiled = CompiledQuery::compile(engine_search_type(search_type), &query)?;

    let index = runtime.index.read().unwrap();
    if (time_from.is_some() || time_to.is_some()) && index.timestamp_profile.is_none() {
        return Err(AppError::TimeRangeUnavailable);
    }

    let time_filter = if time_from.is_some() || time_to.is_some() {
        Some((
            index.effective_timestamps.as_deref().unwrap_or(&[]),
            time_from.map(|v| v as i64),
            time_to.map(|v| v as i64),
        ))
    } else {
        None
    };

    let surrounding = lf_query::resolve_surrounding_count(surrounding_count.map(|c| c as usize));
    let result = lf_query::search_with_context(
        &runtime.mmap,
        &index.line_offsets,
        &compiled,
        surrounding,
        time_filter,
    );
    drop(index);

    channel
        .send(SearchWithContextBatch {
            matches: result
                .matches
                .into_iter()
                .map(context_match_to_dto)
                .collect(),
            truncated: result.truncated,
        })
        .map_err(|err| AppError::Io(err.to_string()))?;

    let db = state.db.lock().unwrap();
    let workspace_id = *state.active_workspace_id.lock().unwrap();
    search_history::record(
        &db,
        workspace_id,
        &query,
        search_type,
        time_from.map(|v| v as i64),
        time_to.map(|v| v as i64),
    )?;
    workspace::touch(&db, workspace_id)?;

    Ok(())
}

/// Returns the active workspace's recorded search history, most recently
/// used first (FR-013/FR-024).
#[tauri::command]
#[specta::specta]
pub fn get_search_history(state: State<'_, Arc<AppState>>) -> Result<Vec<SearchHistoryEntry>> {
    let db = state.db.lock().unwrap();
    let workspace_id = *state.active_workspace_id.lock().unwrap();
    let entries = search_history::list_for_workspace(&db, workspace_id)?;
    Ok(entries
        .into_iter()
        .map(|entry| SearchHistoryEntry {
            id: entry.id as i32,
            workspace_id: entry.workspace_id as i32,
            query: entry.query,
            search_type: entry.search_type,
            time_from: entry.time_from.map(|v| v as f64),
            time_to: entry.time_to.map(|v| v as f64),
            last_used_at: entry.last_used_at,
        })
        .collect())
}
