//! Integration tests (Tauri mock runtime) for `commands::workspace::{save_workspace,
//! discard_draft, list_saved_workspaces, open_workspace, is_workspace_dirty}`
//! (contracts/ipc-commands.md, FR-005–FR-009).

use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use logfile_analyzer_lib::commands::{files, workspace};
use logfile_analyzer_lib::error::AppError;
use logfile_analyzer_lib::persistence::repo::workspace as workspace_repo;
use logfile_analyzer_lib::persistence::repo::{log_file_entry, settings};
use logfile_analyzer_lib::persistence::schema;
use logfile_analyzer_lib::state::AppState;

use rusqlite::Connection;
use tauri::Manager;

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn write_temp_file(name: &str, contents: &[u8]) -> PathBuf {
    let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut path = std::env::temp_dir();
    path.push(format!(
        "workspace_persistence_test_{}_{unique}_{name}",
        std::process::id()
    ));
    File::create(&path).unwrap().write_all(contents).unwrap();
    path
}

fn mock_app() -> tauri::App<tauri::test::MockRuntime> {
    let conn = Connection::open_in_memory().unwrap();
    schema::migrate(&conn).unwrap();
    let ws = workspace_repo::get_or_create_draft(&conn).unwrap();
    let state = Arc::new(AppState::new(conn, ws.id));

    tauri::test::mock_builder()
        .manage(state)
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap()
}

#[test]
fn save_workspace_converts_draft_and_keeps_files() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();

    let path = write_temp_file("a", b"line one\n");
    files::add_file(state.clone(), path.to_string_lossy().into_owned(), None).unwrap();

    let saved = workspace::save_workspace(state.clone(), "my-investigation".into()).unwrap();

    assert_eq!(saved.alias, Some("my-investigation".to_string()));
    assert!(!saved.is_draft);
    assert_eq!(saved.files.len(), 1);
    assert!(saved.files[0].available);
}

#[test]
fn save_workspace_rejects_alias_collision() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();

    workspace::save_workspace(state.clone(), "taken".into()).unwrap();
    workspace::create_workspace(state.clone()).unwrap();

    let err = workspace::save_workspace(state.clone(), "taken".into()).unwrap_err();
    assert!(matches!(err, AppError::WorkspaceAliasInUse));
}

#[test]
fn discard_draft_clears_files_and_starts_fresh_draft() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();

    let path = write_temp_file("a", b"line one\n");
    files::add_file(state.clone(), path.to_string_lossy().into_owned(), None).unwrap();

    workspace::discard_draft(state.clone()).unwrap();

    let active = workspace::get_active_workspace(state.clone()).unwrap();
    assert!(active.is_draft);
    assert!(active.files.is_empty());
}

#[test]
fn is_workspace_dirty_reflects_state_changes() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();

    let initial = workspace::is_workspace_dirty(state.clone()).unwrap();
    assert!(!initial.dirty);

    let path = write_temp_file("a", b"line one\n");
    files::add_file(state.clone(), path.to_string_lossy().into_owned(), None).unwrap();

    let after_change = workspace::is_workspace_dirty(state.clone()).unwrap();
    assert!(after_change.dirty);
}

#[test]
fn open_workspace_marks_missing_files_unavailable_and_loads_available_ones() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();

    let present_path = write_temp_file("present", b"line one\n");
    let missing_path = write_temp_file("missing", b"line two\n");
    files::add_file(
        state.clone(),
        present_path.to_string_lossy().into_owned(),
        Some("present".into()),
    )
    .unwrap();
    files::add_file(
        state.clone(),
        missing_path.to_string_lossy().into_owned(),
        Some("missing".into()),
    )
    .unwrap();

    let saved = workspace::save_workspace(state.clone(), "ws-with-missing".into()).unwrap();
    workspace::create_workspace(state.clone()).unwrap();
    std::fs::remove_file(&missing_path).unwrap();

    let opened = workspace::open_workspace(state.clone(), saved.id).unwrap();

    assert!(!opened.is_draft);
    assert_eq!(opened.alias, Some("ws-with-missing".to_string()));

    let present = opened.files.iter().find(|f| f.alias == "present").unwrap();
    assert!(present.available);
    let missing = opened.files.iter().find(|f| f.alias == "missing").unwrap();
    assert!(!missing.available);
}

#[test]
fn list_saved_workspaces_returns_only_saved() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();

    workspace::save_workspace(state.clone(), "saved-one".into()).unwrap();
    workspace::create_workspace(state.clone()).unwrap();

    let saved = workspace::list_saved_workspaces(state.clone()).unwrap();
    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0].alias, Some("saved-one".to_string()));
    assert!(!saved[0].is_draft);
}

