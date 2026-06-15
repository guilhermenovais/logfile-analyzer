//! Integration tests (Tauri mock runtime) for `commands::files::add_file`
//! (contracts/ipc-commands.md, FR-002/FR-003) and `file_properties`
//! (contracts/file-properties.md).

use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

use logfile_analyzer_lib::commands::files;
use logfile_analyzer_lib::error::AppError;
use logfile_analyzer_lib::logfile::timestamp;
use logfile_analyzer_lib::persistence::repo::{log_file_entry, workspace};
use logfile_analyzer_lib::persistence::schema;
use logfile_analyzer_lib::state::{AppState, FileIndex, FileRuntime, IndexState};

use memmap2::Mmap;
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

fn open_mmap(path: &PathBuf) -> Mmap {
    let file = File::open(path).unwrap();
    unsafe { Mmap::map(&file).unwrap() }
}

/// Byte offset of each line start in `data`, mirroring
/// `logfile::mmap_index::build_line_index`'s convention.
fn line_offsets(data: &[u8]) -> Vec<u64> {
    let mut offsets = Vec::new();
    if !data.is_empty() {
        offsets.push(0u64);
    }
    for (i, &byte) in data.iter().enumerate() {
        if byte == b'\n' && i + 1 < data.len() {
            offsets.push((i + 1) as u64);
        }
    }
    offsets
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

/// Registers `alias` in the active workspace with `contents` and a fully
/// built (ready) line index, returning its `file_id`.
fn add_ready_file(state: &Arc<AppState>, alias: &str, contents: &[u8]) -> i64 {
    let workspace_id = *state.active_workspace_id.lock().unwrap();
    let path = write_temp_file(alias, contents);
    let entry = {
        let db = state.db.lock().unwrap();
        log_file_entry::insert(&db, workspace_id, &path.to_string_lossy(), alias).unwrap()
    };

    let mmap = open_mmap(&path);
    let offsets = line_offsets(contents);
    let total = offsets.len();
    let runtime = Arc::new(FileRuntime {
        file_id: entry.id,
        mmap,
        index: RwLock::new(FileIndex {
            line_offsets: offsets,
            total_lines: total,
            state: IndexState::Ready,
            timestamp_profile: None,
            line_timestamps: None,
            effective_timestamps: None,
            utc_offset_minutes: 0,
            timestamp_detection_complete: false,
        }),
        view_filter: RwLock::new(None),
    });
    state
        .files
        .write()
        .unwrap()
        .insert(alias.to_string(), runtime);
    entry.id
}

/// Like [`add_ready_file`], but additionally runs timestamp detection
/// (research.md §4) and persists `has_timestamp_format` so
/// `file_properties`'s `entry.has_timestamp_format` is `true`.
fn add_ready_file_with_timestamps(state: &Arc<AppState>, alias: &str, contents: &[u8]) -> i64 {
    let workspace_id = *state.active_workspace_id.lock().unwrap();
    let path = write_temp_file(alias, contents);
    let entry = {
        let db = state.db.lock().unwrap();
        log_file_entry::insert(&db, workspace_id, &path.to_string_lossy(), alias).unwrap()
    };

    let mmap = open_mmap(&path);
    let offsets = line_offsets(contents);
    let total = offsets.len();
    let runtime = Arc::new(FileRuntime {
        file_id: entry.id,
        mmap,
        index: RwLock::new(FileIndex {
            line_offsets: offsets,
            total_lines: total,
            state: IndexState::Ready,
            timestamp_profile: None,
            line_timestamps: None,
            effective_timestamps: None,
            utc_offset_minutes: 0,
            timestamp_detection_complete: false,
        }),
        view_filter: RwLock::new(None),
    });
    timestamp::detect_and_parse(&runtime.mmap, &runtime.index);
    {
        let db = state.db.lock().unwrap();
        log_file_entry::set_has_timestamp_format(&db, entry.id, true).unwrap();
    }
    runtime.index.write().unwrap().timestamp_detection_complete = true;
    state
        .files
        .write()
        .unwrap()
        .insert(alias.to_string(), runtime);
    entry.id
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
fn file_properties_reports_first_and_last_timestamps() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file_with_timestamps(
        &state,
        "app",
        b"2026-06-12T10:00:00Z connecting to db\n2026-06-12T10:01:00Z an error talking to db\n2026-06-12T10:02:00Z recovered\n",
    );

    let props = files::get_file_properties(state.clone(), "app".into()).unwrap();

    assert_eq!(
        props.first_timestamp,
        timestamp::parse_iso8601("2026-06-12T10:00:00Z").map(|ms| ms as f64),
    );
    assert_eq!(
        props.last_timestamp,
        timestamp::parse_iso8601("2026-06-12T10:02:00Z").map(|ms| ms as f64),
    );
}

#[test]
fn file_properties_reports_timestamp_offset_minutes_for_iso8601_with_explicit_offset() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file_with_timestamps(
        &state,
        "app",
        b"2026-06-12T10:00:00+02:00 connecting to db\n2026-06-12T10:01:00+02:00 an error talking to db\n2026-06-12T10:02:00+02:00 recovered\n",
    );

    let props = files::get_file_properties(state.clone(), "app".into()).unwrap();

    assert_eq!(props.timestamp_offset_minutes, 120);
}

