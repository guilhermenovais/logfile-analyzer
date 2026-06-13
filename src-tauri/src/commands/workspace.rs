//! `create_workspace`, `get_active_workspace`, `save_workspace`,
//! `discard_draft`, `list_saved_workspaces`, `open_workspace`, and
//! `is_workspace_dirty` (contracts/ipc-commands.md, FR-001, FR-004–FR-009,
//! FR-030).

use std::path::Path;
use std::sync::{Arc, RwLock};

use tauri::State;

use rusqlite::Connection;

use crate::commands::files::{index_and_detect_timestamps, list_file_summaries};
use crate::commands::types::{LogFileSummary, WorkspaceDirty, WorkspaceSummary};
use crate::error::{AppError, Result};
use crate::logfile::mmap_index;
use crate::persistence::repo::log_file_entry::LogFileEntry;
use crate::persistence::repo::{log_file_entry, settings, workspace};
use crate::state::{AppState, FileIndex, FileRuntime};

/// Resolves which workspace should be restored at startup (research.md §3):
/// the workspace recorded as last active, if it still exists, otherwise the
/// draft (FR-004/FR-006/FR-009).
pub fn resolve_startup_workspace(db: &Connection) -> Result<workspace::Workspace> {
    if let Some(id) = settings::get_last_active_workspace(db)? {
        if let Some(ws) = workspace::get(db, id)? {
            return Ok(ws);
        }
    }
    workspace::get_or_create_draft(db)
}

/// Opens each entry's mmap, registers a [`FileRuntime`] in `state.files` for
/// the ones that succeed, spawns background indexing for them, and returns a
/// [`LogFileSummary`] per entry with `available` reflecting whether the mmap
/// opened (FR-001/FR-002/FR-008). Shared by `open_workspace` and `setup()` so
/// startup restore uses the exact same per-file availability logic as a
/// manual workspace open (research.md §4, data-model.md "Session file load").
pub fn load_workspace_files(
    state: &Arc<AppState>,
    entries: Vec<LogFileEntry>,
) -> Vec<LogFileSummary> {
    let mut files = state.files.write().unwrap();

    let mut summaries = Vec::with_capacity(entries.len());
    for entry in entries {
        let available = match mmap_index::open(Path::new(&entry.path)) {
            Ok(mmap) => {
                let runtime = Arc::new(FileRuntime {
                    file_id: entry.id,
                    mmap,
                    index: RwLock::new(FileIndex::default()),
                });
                files.insert(entry.alias.clone(), runtime.clone());
                let app_state = state.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    index_and_detect_timestamps(&app_state, &runtime);
                });
                true
            }
            Err(_) => false,
        };

        summaries.push(LogFileSummary {
            alias: entry.alias,
            path: entry.path,
            available,
            has_timestamp_format: entry.has_timestamp_format,
            indexing_complete: false,
        });
    }

    summaries
}

/// Deletes the current draft (if any) and creates a fresh empty one,
/// returning it as the new active workspace. Shared by `create_workspace`
/// and `discard_draft`.
fn replace_draft_with_new(state: &AppState) -> Result<workspace::Workspace> {
    let new_workspace = {
        let db = state.db.lock().unwrap();
        if let Some(draft) = workspace::get_draft(&db)? {
            workspace::delete(&db, draft.id)?;
        }
        workspace::get_or_create_draft(&db)?
    };

    *state.active_workspace_id.lock().unwrap() = new_workspace.id;
    state.files.write().unwrap().clear();

    Ok(new_workspace)
}

/// Starts a new draft workspace, replacing the previous draft (the caller is
/// expected to resolve any save prompt for a dirty draft first, FR-006).
#[tauri::command]
#[specta::specta]
pub fn create_workspace(state: State<'_, Arc<AppState>>) -> Result<WorkspaceSummary> {
    let new_workspace = replace_draft_with_new(&state)?;

    Ok(WorkspaceSummary {
        id: new_workspace.id as i32,
        alias: new_workspace.alias,
        is_draft: new_workspace.is_draft,
        files: Vec::new(),
    })
}

