//! `add_file`, `list_files`, `get_file_properties`, `get_line`, `remove_file`
//! (contracts/ipc-commands.md, FR-002/FR-003/FR-027/FR-028).

use std::path::Path;
use std::sync::{Arc, RwLock};

use tauri::State;

use crate::commands::types::{FileProperties, LineContent, LogFileSummary};
use crate::error::{AppError, Result};
use crate::logfile::{mmap_index, timestamp, view_filter};
use crate::persistence::repo::{log_file_entry, workspace};
use crate::state::{AppState, FileIndex, FileRuntime, IndexState};

/// Builds the file's line-offset index and, once complete, detects its
/// timestamp format and parses per-line timestamps (research.md §4),
/// persisting `has_timestamp_format` if a format was detected (FR-011).
/// Intended to run on a blocking thread.
pub(crate) fn index_and_detect_timestamps(
    app_state: &AppState,
    runtime: &FileRuntime,
    file_mtime: Option<std::time::SystemTime>,
) {
    mmap_index::build_line_index(&runtime.mmap, &runtime.index);
    timestamp::detect_and_parse(&runtime.mmap, &runtime.index, file_mtime);

    if runtime.index.read().unwrap().timestamp_profile.is_some() {
        let db = app_state.db.lock().unwrap();
        let _ = log_file_entry::set_has_timestamp_format(&db, runtime.file_id, true);
    }

    runtime.index.write().unwrap().timestamp_detection_complete = true;
}

/// Default alias for a newly added file: its file name without extension
/// (FR-003).
fn default_alias(path: &Path) -> String {
    path.file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

/// Resolves `alias` to its open [`FileRuntime`], distinguishing "never added
/// to this workspace" (`FileNotFound`) from "added but not currently loaded"
/// (`FileUnavailable`).
pub(crate) fn resolve_runtime(state: &AppState, alias: &str) -> Result<Arc<FileRuntime>> {
    if let Some(runtime) = state.files.read().unwrap().get(alias) {
        return Ok(runtime.clone());
    }
    let workspace_id = *state.active_workspace_id.lock().unwrap();
    let db = state.db.lock().unwrap();
    match log_file_entry::find_by_alias(&db, workspace_id, alias)? {
        Some(_) => Err(AppError::FileUnavailable),
        None => Err(AppError::FileNotFound),
    }
}

/// Builds the `LogFileSummary` list for the active workspace from persisted
/// entries plus the in-memory `state.files` registry (FR-026).
pub(crate) fn list_file_summaries(state: &AppState) -> Result<Vec<LogFileSummary>> {
    let workspace_id = *state.active_workspace_id.lock().unwrap();
    let entries = {
        let db = state.db.lock().unwrap();
        log_file_entry::list_for_workspace(&db, workspace_id)?
    };

    let files = state.files.read().unwrap();
    Ok(entries
        .into_iter()
        .map(|entry| {
            let (available, indexing_complete) = match files.get(&entry.alias) {
                Some(runtime) => {
                    let index = runtime.index.read().unwrap();
                    (true, index.state == IndexState::Ready)
                }
                None => (false, false),
            };
            LogFileSummary {
                alias: entry.alias,
                path: entry.path,
                available,
                has_timestamp_format: entry.has_timestamp_format,
                indexing_complete,
            }
        })
        .collect())
}

/// Adds a file to the active workspace, canonicalizing its path, validating
/// it isn't already present (`FileAlreadyInWorkspace`/`AliasCollision`), and
/// kicking off the background line-offset index (research.md §2).
#[tauri::command]
#[specta::specta]
pub fn add_file(
    state: State<'_, Arc<AppState>>,
    path: String,
    alias: Option<String>,
) -> Result<LogFileSummary> {
    let canonical = std::fs::canonicalize(&path).map_err(|_| AppError::FileNotFound)?;
    let alias = alias.unwrap_or_else(|| default_alias(&canonical));
    let path_str = canonical.to_string_lossy().into_owned();

    let workspace_id = *state.active_workspace_id.lock().unwrap();
    let entry = {
        let db = state.db.lock().unwrap();
        let entry = log_file_entry::insert(&db, workspace_id, &path_str, &alias)?;
        workspace::touch(&db, workspace_id)?;
        entry
    };

    let mmap = match mmap_index::open(&canonical) {
        Ok(mmap) => mmap,
        Err(_) => {
            let db = state.db.lock().unwrap();
            let _ = log_file_entry::delete(&db, entry.id);
            return Err(AppError::FileNotFound);
        }
    };

    let runtime = Arc::new(FileRuntime {
        file_id: entry.id,
        mmap,
        index: RwLock::new(FileIndex::default()),
        view_filter: RwLock::new(None),
    });

    state
        .files
        .write()
        .unwrap()
        .insert(alias.clone(), runtime.clone());

    let file_mtime = std::fs::metadata(&path_str).and_then(|m| m.modified()).ok();
    let app_state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        index_and_detect_timestamps(&app_state, &runtime, file_mtime);
    });

    Ok(LogFileSummary {
        alias,
        path: path_str,
        available: true,
        has_timestamp_format: entry.has_timestamp_format,
        indexing_complete: false,
    })
}