#[test]
fn file_properties_timestamp_offset_minutes_is_zero_without_explicit_offset() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file_with_timestamps(
        &state,
        "app",
        b"1781258400 connecting to db\n1781258460 an error talking to db\n1781258520 recovered\n",
    );

    let props = files::get_file_properties(state.clone(), "app".into()).unwrap();

    assert_eq!(props.timestamp_offset_minutes, 0);
}

#[test]
fn file_properties_timestamps_null_without_detected_format() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file(&state, "app", b"one\ntwo\nthree\n");

    let props = files::get_file_properties(state.clone(), "app".into()).unwrap();

    assert_eq!(props.first_timestamp, None);
    assert_eq!(props.last_timestamp, None);
}

#[test]
fn file_properties_timestamps_null_when_indexing_incomplete() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    let workspace_id = *state.active_workspace_id.lock().unwrap();
    let path = write_temp_file("app", b"2026-06-12T10:00:00Z connecting to db\n");
    let entry = {
        let db = state.db.lock().unwrap();
        log_file_entry::insert(&db, workspace_id, &path.to_string_lossy(), "app").unwrap()
    };

    let mmap = open_mmap(&path);
    let offsets = line_offsets(b"2026-06-12T10:00:00Z connecting to db\n");
    let total = offsets.len();
    let runtime = Arc::new(FileRuntime {
        file_id: entry.id,
        mmap,
        index: RwLock::new(FileIndex {
            line_offsets: offsets,
            total_lines: total,
            state: IndexState::Indexing,
            timestamp_profile: None,
            line_timestamps: Some(vec![timestamp::parse_iso8601("2026-06-12T10:00:00Z")]),
            effective_timestamps: None,
            utc_offset_minutes: 0,
            timestamp_detection_complete: false,
        }),
        view_filter: RwLock::new(None),
    });
    state
        .files
        .write()
        .unwrap()
        .insert("app".to_string(), runtime);

    let props = files::get_file_properties(state.clone(), "app".into()).unwrap();

    assert_eq!(props.first_timestamp, None);
    assert_eq!(props.last_timestamp, None);
}

#[test]
fn file_properties_indexing_complete_waits_for_timestamp_detection() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    let workspace_id = *state.active_workspace_id.lock().unwrap();
    let contents = b"2026-06-12T10:00:00Z connecting to db\n2026-06-12T10:01:00Z an error talking to db\n2026-06-12T10:02:00Z recovered\n";
    let path = write_temp_file("app", contents);
    let entry = {
        let db = state.db.lock().unwrap();
        log_file_entry::insert(&db, workspace_id, &path.to_string_lossy(), "app").unwrap()
    };

    let mmap = open_mmap(&path);
    let offsets = line_offsets(contents);
    let total = offsets.len();
    let runtime = Arc::new(FileRuntime {
        file_id: entry.id,
        mmap,
        index: RwLock::new(FileIndex {
            line_offsets: offsets,
            total_lines: total,
            state: IndexState::Ready,
            timestamp_profile: None,
            line_timestamps: None,
            effective_timestamps: None,
            utc_offset_minutes: 0,
            timestamp_detection_complete: false,
        }),
        view_filter: RwLock::new(None),
    });
    timestamp::detect_and_parse(&runtime.mmap, &runtime.index);
    {
        let db = state.db.lock().unwrap();
        log_file_entry::set_has_timestamp_format(&db, entry.id, true).unwrap();
    }
    state
        .files
        .write()
        .unwrap()
        .insert("app".to_string(), runtime.clone());

    // Line-offset indexing and timestamp detection have both run, and
    // `has_timestamp_format` is persisted — but `timestamp_detection_complete`
    // hasn't been set yet (research.md §2.1's race window).
    let props = files::get_file_properties(state.clone(), "app".into()).unwrap();
    assert!(!props.indexing_complete);
    assert_eq!(props.first_timestamp, None);
    assert_eq!(props.last_timestamp, None);

    runtime.index.write().unwrap().timestamp_detection_complete = true;

    let props = files::get_file_properties(state.clone(), "app".into()).unwrap();
    assert!(props.indexing_complete);
    assert!(props.has_timestamp_format);
    assert_eq!(
        props.first_timestamp,
        timestamp::parse_iso8601("2026-06-12T10:00:00Z").map(|ms| ms as f64),
    );
    assert_eq!(
        props.last_timestamp,
        timestamp::parse_iso8601("2026-06-12T10:02:00Z").map(|ms| ms as f64),
    );
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
