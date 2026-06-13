pub mod commands;
pub mod error;
pub mod logfile;
pub mod mcp;
pub mod persistence;
pub mod state;

use std::sync::Arc;

use tauri::Manager;
use tauri_specta::{collect_commands, Builder};

use commands::{files, highlights, search, viewing, workspace};
use mcp::server::McpServerHandle;
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
        workspace::discard_draft,
        workspace::list_saved_workspaces,
        workspace::open_workspace,
        workspace::is_workspace_dirty,
        files::add_file,
        files::list_files,
        files::get_file_properties,
        files::get_line,
        files::remove_file,
        viewing::stream_lines,
        viewing::subscribe_index_progress,
        search::search,
        search::search_with_context,
        search::get_search_history,
        highlights::set_highlight,
        highlights::clear_highlight,
        highlights::set_label,
        highlights::list_highlights,
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
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |app| {
            specta_builder.mount_events(app);

            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db = persistence::schema::open(&data_dir.join("workspace.sqlite3"))?;
            let active_workspace = persistence::repo::workspace::get_or_create_draft(&db)?;
            let state = Arc::new(AppState::new(db, active_workspace.id));

            let mcp_handle = mcp::server::start(state.clone())?;

            app.manage(state);
            app.manage(mcp_handle);

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(handle) = app_handle.try_state::<McpServerHandle>() {
                    handle.shutdown();
                }
            }
        });
}
