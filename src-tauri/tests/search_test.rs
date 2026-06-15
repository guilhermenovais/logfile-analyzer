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

use logfile_analyzer_lib::commands::files;
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
    add_ready_file(
        &state,
        "app",
        b"start\nconnecting to db\nan error talking to db\nrecovered\nend\n",
    );
    let workspace_id = *state.active_workspace_id.lock().unwrap();

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
    assert!(!batch.truncated);
    assert!(rx.recv_timeout(Duration::from_millis(50)).is_err());

    let history = search::get_search_history(state.clone()).unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].workspace_id as i64, workspace_id);
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
    assert!(!batch.truncated);
}

#[test]
fn search_caps_results_and_marks_truncated() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    let contents: String = (0..600).map(|_| "match\n").collect();
    add_ready_file(&state, "app", contents.as_bytes());

    let (channel, rx) = collecting_channel::<SearchMatchBatch>();
    search::search(
        state.clone(),
        "app".into(),
        r#""match""#.into(),
        SearchType::Logical,
        None,
        None,
        channel,
    )
    .unwrap();

    let batch = rx.recv_timeout(Duration::from_secs(1)).unwrap();
    assert_eq!(batch.matches.len(), 500);
    assert!(batch.truncated);
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

    let history = search::get_search_history(state.clone()).unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].query, r#""error" AND "db""#);
}

/// FR-013: search history is scoped to the active workspace, not to the
/// file that was searched — `get_search_history` returns entries recorded
/// via any file in the workspace.
#[test]
fn get_search_history_returns_workspace_history_regardless_of_file() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file(&state, "app", b"start\nan error talking to db\nend\n");
    add_ready_file(&state, "other", b"one\ntwo\nthree\n");

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
    rx.recv_timeout(Duration::from_secs(1)).unwrap();

    let (channel, rx) = collecting_channel::<SearchMatchBatch>();
    search::search(
        state.clone(),
        "other".into(),
        r#""two""#.into(),
        SearchType::Logical,
        None,
        None,
        channel,
    )
    .unwrap();
    rx.recv_timeout(Duration::from_secs(1)).unwrap();

    let history = search::get_search_history(state.clone()).unwrap();
    assert_eq!(history.len(), 2);
    assert_eq!(history[0].query, r#""two""#);
    assert_eq!(history[1].query, r#""error" AND "db""#);
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

    let history = search::get_search_history(state.clone()).unwrap();
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

/// FR-001-FR-003: a time range set on the desktop toolbar must narrow
/// `search`'s results through the *real* `add_file` -> background-detection
/// -> `search` pipeline, not just against a hand-built `FileIndex`
/// (research.md §1).
#[test]
fn search_time_range_filters_through_real_indexing_pipeline() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();

    let path = write_temp_file(
        "pipeline",
        b"2026-06-12T10:00:00Z connecting to db\n\
2026-06-12T10:01:00Z an error talking to db\n\
2026-06-12T10:02:00Z recovered\n\
2026-06-12T10:03:00Z connecting to db again\n\
2026-06-12T10:04:00Z db closed\n",
    );

    files::add_file(
        state.clone(),
        path.to_string_lossy().into_owned(),
        Some("pipeline".into()),
    )
    .unwrap();

    let mut properties = None;
    for _ in 0..200 {
        let props = files::get_file_properties(state.clone(), "pipeline".into()).unwrap();
        if props.indexing_complete && props.has_timestamp_format {
            properties = Some(props);
            break;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    let properties = properties.expect("indexing did not complete in time");

    let first_timestamp = properties
        .first_timestamp
        .expect("first_timestamp should be populated once indexing completes");
    let last_timestamp = properties
        .last_timestamp
        .expect("last_timestamp should be populated once indexing completes");

    // No time filter: every "db" line matches.
    let (channel, rx) = collecting_channel::<SearchMatchBatch>();
    search::search(
        state.clone(),
        "pipeline".into(),
        r#""db""#.into(),
        SearchType::Logical,
        None,
        None,
        channel,
    )
    .unwrap();
    let unfiltered = rx.recv_timeout(Duration::from_secs(1)).unwrap();

    // The file's own first/last timestamps as bounds: identical results (FR-003).
    let (channel, rx) = collecting_channel::<SearchMatchBatch>();
    search::search(
        state.clone(),
        "pipeline".into(),
        r#""db""#.into(),
        SearchType::Logical,
        Some(first_timestamp),
        Some(last_timestamp),
        channel,
    )
    .unwrap();
    let full_span = rx.recv_timeout(Duration::from_secs(1)).unwrap();
    let as_pairs = |matches: &[logfile_analyzer_lib::commands::types::SearchMatchEntry]| {
        matches
            .iter()
            .map(|m| (m.line_index, m.content.clone()))
            .collect::<Vec<_>>()
    };
    assert_eq!(as_pairs(&full_span.matches), as_pairs(&unfiltered.matches));

    // Narrowing `time_to` to the midpoint excludes the later "db" matches
    // (FR-001/FR-002).
    let midpoint = (first_timestamp + last_timestamp) / 2.0;
    let (channel, rx) = collecting_channel::<SearchMatchBatch>();
    search::search(
        state.clone(),
        "pipeline".into(),
        r#""db""#.into(),
        SearchType::Logical,
        None,
        Some(midpoint),
        channel,
    )
    .unwrap();
    let narrowed = rx.recv_timeout(Duration::from_secs(1)).unwrap();

    assert!(narrowed.matches.len() < unfiltered.matches.len());
    for m in &narrowed.matches {
        assert!(
            m.line_index <= 3,
            "unexpected match past the midpoint: {m:?}"
        );
    }
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
