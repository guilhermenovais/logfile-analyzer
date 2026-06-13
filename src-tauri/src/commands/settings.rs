//! `get_mcp_status` and `configure_mcp_port` (contracts/ipc-commands.md, US1/US3/US4).

use std::sync::Arc;

use tauri::State;

use crate::commands::types::McpStatusInfo;
use crate::error::{AppError, Result};
use crate::mcp;
use crate::mcp::server::{McpRuntimeStatus, McpServerState};
use crate::persistence::repo::settings;
use crate::state::AppState;

/// Returns the persisted MCP port configuration and current runtime status
/// (FR-018/FR-021).
#[tauri::command]
#[specta::specta]
pub fn get_mcp_status(
    state: State<'_, Arc<AppState>>,
    mcp_state: State<'_, McpServerState>,
) -> Result<McpStatusInfo> {
    let port = {
        let db = state.db.lock().unwrap();
        settings::get_mcp_port(&db)?
    };

    let error = match &*mcp_state.0.lock().unwrap() {
        McpRuntimeStatus::Failed(reason) if port.is_some() => Some(reason.clone()),
        _ => None,
    };

    Ok(McpStatusInfo {
        configured: port.is_some(),
        port,
        error,
    })
}

/// Validates, checks availability, persists, and hot-reconfigures the
/// running MCP server to `port` (FR-003/FR-005/FR-006/FR-015/FR-016).
#[tauri::command]
#[specta::specta]
pub fn configure_mcp_port(
    state: State<'_, Arc<AppState>>,
    mcp_state: State<'_, McpServerState>,
    port: u16,
) -> Result<McpStatusInfo> {
    if port == 0 {
        return Err(AppError::InvalidPort);
    }

    {
        let current = mcp_state.0.lock().unwrap();
        if let McpRuntimeStatus::Running(handle) = &*current {
            if handle.port == port {
                return Ok(McpStatusInfo {
                    configured: true,
                    port: Some(port),
                    error: None,
                });
            }
        }
    }

    let new_handle = mcp::server::start(state.inner().clone(), port)
        .map_err(|err| AppError::PortUnavailable(err.to_string()))?;

    {
        let mut current = mcp_state.0.lock().unwrap();
        if let McpRuntimeStatus::Running(old_handle) = &*current {
            old_handle.shutdown();
        }
        *current = McpRuntimeStatus::Running(new_handle);
    }

    {
        let db = state.db.lock().unwrap();
        settings::set_mcp_port(&db, port)?;
    }

    Ok(McpStatusInfo {
        configured: true,
        port: Some(port),
        error: None,
    })
}
