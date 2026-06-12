//! Integration tests (Tauri mock runtime) for the MCP highlight tools
//! `list_highlights`, `set_highlight`, `clear_highlight` in `mcp::tools`
//! (contracts/mcp-tools.md, FR-017–FR-020), including the FR-029 cross-check
//! with `commands::highlights`.

use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

use logfile_analyzer_lib::commands::highlights;
use logfile_analyzer_lib::mcp::tools::{
    AliasInput, ClearHighlightInput, LogAnalyzerMcpServer, SetHighlightInput,
};
use logfile_analyzer_lib::persistence::repo::highlight::HighlightOrigin;
use logfile_analyzer_lib::persistence::repo::{log_file_entry, workspace};
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
        "mcp_highlights_test_{}_{unique}_{name}",
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

#[test]
fn set_highlight_via_mcp_is_visible_via_commands_list_highlights() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file(&state, "app", b"start\nconnecting to db\nan error\nend\n");

    let server = LogAnalyzerMcpServer::new(state.inner().clone());
    let output = expect_ok(server.set_highlight(Parameters(SetHighlightInput {
        alias: "app".into(),
        line_index: 3,
        label: Some("agent note".into()),
    })));
    assert!(output.ok);

    // FR-029: the highlight created via MCP (origin = mcp_agent) is visible
    // through the Tauri `commands::highlights::list_highlights` path.
    let list = highlights::list_highlights(state.clone(), "app".into()).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].line_index, 3);
    assert_eq!(list[0].content, "an error");
    assert_eq!(list[0].label, Some("agent note".into()));
    assert_eq!(list[0].origin, HighlightOrigin::McpAgent);
}

#[test]
fn list_highlights_via_mcp_reflects_highlight_set_via_commands() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file(&state, "app", b"start\nconnecting to db\nan error\nend\n");

    // A highlight created via the Tauri command (origin = user).
    highlights::set_highlight(state.clone(), "app".into(), 2, Some("ui note".into())).unwrap();

    let server = LogAnalyzerMcpServer::new(state.inner().clone());
    let output = expect_ok(server.list_highlights(Parameters(AliasInput {
        alias: "app".into(),
    })));

    assert_eq!(output.highlights.len(), 1);
    assert_eq!(output.highlights[0].line_index, 2);
    assert_eq!(output.highlights[0].content, "connecting to db");
    assert_eq!(output.highlights[0].label, Some("ui note".into()));
}

#[test]
fn set_highlight_out_of_range_is_line_out_of_range() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file(&state, "app", b"only line\n");

    let server = LogAnalyzerMcpServer::new(state.inner().clone());
    let err = expect_err(server.set_highlight(Parameters(SetHighlightInput {
        alias: "app".into(),
        line_index: 5,
        label: None,
    })));

    assert_eq!(err.kind, "line_out_of_range");
}

#[test]
fn clear_highlight_via_mcp_removes_highlight_set_via_commands() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    add_ready_file(&state, "app", b"start\nconnecting to db\nan error\nend\n");

    highlights::set_highlight(state.clone(), "app".into(), 2, None).unwrap();

    let server = LogAnalyzerMcpServer::new(state.inner().clone());
    let output = expect_ok(server.clear_highlight(Parameters(ClearHighlightInput {
        alias: "app".into(),
        line_index: 2,
    })));
    assert!(output.ok);

    let list = highlights::list_highlights(state.clone(), "app".into()).unwrap();
    assert!(list.is_empty());
}
