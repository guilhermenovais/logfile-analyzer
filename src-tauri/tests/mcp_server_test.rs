//! End-to-end test for the MCP server (T038): starts the real Streamable
//! HTTP server via `mcp::server::start` and exercises the registered tools
//! through an `rmcp` client connected over HTTP, per quickstart.md "Connect
//! an MCP agent".

use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};
use std::time::Duration;

use logfile_analyzer_lib::mcp;
use logfile_analyzer_lib::persistence::repo::{log_file_entry, workspace};
use logfile_analyzer_lib::persistence::schema;
use logfile_analyzer_lib::state::{AppState, FileIndex, FileRuntime, IndexState};

use memmap2::Mmap;
use rmcp::model::{CallToolRequestParams, JsonObject};
use rmcp::transport::StreamableHttpClientTransport;
use rmcp::ServiceExt;
use rusqlite::Connection;
use serde_json::json;

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn write_temp_file(name: &str, contents: &[u8]) -> PathBuf {
    let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut path = std::env::temp_dir();
    path.push(format!(
        "mcp_server_test_{}_{unique}_{name}",
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

/// Registers `alias` in the active workspace with `contents` and a fully
/// built (ready) line index.
fn add_ready_file(state: &Arc<AppState>, alias: &str, contents: &[u8]) {
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
            timestamp_detection_complete: true,
        }),
        view_filter: RwLock::new(None),
    });
    state
        .files
        .write()
        .unwrap()
        .insert(alias.to_string(), runtime);
}

fn args(value: serde_json::Value) -> JsonObject {
    value.as_object().unwrap().clone()
}

/// Validates the MCP quickstart flow (quickstart.md "Connect an MCP agent"):
/// starts the real Streamable HTTP server, connects an `rmcp` client to its
/// `/mcp` endpoint, and exercises `list_files`, `get_file_properties`,
/// `get_line`, and `search_with_context` against a loaded file.
#[test]
fn mcp_server_serves_registered_tools_over_http() {
    let conn = Connection::open_in_memory().unwrap();
    schema::migrate(&conn).unwrap();
    let ws = workspace::get_or_create_draft(&conn).unwrap();
    let state = Arc::new(AppState::new(conn, ws.id));
    add_ready_file(
        &state,
        "app",
        b"start\nconnecting to db\nan error talking to db\nrecovered\nend\n",
    );

    let probe = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let probe_port = probe.local_addr().unwrap().port();
    drop(probe);

    let handle = mcp::server::start(state, probe_port).expect("failed to start MCP server");
    let port = handle.port;

    tauri::async_runtime::block_on(async move {
        tokio::time::sleep(Duration::from_millis(100)).await;

        let transport =
            StreamableHttpClientTransport::from_uri(format!("http://127.0.0.1:{port}/mcp"));
        let client = ().serve(transport).await.expect("failed to connect MCP client");

        let tools = client.list_tools(None).await.expect("list_tools failed");
        let names: Vec<&str> = tools.tools.iter().map(|t| t.name.as_ref()).collect();
        for expected in [
            "list_files",
            "get_file_properties",
            "get_line",
            "search_with_context",
            "list_highlights",
            "set_highlight",
            "clear_highlight",
        ] {
            assert!(names.contains(&expected), "missing tool: {expected}");
        }

        let result = client
            .call_tool(CallToolRequestParams::new("list_files"))
            .await
            .expect("list_files call failed");
        let value = result.structured_content.expect("structured content");
        assert_eq!(value["files"][0]["alias"], "app");
        assert_eq!(value["files"][0]["available"], true);

        let result = client
            .call_tool(
                CallToolRequestParams::new("get_file_properties")
                    .with_arguments(args(json!({ "alias": "app" }))),
            )
            .await
            .expect("get_file_properties call failed");
        let value = result.structured_content.expect("structured content");
        assert_eq!(value["total_lines"], 5);
        assert_eq!(value["available"], true);
        assert_eq!(value["indexing_complete"], true);

        let result = client
            .call_tool(
                CallToolRequestParams::new("get_line")
                    .with_arguments(args(json!({ "alias": "app", "line_index": 2 }))),
            )
            .await
            .expect("get_line call failed");
        let value = result.structured_content.expect("structured content");
        assert_eq!(value["content"], "connecting to db");

        let result = client
            .call_tool(
                CallToolRequestParams::new("search_with_context").with_arguments(args(json!({
                    "alias": "app",
                    "query": "\"error\" AND \"db\"",
                    "search_type": "logical",
                    "surrounding_count": 1,
                }))),
            )
            .await
            .expect("search_with_context call failed");
        let value = result.structured_content.expect("structured content");
        assert_eq!(value["matches"].as_array().unwrap().len(), 1);
        assert_eq!(
            value["matches"][0]["match"]["content"],
            "an error talking to db"
        );

        client.cancel().await.expect("client shutdown failed");
    });

    handle.shutdown();
}

