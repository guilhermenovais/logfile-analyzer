//! Integration tests (Tauri mock runtime) for `commands::search::{search,
//! search_with_context, get_search_history}` (contracts/ipc-commands.md,
//! FR-021–FR-025, FR-029).

use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, RwLock};
use std::time::Duration;

use logfile_analyzer_lib::commands::search;
use logfile_analyzer_lib::commands::types::{SearchMatchBatch, SearchWithContextBatch};
use logfile_analyzer_lib::error::AppError;
use logfile_analyzer_lib::logfile::timestamp;
use logfile_analyzer_lib::persistence::repo::search_history::SearchType;
use logfile_analyzer_lib::persistence::repo::{log_file_entry, workspace};
use logfile_analyzer_lib::persistence::schema;
use logfile_analyzer_lib::state::{AppState, FileIndex, FileRuntime, IndexState};

use memmap2::Mmap;
use rusqlite::Connection;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::Manager;

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn write_temp_file(name: &str, contents: &[u8]) -> PathBuf {
    let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut path = std::env::temp_dir();
    path.push(format!(
        "search_test_{}_{unique}_{name}",
        std::process::id()
    ));
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

/// A [`Channel`] that forwards every deserialized message to an `mpsc`
/// receiver, for synchronous assertions in tests.
fn collecting_channel<T: serde::de::DeserializeOwned + Send + 'static>(
) -> (Channel<T>, mpsc::Receiver<T>) {
    let (tx, rx) = mpsc::channel();
    let channel = Channel::new(move |body| {
        let InvokeResponseBody::Json(json) = body else {
            panic!("expected JSON channel payload");
        };
        let value: T = serde_json::from_str(&json).expect("failed to deserialize channel payload");
        tx.send(value).unwrap();
        Ok(())
    });
    (channel, rx)
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
        }),
    });
    state
        .files
        .write()
        .unwrap()
        .insert(alias.to_string(), runtime);
    entry.id
}

/// Like [`add_ready_file`], but additionally runs timestamp detection
/// (research.md §4) so `timestamp_profile`/`line_timestamps` are populated
/// for time-range search tests (FR-012/FR-013).
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
        }),
    });
    timestamp::detect_and_parse(&runtime.mmap, &runtime.index);
    state
        .files
        .write()
        .unwrap()
        .insert(alias.to_string(), runtime);
    entry.id
}

#[test]
fn search_logical_streams_matching_lines_and_records_history() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    let file_id = add_ready_file(
        &state,
        "app",
        b"start\nconnecting to db\nan error talking to db\nrecovered\nend\n",
    );

    let (channel, rx) = collecting_channel::<SearchMatchBatch>();
    search::search(
        state.clone(),
        "app".into(),
        r#""error" AND "db""#.into(),
        SearchType::Logical,
        None,
        None,
        channel,
    )
    .unwrap();

    let batch = rx.recv_timeout(Duration::from_secs(1)).unwrap();
    assert_eq!(batch.matches.len(), 1);
    assert_eq!(batch.matches[0].line_index, 3);
    assert_eq!(batch.matches[0].content, "an error talking to db");
    assert!(rx.recv_timeout(Duration::from_millis(50)).is_err());

    let history = search::get_search_history(state.clone(), "app".into()).unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].file_id as i64, file_id);
    assert_eq!(history[0].query, r#""error" AND "db""#);
}

#[test]
fn search_regex_streams_matching_lines() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file(&state, "app", b"one\ntwo\nthree\n");

    let (channel, rx) = collecting_channel::<SearchMatchBatch>();
    search::search(
        state.clone(),
        "app".into(),
        r"^t\w+".into(),
        SearchType::Regex,
        None,
        None,
        channel,
    )
    .unwrap();

    let batch = rx.recv_timeout(Duration::from_secs(1)).unwrap();
    assert_eq!(batch.matches.len(), 2);
    assert_eq!(batch.matches[0].content, "two");
    assert_eq!(batch.matches[1].content, "three");
}

