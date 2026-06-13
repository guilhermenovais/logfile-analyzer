//! Integration tests (Tauri mock runtime) for the MCP tool handlers in
//! `mcp::tools` (contracts/mcp-tools.md, FR-025/FR-026/FR-027/FR-028).

use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

use logfile_analyzer_lib::logfile::timestamp;
use logfile_analyzer_lib::mcp::tools::{
    AliasInput, GetLineInput, LogAnalyzerMcpServer, SearchTypeArg, SearchWithContextInput,
};
use logfile_analyzer_lib::persistence::repo::{log_file_entry, search_history, workspace};
use logfile_analyzer_lib::persistence::schema;
use logfile_analyzer_lib::state::{AppState, FileIndex, FileRuntime, IndexState};

use memmap2::Mmap;
use rmcp::handler::server::wrapper::{Json, Parameters};
use rusqlite::Connection;
use tauri::Manager;

/// `Json<T>`/`Json<E>` (the tool-handler result wrapper types) don't
/// implement `Debug`, so `Result::unwrap`/`unwrap_err` can't be used directly
/// on handler results. These helpers unwrap via `match` instead.
fn expect_ok<T, E>(result: Result<Json<T>, Json<E>>) -> T {
    match result {
        Ok(Json(value)) => value,
        Err(_) => panic!("expected Ok tool result"),
    }
}

fn expect_err<T, E>(result: Result<Json<T>, Json<E>>) -> E {
    match result {
        Ok(_) => panic!("expected Err tool result"),
        Err(Json(err)) => err,
    }
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn write_temp_file(name: &str, contents: &[u8]) -> PathBuf {
    let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut path = std::env::temp_dir();
    path.push(format!(
        "mcp_tools_test_{}_{unique}_{name}",
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

/// Registers `alias` in the active workspace's database, but does not open a
/// `FileRuntime` for it (simulates a file that is no longer available).
fn add_unavailable_file(state: &Arc<AppState>, alias: &str) {
    let workspace_id = *state.active_workspace_id.lock().unwrap();
    let db = state.db.lock().unwrap();
    log_file_entry::insert(&db, workspace_id, &format!("/missing/{alias}.log"), alias).unwrap();
}

#[test]
fn list_files_reports_available_and_unavailable_files() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file(&state, "app", b"one\ntwo\n");
    add_unavailable_file(&state, "nginx");

    let server = LogAnalyzerMcpServer::new(state.inner().clone());
    let output = expect_ok(server.list_files());

    let mut files = output.files;
    files.sort_by(|a, b| a.alias.cmp(&b.alias));
    assert_eq!(files.len(), 2);
    assert_eq!(files[0].alias, "app");
    assert!(files[0].available);
    assert_eq!(files[1].alias, "nginx");
    assert!(!files[1].available);
}

#[test]
fn get_file_properties_reports_total_lines_and_status() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file(&state, "app", b"one\ntwo\nthree\n");

    let server = LogAnalyzerMcpServer::new(state.inner().clone());
    let output = expect_ok(server.get_file_properties(Parameters(AliasInput {
        alias: "app".into(),
    })));

    assert_eq!(output.alias, "app");
    assert_eq!(output.total_lines, 3);
    assert!(output.available);
    assert!(output.indexing_complete);
    assert!(!output.has_timestamp_format);
}

#[test]
fn get_file_properties_unknown_alias_is_file_not_found() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();

    let server = LogAnalyzerMcpServer::new(state.inner().clone());
    let err = expect_err(server.get_file_properties(Parameters(AliasInput {
        alias: "missing".into(),
    })));

    assert_eq!(err.kind, "file_not_found");
}

#[test]
fn get_line_returns_requested_line_content() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file(&state, "app", b"one\ntwo\nthree\n");

    let server = LogAnalyzerMcpServer::new(state.inner().clone());
    let output = expect_ok(server.get_line(Parameters(GetLineInput {
        alias: "app".into(),
        line_index: 2,
    })));

    assert_eq!(output.line_index, 2);
    assert_eq!(output.content, "two");
}

#[test]
fn get_line_out_of_range_errors() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file(&state, "app", b"one\ntwo\nthree\n");

    let server = LogAnalyzerMcpServer::new(state.inner().clone());
    let err = expect_err(server.get_line(Parameters(GetLineInput {
        alias: "app".into(),
        line_index: 99,
    })));

    assert_eq!(err.kind, "line_out_of_range");
}