fn start_mcp_server() -> mcp::server::McpServerHandle {
    let conn = Connection::open_in_memory().unwrap();
    schema::migrate(&conn).unwrap();
    let ws = workspace::get_or_create_draft(&conn).unwrap();
    let state = Arc::new(AppState::new(conn, ws.id));

    let probe = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let probe_port = probe.local_addr().unwrap().port();
    drop(probe);

    mcp::server::start(state, probe_port).expect("failed to start MCP server")
}

#[test]
fn well_known_oauth_protected_resource_returns_metadata() {
    let handle = start_mcp_server();
    let port = handle.port;

    tauri::async_runtime::block_on(async move {
        tokio::time::sleep(Duration::from_millis(100)).await;

        let resp = reqwest::get(format!(
            "http://127.0.0.1:{port}/.well-known/oauth-protected-resource"
        ))
        .await
        .expect("request failed");

        assert_eq!(resp.status(), 200);
        let content_type = resp
            .headers()
            .get("content-type")
            .expect("missing content-type")
            .to_str()
            .unwrap()
            .to_string();
        assert!(
            content_type.contains("application/json"),
            "expected application/json, got {content_type}"
        );

        let body: serde_json::Value = resp.json().await.expect("invalid JSON");
        assert_eq!(body["resource"], format!("http://127.0.0.1:{port}/mcp"));
    });

    handle.shutdown();
}

#[test]
fn well_known_oauth_protected_resource_omits_authorization_servers() {
    let handle = start_mcp_server();
    let port = handle.port;

    tauri::async_runtime::block_on(async move {
        tokio::time::sleep(Duration::from_millis(100)).await;

        let resp = reqwest::get(format!(
            "http://127.0.0.1:{port}/.well-known/oauth-protected-resource"
        ))
        .await
        .expect("request failed");

        let body: serde_json::Value = resp.json().await.expect("invalid JSON");
        assert!(
            body.get("authorization_servers").is_none(),
            "authorization_servers must not be present"
        );
        assert!(
            body.get("scopes_supported").is_none(),
            "scopes_supported must not be present"
        );
    });

    handle.shutdown();
}

#[test]
fn well_known_endpoint_is_spec_compliant_for_any_client() {
    let handle = start_mcp_server();
    let port = handle.port;

    tauri::async_runtime::block_on(async move {
        tokio::time::sleep(Duration::from_millis(100)).await;

        let resp = reqwest::get(format!(
            "http://127.0.0.1:{port}/.well-known/oauth-protected-resource"
        ))
        .await
        .expect("request failed");

        let body: serde_json::Value = resp.json().await.expect("invalid JSON");
        assert_eq!(
            body["resource"],
            format!("http://127.0.0.1:{port}/mcp"),
            "resource field must point to the MCP endpoint"
        );
        assert!(body.is_object(), "response must be a valid JSON object");
    });

    handle.shutdown();
}
