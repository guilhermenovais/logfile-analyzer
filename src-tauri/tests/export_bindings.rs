//! Headless regeneration of `src/bindings/index.ts` (Principle I): runs the
//! same `tauri-specta` export as the debug-build startup path in `lib.rs`,
//! without needing a webview/display.

#[test]
fn export_typescript_bindings() {
    logfile_analyzer_lib::export_bindings("../src/bindings/index.ts");
}