#[test]
fn open_workspace_unknown_id_is_workspace_not_found() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();

    let err = workspace::open_workspace(state.clone(), 999_999).unwrap_err();
    assert!(matches!(err, AppError::WorkspaceNotFound));
}

/// Builds a fresh `AppState` with empty `state.files`, mirroring `setup()`
/// immediately after `AppState::new`.
fn fresh_state(active_workspace_id: i64) -> Arc<AppState> {
    let conn = Connection::open_in_memory().unwrap();
    schema::migrate(&conn).unwrap();
    Arc::new(AppState::new(conn, active_workspace_id))
}

fn test_conn() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    schema::migrate(&conn).unwrap();
    conn
}

#[test]
fn resolve_startup_workspace_returns_last_active_saved_workspace() {
    let conn = test_conn();
    let draft = workspace_repo::get_or_create_draft(&conn).unwrap();
    let saved = workspace_repo::save(&conn, draft.id, "incident-42").unwrap();
    workspace_repo::get_or_create_draft(&conn).unwrap();

    settings::set_last_active_workspace(&conn, saved.id).unwrap();

    let resolved = workspace::resolve_startup_workspace(&conn).unwrap();
    assert_eq!(resolved.id, saved.id);
    assert_eq!(resolved.alias, Some("incident-42".to_string()));
}

#[test]
fn resolve_startup_workspace_returns_last_active_draft_workspace() {
    let conn = test_conn();
    let draft = workspace_repo::get_or_create_draft(&conn).unwrap();

    settings::set_last_active_workspace(&conn, draft.id).unwrap();

    let resolved = workspace::resolve_startup_workspace(&conn).unwrap();
    assert_eq!(resolved.id, draft.id);
    assert!(resolved.is_draft);
}

#[test]
fn resolve_startup_workspace_falls_back_to_draft_when_last_active_deleted() {
    let conn = test_conn();
    let draft = workspace_repo::get_or_create_draft(&conn).unwrap();
    let saved = workspace_repo::save(&conn, draft.id, "incident-42").unwrap();
    let new_draft = workspace_repo::get_or_create_draft(&conn).unwrap();

    settings::set_last_active_workspace(&conn, saved.id).unwrap();
    workspace_repo::delete(&conn, saved.id).unwrap();

    let resolved = workspace::resolve_startup_workspace(&conn).unwrap();
    assert_eq!(resolved.id, new_draft.id);
    assert!(resolved.is_draft);
}

#[test]
fn resolve_startup_workspace_falls_back_to_draft_when_no_record_exists() {
    let conn = test_conn();
    let draft = workspace_repo::get_or_create_draft(&conn).unwrap();

    let resolved = workspace::resolve_startup_workspace(&conn).unwrap();
    assert_eq!(resolved.id, draft.id);
    assert!(resolved.is_draft);
}

#[test]
fn startup_restore_of_saved_workspace_marks_one_missing_file_unavailable() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();

    let present_path = write_temp_file("present", b"line one\n");
    let missing_path = write_temp_file("missing", b"line two\n");
    files::add_file(
        state.clone(),
        present_path.to_string_lossy().into_owned(),
        Some("present".into()),
    )
    .unwrap();
    files::add_file(
        state.clone(),
        missing_path.to_string_lossy().into_owned(),
        Some("missing".into()),
    )
    .unwrap();

    let saved = workspace::save_workspace(state.clone(), "incident-42".into()).unwrap();

    {
        let db = state.db.lock().unwrap();
        settings::set_last_active_workspace(&db, saved.id.into()).unwrap();
    }

    std::fs::remove_file(&missing_path).unwrap();

    let (resolved, entries) = {
        let db = state.db.lock().unwrap();
        let resolved = workspace::resolve_startup_workspace(&db).unwrap();
        let entries = log_file_entry::list_for_workspace(&db, resolved.id).unwrap();
        (resolved, entries)
    };

    assert_eq!(resolved.alias, Some("incident-42".to_string()));

    let startup_state = fresh_state(resolved.id);
    let summaries = workspace::load_workspace_files(&startup_state, entries);

    let present = summaries.iter().find(|f| f.alias == "present").unwrap();
    assert!(present.available);
    let missing = summaries.iter().find(|f| f.alias == "missing").unwrap();
    assert!(!missing.available);
}

