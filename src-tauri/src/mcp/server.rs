//! Lifecycle for the localhost MCP server (research.md §1): binds an `rmcp`
//! Streamable HTTP service to `127.0.0.1` on an OS-assigned port, mounted at
//! `/mcp`, and shuts down when [`McpServerHandle::shutdown`] is called (tied
//! to the Tauri app lifecycle in T014).

use std::sync::Arc;

use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::{StreamableHttpServerConfig, StreamableHttpService};
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;

use crate::state::AppState;

use super::tools::LogAnalyzerMcpServer;

/// Handle to the running MCP server, owned by the Tauri app. Call
/// [`shutdown`](Self::shutdown) on app exit to stop accepting requests.
pub struct McpServerHandle {
    #[allow(dead_code)] // surfaced to the UI from T038 onwards
    pub port: u16,
    cancellation_token: CancellationToken,
}

impl McpServerHandle {
    pub fn shutdown(&self) {
        self.cancellation_token.cancel();
    }
}

/// Binds the MCP Streamable HTTP service to `127.0.0.1:0` (an OS-assigned
/// port) and spawns its accept loop on the Tauri async runtime.
pub fn start(state: Arc<AppState>) -> std::io::Result<McpServerHandle> {
    let cancellation_token = CancellationToken::new();

    let service = StreamableHttpService::new(
        move || Ok(LogAnalyzerMcpServer::new(state.clone())),
        Arc::new(LocalSessionManager::default()),
        StreamableHttpServerConfig::default()
            .with_cancellation_token(cancellation_token.child_token()),
    );
    let router = axum::Router::new().nest_service("/mcp", service);

    let listener = tauri::async_runtime::block_on(TcpListener::bind("127.0.0.1:0"))?;
    let port = listener.local_addr()?.port();

    let shutdown_token = cancellation_token.clone();
    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async move { shutdown_token.cancelled_owned().await })
            .await;
    });

    Ok(McpServerHandle {
        port,
        cancellation_token,
    })
}
