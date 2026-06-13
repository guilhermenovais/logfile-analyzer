//! Integration tests (Tauri mock runtime) for `commands::files::add_file`
//! (contracts/ipc-commands.md, FR-002/FR-003).

use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use logfile_analyzer_lib::commands::files;
use logfile_analyzer_lib::error::AppError;
use logfile_analyzer_lib::persistence::repo::workspace;
use logfile_analyzer_lib::persistence::schema;
use logfile_analyzer_lib::state::AppState;

use rusqlite::Connection;
use tauri::Manager;

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn write_temp_file(name: &str, contents: &[u8]) -> PathBuf {
    let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut path = std::env::temp_dir();
    path.push(format!("files_test_{}_{unique}_{name}", std::process::id()));
    File::create(&path).unwrap().write_all(contents).unwrap();
    path
}

fn mock_app() -> tauri::App<tauri::test::MockRuntime> {
    let conn = Connection::open_in_memory().unwrap();
    schema::migrate(&conn).unwrap();
    let ws = workspace::get_or_create_draft(&conn).unwrap();
    let state = Arc::new(AppState::new(conn, ws.id));

    tauri::test::mock_builder()
        .manage(state)
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap()
}

#[test]
fn add_file_default_alias_is_file_stem() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    let path = write_temp_file("app.log", b"line one\nline two\n");

    let expected_alias = path.file_stem().unwrap().to_string_lossy().into_owned();
    let summary = files::add_file(state, path.to_string_lossy().into_owned(), None).unwrap();

    assert_eq!(summary.alias, expected_alias);
    assert!(summary.available);
    assert!(!summary.indexing_complete);
}

#[test]
fn add_file_with_custom_alias() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    let path = write_temp_file("custom.log", b"line one\n");

    let summary = files::add_file(
        state,
        path.to_string_lossy().into_owned(),
        Some("my-alias".to_string()),
    )
    .unwrap();

    assert_eq!(summary.alias, "my-alias");
}

#[test]
fn add_file_rejects_duplicate_path() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    let path = write_temp_file("dup.log", b"line one\n");

    files::add_file(state.clone(), path.to_string_lossy().into_owned(), None).unwrap();

    let err = files::add_file(
        state,
        path.to_string_lossy().into_owned(),
        Some("other-alias".to_string()),
    )
    .unwrap_err();

    assert!(matches!(err, AppError::FileAlreadyInWorkspace));
}

#[test]
fn add_file_rejects_alias_collision() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    let first = write_temp_file("first.log", b"line one\n");
    let second = write_temp_file("second.log", b"line one\n");

    files::add_file(
        state.clone(),
        first.to_string_lossy().into_owned(),
        Some("shared".to_string()),
    )
    .unwrap();

    let err = files::add_file(
        state,
        second.to_string_lossy().into_owned(),
        Some("shared".to_string()),
    )
    .unwrap_err();

    assert!(matches!(err, AppError::AliasCollision));
}
