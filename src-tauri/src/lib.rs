pub mod commands;
pub mod error;
pub mod logfile;
pub mod mcp;
pub mod persistence;
pub mod state;

use std::sync::{Arc, Mutex};

use tauri::Manager;
use tauri_specta::{collect_commands, Builder};

use commands::{files, highlights, search, settings, viewing, workspace};
use mcp::server::{McpRuntimeStatus, McpServerState};
use state::AppState;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
#[specta::specta]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// The set of Tauri commands exposed to the frontend, shared between the
/// runtime invoke handler and the headless TS-binding generator
/// (`tests/export_bindings.rs`, Principle I).
pub fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        greet,
        workspace::create_workspace,
        workspace::get_active_workspace,
        workspace::save_workspace,
        workspace::rename_workspace,
        workspace::discard_draft,
        workspace::list_saved_workspaces,
        workspace::open_workspace,
        workspace::is_workspace_dirty,
        files::add_file,
        files::list_files,
        files::get_file_properties,
        files::get_line,
        files::remove_file,
        viewing::resolve_view_row,
        viewing::stream_lines,
        viewing::subscribe_index_progress,
        viewing::set_view_time_range,
        search::search,
        search::search_with_context,
        search::get_search_history,
        highlights::set_highlight,
        highlights::clear_highlight,
        highlights::set_label,
        highlights::list_highlights,
        settings::get_mcp_status,
        settings::configure_mcp_port,
    ])
}

/// Exports the TS bindings for [`specta_builder`] to `path` (relative to the
/// `src-tauri/` crate root). Used both at debug-build startup and by
/// `tests/export_bindings.rs` for headless regeneration.
pub fn export_bindings(path: &str) {
    specta_builder()
        .export(specta_typescript::Typescript::default(), path)
        .expect("failed to export typescript bindings");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let specta_builder = specta_builder();

    #[cfg(debug_assertions)]
    export_bindings("../src/bindings/index.ts");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |app| {
            specta_builder.mount_events(app);

            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db = persistence::schema::open(&data_dir.join("workspace.sqlite3"))?;
            let active_workspace = workspace::resolve_startup_workspace(&db)?;
            let configured_port = persistence::repo::settings::get_mcp_port(&db)?;
            let entries =
                persistence::repo::log_file_entry::list_for_workspace(&db, active_workspace.id)?;
            let state = Arc::new(AppState::new(db, active_workspace.id));
            workspace::load_workspace_files(&state, entries);

            let mcp_status = match configured_port {
                Some(port) => match mcp::server::start(state.clone(), port) {
                    Ok(handle) => McpRuntimeStatus::Running(handle),
                    Err(err) => McpRuntimeStatus::Failed(err.to_string()),
                },
                None => McpRuntimeStatus::Failed("not configured".into()),
            };

            app.manage(state);
            app.manage(McpServerState(Mutex::new(mcp_status)));

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(mcp_state) = app_handle.try_state::<McpServerState>() {
                    if let McpRuntimeStatus::Running(handle) = &*mcp_state.0.lock().unwrap() {
                        handle.shutdown();
                    }
                }

                if let Some(state) = app_handle.try_state::<Arc<AppState>>() {
                    let active_workspace_id = *state.active_workspace_id.lock().unwrap();
                    let db = state.db.lock().unwrap();
                    let _ = persistence::repo::settings::set_last_active_workspace(
                        &db,
                        active_workspace_id,
                    );
                }
            }
        });
}
