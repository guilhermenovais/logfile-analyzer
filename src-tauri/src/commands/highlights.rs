//! `set_highlight`, `clear_highlight`, `set_label`, `list_highlights`
//! (contracts/ipc-commands.md, FR-017–FR-020, FR-029).

use std::sync::Arc;

use tauri::State;

use crate::commands::files::resolve_runtime;
use crate::commands::types::HighlightEntry;
use crate::error::{AppError, Result};
use crate::logfile::mmap_index::line_bytes;
use crate::persistence::repo::highlight::{self, HighlightOrigin};
use crate::persistence::repo::workspace;
use crate::state::{AppState, FileRuntime};

/// Returns `Ok(())` if `line_index` (1-based) is within `runtime`'s indexed
/// lines, otherwise `LineOutOfRange` (contracts/mcp-tools.md "Common errors").
fn validate_line_index(runtime: &FileRuntime, line_index: usize) -> Result<()> {
    let index = runtime.index.read().unwrap();
    if line_bytes(&runtime.mmap, &index.line_offsets, line_index).is_none() {
        return Err(AppError::LineOutOfRange);
    }
    Ok(())
}

/// Creates/updates a highlight on `line_index` with `origin` (FR-017/FR-018).
/// Shared by the `set_highlight` Tauri command (`origin = user`) and the
/// `set_highlight` MCP tool (`origin = mcp_agent`, FR-029).
pub(crate) fn set_highlight_entry(
    state: &AppState,
    alias: &str,
    line_index: usize,
    label: Option<String>,
    origin: HighlightOrigin,
) -> Result<()> {
    let runtime = resolve_runtime(state, alias)?;
    validate_line_index(&runtime, line_index)?;

    let db = state.db.lock().unwrap();
    highlight::upsert(
        &db,
        runtime.file_id,
        line_index as i64,
        label.as_deref(),
        origin,
    )?;
    workspace::touch(&db, *state.active_workspace_id.lock().unwrap())?;
    Ok(())
}

/// Removes a highlight (and its label) from `line_index`, if present
/// (FR-017). Shared by the `clear_highlight` Tauri command and MCP tool
/// (FR-029).
pub(crate) fn clear_highlight_entry(
    state: &AppState,
    alias: &str,
    line_index: usize,
) -> Result<()> {
    let runtime = resolve_runtime(state, alias)?;
    let db = state.db.lock().unwrap();
    highlight::clear(&db, runtime.file_id, line_index as i64)?;
    workspace::touch(&db, *state.active_workspace_id.lock().unwrap())?;
    Ok(())
}

/// Updates (or clears) the label on `line_index`, preserving its existing
/// `origin` if already highlighted, otherwise creating a `user` highlight
/// with the given label (FR-018).
pub(crate) fn set_label_entry(
    state: &AppState,
    alias: &str,
    line_index: usize,
    label: Option<String>,
) -> Result<()> {
    let runtime = resolve_runtime(state, alias)?;
    validate_line_index(&runtime, line_index)?;

    let db = state.db.lock().unwrap();
    let origin = highlight::get_by_line(&db, runtime.file_id, line_index as i64)?
        .map(|h| h.origin)
        .unwrap_or(HighlightOrigin::User);
    highlight::upsert(
        &db,
        runtime.file_id,
        line_index as i64,
        label.as_deref(),
        origin,
    )?;
    workspace::touch(&db, *state.active_workspace_id.lock().unwrap())?;
    Ok(())
}

/// Returns every highlighted line for `alias` with its current content
/// (FR-020). Shared by the `list_highlights` Tauri command and MCP tool
/// (FR-029).
pub(crate) fn list_highlight_entries(state: &AppState, alias: &str) -> Result<Vec<HighlightEntry>> {
    let runtime = resolve_runtime(state, alias)?;
    let highlights = {
        let db = state.db.lock().unwrap();
        highlight::list_for_file(&db, runtime.file_id)?
    };

    let index = runtime.index.read().unwrap();
    Ok(highlights
        .into_iter()
        .map(|h| {
            let content = line_bytes(&runtime.mmap, &index.line_offsets, h.line_index as usize)
                .map(|bytes| String::from_utf8_lossy(bytes).into_owned())
                .unwrap_or_default();
            HighlightEntry {
                line_index: h.line_index as u32,
                content,
                label: h.label,
                origin: h.origin,
            }
        })
        .collect())
}

#[tauri::command]
#[specta::specta]
pub fn set_highlight(
    state: State<'_, Arc<AppState>>,
    alias: String,
    line_index: u32,
    label: Option<String>,
) -> Result<()> {
    set_highlight_entry(
        &state,
        &alias,
        line_index as usize,
        label,
        HighlightOrigin::User,
    )
}

#[tauri::command]
#[specta::specta]
pub fn clear_highlight(
    state: State<'_, Arc<AppState>>,
    alias: String,
    line_index: u32,
) -> Result<()> {
    clear_highlight_entry(&state, &alias, line_index as usize)
}

#[tauri::command]
#[specta::specta]
pub fn set_label(
    state: State<'_, Arc<AppState>>,
    alias: String,
    line_index: u32,
    label: Option<String>,
) -> Result<()> {
    set_label_entry(&state, &alias, line_index as usize, label)
}

#[tauri::command]
#[specta::specta]
pub fn list_highlights(
    state: State<'_, Arc<AppState>>,
    alias: String,
) -> Result<Vec<HighlightEntry>> {
    list_highlight_entries(&state, &alias)
}
