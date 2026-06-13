//! Integration tests (Tauri mock runtime) for `commands::settings::{get_mcp_status,
//! configure_mcp_port}` (contracts/ipc-commands.md, US1/US4).

use std::sync::{Arc, Mutex};

use logfile_analyzer_lib::commands::settings::{configure_mcp_port, get_mcp_status};
use logfile_analyzer_lib::commands::types::McpStatusInfo;
use logfile_analyzer_lib::error::AppError;
use logfile_analyzer_lib::mcp;
use logfile_analyzer_lib::mcp::server::{McpRuntimeStatus, McpServerState};
use logfile_analyzer_lib::persistence::repo::{settings, workspace};
use logfile_analyzer_lib::persistence::schema;
use logfile_analyzer_lib::state::AppState;

use rusqlite::Connection;
use tauri::Manager;

fn mock_app() -> tauri::App<tauri::test::MockRuntime> {
    let conn = Connection::open_in_memory().unwrap();
    schema::migrate(&conn).unwrap();
    let ws = workspace::get_or_create_draft(&conn).unwrap();
    let state = Arc::new(AppState::new(conn, ws.id));

    tauri::test::mock_builder()
        .manage(state)
        .manage(McpServerState(Mutex::new(McpRuntimeStatus::Failed(
            "not configured".into(),
        ))))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap()
}

/// Binds a short-lived listener to obtain a free `127.0.0.1` port, then
/// releases it (mirrors `mcp_server_test.rs`'s probe-bind pattern).
fn free_port() -> u16 {
    let probe = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    probe.local_addr().unwrap().port()
}

#[test]
fn configure_mcp_port_success_binds_persists_and_returns_status() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    let mcp_state = app.state::<McpServerState>();
    let port = free_port();

    let status = configure_mcp_port(state.clone(), mcp_state, port).unwrap();

    assert_eq!(
        status,
        McpStatusInfo {
            configured: true,
            port: Some(port),
            error: None,
        }
    );

    let db = state.db.lock().unwrap();
    assert_eq!(settings::get_mcp_port(&db).unwrap(), Some(port));
}

#[test]
fn configure_mcp_port_zero_is_invalid_port() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    let mcp_state = app.state::<McpServerState>();

    let err = configure_mcp_port(state, mcp_state, 0).unwrap_err();

    assert!(matches!(err, AppError::InvalidPort));
}

#[test]
fn configure_mcp_port_unavailable_when_port_already_bound() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    let mcp_state = app.state::<McpServerState>();

    let occupied = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = occupied.local_addr().unwrap().port();

    let err = configure_mcp_port(state, mcp_state, port).unwrap_err();

    assert!(matches!(err, AppError::PortUnavailable(_)));
}

#[test]
fn configure_mcp_port_same_port_is_noop_without_rebinding() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    let mcp_state = app.state::<McpServerState>();
    let port = free_port();

    let first = configure_mcp_port(state.clone(), mcp_state.clone(), port).unwrap();
    // If this attempted to rebind, the first call's still-running listener
    // would make this call fail with `PortUnavailable`.
    let second = configure_mcp_port(state.clone(), mcp_state, port).unwrap();

    assert_eq!(first, second);
    assert_eq!(second.port, Some(port));
}

#[test]
fn get_mcp_status_reflects_configuration_lifecycle() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();
    let mcp_state = app.state::<McpServerState>();

    let before = get_mcp_status(state.clone(), mcp_state.clone()).unwrap();
    assert_eq!(
        before,
        McpStatusInfo {
            configured: false,
            port: None,
            error: None,
        }
    );

    let port = free_port();
    configure_mcp_port(state.clone(), mcp_state.clone(), port).unwrap();

    let after = get_mcp_status(state, mcp_state).unwrap();
    assert_eq!(
        after,
        McpStatusInfo {
            configured: true,
            port: Some(port),
            error: None,
        }
    );
}

/// Replicates `setup()`'s startup bind attempt for a persisted port that is
/// already occupied, then verifies the failure is surfaced via
/// `get_mcp_status` and recoverable via `configure_mcp_port` (FR-018/FR-020).
#[test]
fn startup_bind_failure_is_surfaced_and_recoverable_via_configure() {
    let conn = Connection::open_in_memory().unwrap();
    schema::migrate(&conn).unwrap();
    let ws = workspace::get_or_create_draft(&conn).unwrap();

    let port = free_port();
    settings::set_mcp_port(&conn, port).unwrap();

    // Occupy the persisted port before "startup".
    let occupied = std::net::TcpListener::bind(("127.0.0.1", port)).unwrap();

    let state = Arc::new(AppState::new(conn, ws.id));

    let mcp_status = match mcp::server::start(state.clone(), port) {
        Ok(handle) => McpRuntimeStatus::Running(handle),
        Err(err) => McpRuntimeStatus::Failed(err.to_string()),
    };
    assert!(matches!(mcp_status, McpRuntimeStatus::Failed(_)));

    let app = tauri::test::mock_builder()
        .manage(state)
        .manage(McpServerState(Mutex::new(mcp_status)))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();

    let state = app.state::<Arc<AppState>>();
    let mcp_state = app.state::<McpServerState>();

    let status = get_mcp_status(state.clone(), mcp_state.clone()).unwrap();
    assert_eq!(status.configured, true);
    assert_eq!(status.port, Some(port));
    assert!(status.error.is_some());

    drop(occupied);

    let new_port = free_port();
    let recovered = configure_mcp_port(state, mcp_state, new_port).unwrap();
    assert_eq!(
        recovered,
        McpStatusInfo {
            configured: true,
            port: Some(new_port),
            error: None,
        }
    );
}