/// Returns the active workspace and its files (FR-005/FR-030).
#[tauri::command]
#[specta::specta]
pub fn get_active_workspace(state: State<'_, Arc<AppState>>) -> Result<WorkspaceSummary> {
    let workspace_id = *state.active_workspace_id.lock().unwrap();
    let ws = {
        let db = state.db.lock().unwrap();
        workspace::get(&db, workspace_id)?
    }
    .ok_or(AppError::NoActiveWorkspace)?;

    let files = list_file_summaries(&state)?;

    Ok(WorkspaceSummary {
        id: ws.id as i32,
        alias: ws.alias,
        is_draft: ws.is_draft,
        files,
    })
}

/// Persists the active draft under `alias`, converting it into a saved
/// workspace (FR-008). Rejects with `WorkspaceAliasInUse` on collision.
#[tauri::command]
#[specta::specta]
pub fn save_workspace(state: State<'_, Arc<AppState>>, alias: String) -> Result<WorkspaceSummary> {
    let workspace_id = *state.active_workspace_id.lock().unwrap();
    let ws = {
        let db = state.db.lock().unwrap();
        workspace::save(&db, workspace_id, &alias)?
    };

    let files = list_file_summaries(&state)?;

    Ok(WorkspaceSummary {
        id: ws.id as i32,
        alias: ws.alias,
        is_draft: ws.is_draft,
        files,
    })
}

/// Drops the unsaved draft and starts a fresh one (FR-007).
#[tauri::command]
#[specta::specta]
pub fn discard_draft(state: State<'_, Arc<AppState>>) -> Result<()> {
    replace_draft_with_new(&state)?;
    Ok(())
}

/// Returns every saved (non-draft) workspace with its files, deriving
/// `available` from whether each file still exists on disk (FR-009).
#[tauri::command]
#[specta::specta]
pub fn list_saved_workspaces(state: State<'_, Arc<AppState>>) -> Result<Vec<WorkspaceSummary>> {
    let db = state.db.lock().unwrap();
    let workspaces = workspace::list_saved(&db)?;

    workspaces
        .into_iter()
        .map(|ws| {
            let entries = log_file_entry::list_for_workspace(&db, ws.id)?;
            let files = entries
                .into_iter()
                .map(|entry| LogFileSummary {
                    available: Path::new(&entry.path).exists(),
                    alias: entry.alias,
                    path: entry.path,
                    has_timestamp_format: entry.has_timestamp_format,
                    indexing_complete: false,
                })
                .collect();
            Ok(WorkspaceSummary {
                id: ws.id as i32,
                alias: ws.alias,
                is_draft: ws.is_draft,
                files,
            })
        })
        .collect()
}

/// Loads a previously saved workspace, making it the active workspace.
/// Files missing from disk are marked `available: false`; loading still
/// succeeds (Edge Cases, FR-009). The caller is expected to resolve any save
/// prompt for the previously active draft first.
#[tauri::command]
#[specta::specta]
pub fn open_workspace(state: State<'_, Arc<AppState>>, id: i32) -> Result<WorkspaceSummary> {
    let workspace_id = i64::from(id);
    let (ws, entries) = {
        let db = state.db.lock().unwrap();
        let ws = workspace::get(&db, workspace_id)?.ok_or(AppError::WorkspaceNotFound)?;
        let entries = log_file_entry::list_for_workspace(&db, workspace_id)?;
        (ws, entries)
    };

    *state.active_workspace_id.lock().unwrap() = ws.id;
    state.files.write().unwrap().clear();

    let summaries = load_workspace_files(state.inner(), entries);

    Ok(WorkspaceSummary {
        id: ws.id as i32,
        alias: ws.alias,
        is_draft: ws.is_draft,
        files: summaries,
    })
}

/// Returns whether the active workspace is an unsaved draft with content
/// that would be lost, driving the close/new-workspace save prompt
/// (FR-006).
#[tauri::command]
#[specta::specta]
pub fn is_workspace_dirty(state: State<'_, Arc<AppState>>) -> Result<WorkspaceDirty> {
    let workspace_id = *state.active_workspace_id.lock().unwrap();
    let db = state.db.lock().unwrap();
    let ws = workspace::get(&db, workspace_id)?.ok_or(AppError::NoActiveWorkspace)?;
    let has_files = !log_file_entry::list_for_workspace(&db, workspace_id)?.is_empty();

    Ok(WorkspaceDirty {
        dirty: ws.is_draft && has_files,
    })
}