#[test]
fn startup_restore_of_saved_workspace_handles_all_files_missing() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();

    let path_a = write_temp_file("a", b"line one\n");
    let path_b = write_temp_file("b", b"line two\n");
    files::add_file(
        state.clone(),
        path_a.to_string_lossy().into_owned(),
        Some("a".into()),
    )
    .unwrap();
    files::add_file(
        state.clone(),
        path_b.to_string_lossy().into_owned(),
        Some("b".into()),
    )
    .unwrap();

    let saved = workspace::save_workspace(state.clone(), "incident-42".into()).unwrap();

    {
        let db = state.db.lock().unwrap();
        settings::set_last_active_workspace(&db, saved.id.into()).unwrap();
    }

    std::fs::remove_file(&path_a).unwrap();
    std::fs::remove_file(&path_b).unwrap();

    let (resolved, entries) = {
        let db = state.db.lock().unwrap();
        let resolved = workspace::resolve_startup_workspace(&db).unwrap();
        let entries = log_file_entry::list_for_workspace(&db, resolved.id).unwrap();
        (resolved, entries)
    };

    assert_eq!(resolved.alias, Some("incident-42".to_string()));

    let startup_state = fresh_state(resolved.id);
    let summaries = workspace::load_workspace_files(&startup_state, entries);

    assert_eq!(summaries.len(), 2);
    assert!(summaries.iter().all(|f| !f.available));
}

#[test]
fn resolve_startup_workspace_is_stable_across_repeated_round_trips() {
    let conn = test_conn();
    let draft = workspace_repo::get_or_create_draft(&conn).unwrap();
    let saved = workspace_repo::save(&conn, draft.id, "incident-42").unwrap();

    for _ in 0..5 {
        settings::set_last_active_workspace(&conn, saved.id).unwrap();
        let resolved = workspace::resolve_startup_workspace(&conn).unwrap();
        assert_eq!(resolved.id, saved.id);
        assert_eq!(resolved.alias, Some("incident-42".to_string()));
    }
}

#[test]
fn load_workspace_files_loads_all_present_files() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();

    let path_a = write_temp_file("a", b"line one\n");
    let path_b = write_temp_file("b", b"line two\n");
    files::add_file(
        state.clone(),
        path_a.to_string_lossy().into_owned(),
        Some("a".into()),
    )
    .unwrap();
    files::add_file(
        state.clone(),
        path_b.to_string_lossy().into_owned(),
        Some("b".into()),
    )
    .unwrap();

    let workspace_id = *state.active_workspace_id.lock().unwrap();
    let entries = {
        let db = state.db.lock().unwrap();
        log_file_entry::list_for_workspace(&db, workspace_id).unwrap()
    };

    let startup_state = fresh_state(workspace_id);
    let summaries = workspace::load_workspace_files(&startup_state, entries);

    assert_eq!(summaries.len(), 2);
    assert!(summaries.iter().all(|f| f.available));
    assert!(startup_state.files.read().unwrap().contains_key("a"));
    assert!(startup_state.files.read().unwrap().contains_key("b"));
}

#[test]
fn load_workspace_files_marks_one_missing_file_unavailable() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();

    let present_path = write_temp_file("present", b"line one\n");
    let missing_path = write_temp_file("missing", b"line two\n");
    files::add_file(
        state.clone(),
        present_path.to_string_lossy().into_owned(),
        Some("present".into()),
    )
    .unwrap();
    files::add_file(
        state.clone(),
        missing_path.to_string_lossy().into_owned(),
        Some("missing".into()),
    )
    .unwrap();

    let workspace_id = *state.active_workspace_id.lock().unwrap();
    let entries = {
        let db = state.db.lock().unwrap();
        log_file_entry::list_for_workspace(&db, workspace_id).unwrap()
    };

    std::fs::remove_file(&missing_path).unwrap();

    let startup_state = fresh_state(workspace_id);
    let summaries = workspace::load_workspace_files(&startup_state, entries);

    let present = summaries.iter().find(|f| f.alias == "present").unwrap();
    assert!(present.available);
    let missing = summaries.iter().find(|f| f.alias == "missing").unwrap();
    assert!(!missing.available);

    let files = startup_state.files.read().unwrap();
    assert!(files.contains_key("present"));
    assert!(!files.contains_key("missing"));
}

#[test]
fn load_workspace_files_handles_all_files_missing() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();

    let path_a = write_temp_file("a", b"line one\n");
    let path_b = write_temp_file("b", b"line two\n");
    files::add_file(
        state.clone(),
        path_a.to_string_lossy().into_owned(),
        Some("a".into()),
    )
    .unwrap();
    files::add_file(
        state.clone(),
        path_b.to_string_lossy().into_owned(),
        Some("b".into()),
    )
    .unwrap();

    let workspace_id = *state.active_workspace_id.lock().unwrap();
    let entries = {
        let db = state.db.lock().unwrap();
        log_file_entry::list_for_workspace(&db, workspace_id).unwrap()
    };

    std::fs::remove_file(&path_a).unwrap();
    std::fs::remove_file(&path_b).unwrap();

    let startup_state = fresh_state(workspace_id);
    let summaries = workspace::load_workspace_files(&startup_state, entries);

    assert_eq!(summaries.len(), 2);
    assert!(summaries.iter().all(|f| !f.available));
    assert!(startup_state.files.read().unwrap().is_empty());
}