#[test]
fn get_line_on_unavailable_file_is_file_unavailable() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_unavailable_file(&state, "nginx");

    let server = LogAnalyzerMcpServer::new(state.inner().clone());
    let err = expect_err(server.get_line(Parameters(GetLineInput {
        alias: "nginx".into(),
        line_index: 1,
    })));

    assert_eq!(err.kind, "file_unavailable");
}

#[test]
fn search_with_context_logical_returns_matches_with_surrounding_lines() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file(
        &state,
        "app",
        b"start\nconnecting to db\nan error talking to db\nrecovered\nend\n",
    );

    let server = LogAnalyzerMcpServer::new(state.inner().clone());
    let output = expect_ok(
        server.search_with_context(Parameters(SearchWithContextInput {
            alias: "app".into(),
            query: "\"error\" AND \"db\"".into(),
            search_type: SearchTypeArg::Logical,
            surrounding_count: Some(1),
            time_from: None,
            time_to: None,
        })),
    );

    assert!(!output.truncated);
    assert_eq!(output.matches.len(), 1);
    let m = &output.matches[0];
    assert_eq!(m.line_index, 3);
    assert_eq!(m.matched.content, "an error talking to db");
    assert_eq!(m.before.len(), 1);
    assert_eq!(m.before[0].content, "connecting to db");
    assert_eq!(m.after.len(), 1);
    assert_eq!(m.after[0].content, "recovered");

    // FR-024: the search is recorded in the workspace's history.
    let db = state.db.lock().unwrap();
    let workspace_id = *state.active_workspace_id.lock().unwrap();
    let history = search_history::list_for_workspace(&db, workspace_id).unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].query, "\"error\" AND \"db\"");
}

#[test]
fn search_with_context_invalid_regex_is_invalid_query() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file(&state, "app", b"one\ntwo\n");

    let server = LogAnalyzerMcpServer::new(state.inner().clone());
    let err = expect_err(
        server.search_with_context(Parameters(SearchWithContextInput {
            alias: "app".into(),
            query: "(".into(),
            search_type: SearchTypeArg::Regex,
            surrounding_count: None,
            time_from: None,
            time_to: None,
        })),
    );

    assert_eq!(err.kind, "invalid_query");
}

#[test]
fn search_with_context_time_range_without_timestamp_format_is_unavailable() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file(&state, "app", b"one\ntwo\n");

    let server = LogAnalyzerMcpServer::new(state.inner().clone());
    let err = expect_err(
        server.search_with_context(Parameters(SearchWithContextInput {
            alias: "app".into(),
            query: "\"one\"".into(),
            search_type: SearchTypeArg::Logical,
            surrounding_count: None,
            time_from: Some("2026-06-12T00:00:00Z".into()),
            time_to: None,
        })),
    );

    assert_eq!(err.kind, "time_range_unavailable");
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

    let server = LogAnalyzerMcpServer::new(state.inner().clone());
    let output = expect_ok(
        server.search_with_context(Parameters(SearchWithContextInput {
            alias: "app".into(),
            query: "\"db\"".into(),
            search_type: SearchTypeArg::Logical,
            surrounding_count: Some(0),
            time_from: Some("2026-06-12T10:01:00Z".into()),
            time_to: None,
        })),
    );

    assert_eq!(output.matches.len(), 1);
    assert_eq!(output.matches[0].line_index, 2);

    let db = state.db.lock().unwrap();
    let workspace_id = *state.active_workspace_id.lock().unwrap();
    let history = search_history::list_for_workspace(&db, workspace_id).unwrap();
    assert_eq!(history[0].time_from, Some(1_781_258_460_000));
    assert_eq!(history[0].time_to, None);
}

#[test]
fn search_with_context_unknown_alias_is_file_not_found() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();

    let server = LogAnalyzerMcpServer::new(state.inner().clone());
    let err = expect_err(
        server.search_with_context(Parameters(SearchWithContextInput {
            alias: "missing".into(),
            query: "\"one\"".into(),
            search_type: SearchTypeArg::Logical,
            surrounding_count: None,
            time_from: None,
            time_to: None,
        })),
    );

    assert_eq!(err.kind, "file_not_found");
}