#[test]
fn search_invalid_regex_is_invalid_query() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file(&state, "app", b"one\ntwo\n");

    let (channel, _rx) = collecting_channel::<SearchMatchBatch>();
    let err = search::search(
        state.clone(),
        "app".into(),
        "(".into(),
        SearchType::Regex,
        None,
        None,
        channel,
    )
    .unwrap_err();

    assert!(matches!(err, AppError::InvalidQuery));
}

#[test]
fn search_with_context_returns_surrounding_lines_and_records_history() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file(
        &state,
        "app",
        b"start\nconnecting to db\nan error talking to db\nrecovered\nend\n",
    );

    let (channel, rx) = collecting_channel::<SearchWithContextBatch>();
    search::search_with_context(
        state.clone(),
        "app".into(),
        r#""error" AND "db""#.into(),
        SearchType::Logical,
        Some(1),
        None,
        None,
        channel,
    )
    .unwrap();

    let batch = rx.recv_timeout(Duration::from_secs(1)).unwrap();
    assert!(!batch.truncated);
    assert_eq!(batch.matches.len(), 1);
    let m = &batch.matches[0];
    assert_eq!(m.line_index, 3);
    assert_eq!(m.matched.content, "an error talking to db");
    assert_eq!(m.before.len(), 1);
    assert_eq!(m.before[0].content, "connecting to db");
    assert_eq!(m.after.len(), 1);
    assert_eq!(m.after[0].content, "recovered");

    let history = search::get_search_history(state.clone(), "app".into()).unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].query, r#""error" AND "db""#);
}

/// 2026-06-12T10:00:00Z and 10:01:00Z in epoch-ms (FR-012/FR-013).
const TS_10_00: f64 = 1_781_258_400_000.0;
const TS_10_01: f64 = 1_781_258_460_000.0;

#[test]
fn search_time_range_filters_matches_by_timestamp() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file_with_timestamps(
        &state,
        "app",
        b"2026-06-12T10:00:00Z connecting to db\n\
2026-06-12T10:01:00Z an error talking to db\n\
2026-06-12T10:02:00Z recovered\n",
    );

    let (channel, rx) = collecting_channel::<SearchMatchBatch>();
    search::search(
        state.clone(),
        "app".into(),
        r#""db""#.into(),
        SearchType::Logical,
        Some(TS_10_01),
        None,
        channel,
    )
    .unwrap();

    let batch = rx.recv_timeout(Duration::from_secs(1)).unwrap();
    assert_eq!(batch.matches.len(), 1);
    assert_eq!(batch.matches[0].line_index, 2);

    let history = search::get_search_history(state.clone(), "app".into()).unwrap();
    assert_eq!(history[0].time_from, Some(TS_10_01));
    assert_eq!(history[0].time_to, None);
}

#[test]
fn search_with_context_time_range_filters_matches_by_timestamp() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file_with_timestamps(
        &state,
        "app",
        b"2026-06-12T10:00:00Z connecting to db\n\
2026-06-12T10:01:00Z an error talking to db\n\
2026-06-12T10:02:00Z recovered\n",
    );

    let (channel, rx) = collecting_channel::<SearchWithContextBatch>();
    search::search_with_context(
        state.clone(),
        "app".into(),
        r#""db""#.into(),
        SearchType::Logical,
        Some(0),
        Some(TS_10_00),
        Some(TS_10_00),
        channel,
    )
    .unwrap();

    let batch = rx.recv_timeout(Duration::from_secs(1)).unwrap();
    assert_eq!(batch.matches.len(), 1);
    assert_eq!(batch.matches[0].line_index, 1);
    assert_eq!(
        batch.matches[0].matched.content,
        "2026-06-12T10:00:00Z connecting to db"
    );
}

#[test]
fn search_time_range_without_timestamp_format_is_unavailable() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file(&state, "app", b"one\ntwo\n");

    let (channel, _rx) = collecting_channel::<SearchMatchBatch>();
    let err = search::search(
        state.clone(),
        "app".into(),
        r#""one""#.into(),
        SearchType::Logical,
        Some(TS_10_00),
        None,
        channel,
    )
    .unwrap_err();

    assert!(matches!(err, AppError::TimeRangeUnavailable));
}