/// Lists the files in the active workspace with their availability and
/// indexing status (FR-026).
#[tauri::command]
#[specta::specta]
pub fn list_files(state: State<'_, Arc<AppState>>) -> Result<Vec<LogFileSummary>> {
    list_file_summaries(&state)
}

/// Returns the epoch-ms of the first and last `Some` entries of
/// `line_timestamps`, in line order, or `(None, None)` if absent or empty
/// (research.md §5, data-model.md §4).
fn line_timestamp_bounds(line_timestamps: &Option<Vec<Option<i64>>>) -> (Option<f64>, Option<f64>) {
    let Some(timestamps) = line_timestamps else {
        return (None, None);
    };
    let (first, last) = view_filter::timestamp_bounds(timestamps);
    (first.map(|ms| ms as f64), last.map(|ms| ms as f64))
}

/// Returns line-count, timestamp-detection, and indexing status for one file
/// (FR-027). Shared by the `get_file_properties` Tauri command and the
/// `get_file_properties` MCP tool (FR-029).
pub(crate) fn file_properties(state: &AppState, alias: &str) -> Result<FileProperties> {
    let workspace_id = *state.active_workspace_id.lock().unwrap();
    let entry = {
        let db = state.db.lock().unwrap();
        log_file_entry::find_by_alias(&db, workspace_id, alias)?
    }
    .ok_or(AppError::FileNotFound)?;

    let files = state.files.read().unwrap();
    let (
        available,
        indexing_complete,
        total_lines,
        first_timestamp,
        last_timestamp,
        timestamp_offset_minutes,
    ) = match files.get(alias) {
        Some(runtime) => {
            let index = runtime.index.read().unwrap();
            let indexing_complete =
                index.state == IndexState::Ready && index.timestamp_detection_complete;
            let (first_timestamp, last_timestamp) =
                if entry.has_timestamp_format && indexing_complete {
                    line_timestamp_bounds(&index.line_timestamps)
                } else {
                    (None, None)
                };
            (
                true,
                indexing_complete,
                index.total_lines,
                first_timestamp,
                last_timestamp,
                index.utc_offset_minutes,
            )
        }
        None => (false, false, 0, None, None, 0),
    };

    Ok(FileProperties {
        total_lines: total_lines as u32,
        has_timestamp_format: entry.has_timestamp_format,
        available,
        indexing_complete,
        first_timestamp,
        last_timestamp,
        timestamp_offset_minutes,
    })
}

#[tauri::command]
#[specta::specta]
pub fn get_file_properties(
    state: State<'_, Arc<AppState>>,
    alias: String,
) -> Result<FileProperties> {
    file_properties(&state, &alias)
}

/// Returns the content of the 1-based `line_index` (FR-028). Shared by the
/// `get_line` Tauri command and the `get_line` MCP tool (FR-029).
pub(crate) fn line_content(state: &AppState, alias: &str, line_index: u32) -> Result<LineContent> {
    let runtime = resolve_runtime(state, alias)?;
    let index = runtime.index.read().unwrap();
    let bytes = mmap_index::line_bytes(&runtime.mmap, &index.line_offsets, line_index as usize)
        .ok_or(AppError::LineOutOfRange)?;
    Ok(LineContent {
        line_index,
        content: String::from_utf8_lossy(bytes).into_owned(),
    })
}

#[tauri::command]
#[specta::specta]
pub fn get_line(
    state: State<'_, Arc<AppState>>,
    alias: String,
    line_index: u32,
) -> Result<LineContent> {
    line_content(&state, &alias, line_index)
}

/// Removes a file (and its highlights/search history, via cascade) from the
/// active workspace.
#[tauri::command]
#[specta::specta]
pub fn remove_file(state: State<'_, Arc<AppState>>, alias: String) -> Result<()> {
    let workspace_id = *state.active_workspace_id.lock().unwrap();
    let entry = {
        let db = state.db.lock().unwrap();
        log_file_entry::find_by_alias(&db, workspace_id, &alias)?
    }
    .ok_or(AppError::FileNotFound)?;

    {
        let db = state.db.lock().unwrap();
        log_file_entry::delete(&db, entry.id)?;
        workspace::touch(&db, workspace_id)?;
    }
    state.files.write().unwrap().remove(&alias);
    Ok(())
}
