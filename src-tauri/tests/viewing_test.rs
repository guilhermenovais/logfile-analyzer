//! Integration tests (Tauri mock runtime) for `commands::viewing::stream_lines`
//! and `subscribe_index_progress` (contracts/ipc-commands.md, FR-014/FR-032).

use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, RwLock};
use std::time::Duration;

use logfile_analyzer_lib::commands::types::{IndexProgress, LineBatch};
use logfile_analyzer_lib::commands::viewing;
use logfile_analyzer_lib::persistence::repo::workspace;
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
        "viewing_test_{}_{unique}_{name}",
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

#[test]
fn stream_lines_returns_available_lines_while_indexing_incomplete() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();

    let content = b"one\ntwo\nthree\nfour\nfive\n".to_vec();
    let path = write_temp_file("partial.log", &content);
    let mmap = open_mmap(&path);

    let all_offsets = line_offsets(&content);
    assert_eq!(all_offsets.len(), 5);
    // Simulate the background indexer having only published the first 3 of 5
    // lines so far (FR-014: incremental availability).
    let partial_offsets = all_offsets[..3].to_vec();

    let runtime = Arc::new(FileRuntime {
        file_id: 1,
        mmap,
        index: RwLock::new(FileIndex {
            line_offsets: partial_offsets,
            total_lines: 3,
            state: IndexState::Indexing,
            timestamp_profile: None,
            line_timestamps: None,
        }),
    });
    state
        .files
        .write()
        .unwrap()
        .insert("partial".into(), runtime);

    let (channel, rx) = collecting_channel::<LineBatch>();
    viewing::stream_lines(state.clone(), "partial".into(), 1, 10, channel).unwrap();

    let batch = rx.recv_timeout(Duration::from_secs(1)).unwrap();
    assert_eq!(batch.start_index, 1);
    // Only 2 of the 3 published offsets are returned: the 3rd line's end
    // offset isn't known yet while indexing is incomplete.
    assert_eq!(batch.lines, vec!["one", "two"]);
    assert!(rx.recv_timeout(Duration::from_millis(50)).is_err());
}

#[test]
fn stream_lines_paginates_large_ranges_into_multiple_batches() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();

    // 2000 lines of 50 bytes each (~100KB total) so the <100KB-per-batch
    // bound (Principle VI) forces more than one `LineBatch`.
    let line = "x".repeat(49);
    let mut content = String::new();
    for _ in 0..2000 {
        content.push_str(&line);
        content.push('\n');
    }
    let path = write_temp_file("large.log", content.as_bytes());
    let mmap = open_mmap(&path);
    let offsets = line_offsets(content.as_bytes());
    let total = offsets.len();

    let runtime = Arc::new(FileRuntime {
        file_id: 1,
        mmap,
        index: RwLock::new(FileIndex {
            line_offsets: offsets,
            total_lines: total,
            state: IndexState::Ready,
            timestamp_profile: None,
            line_timestamps: None,
        }),
    });
    state.files.write().unwrap().insert("large".into(), runtime);

    let (channel, rx) = collecting_channel::<LineBatch>();
    viewing::stream_lines(state.clone(), "large".into(), 1, total as u32, channel).unwrap();

    let mut batches = Vec::new();
    while let Ok(batch) = rx.recv_timeout(Duration::from_millis(50)) {
        // Each batch must stay comfortably under the 100KB streaming bound.
        let batch_bytes: usize = batch.lines.iter().map(|l| l.len()).sum();
        assert!(batch_bytes < 100 * 1024);
        batches.push(batch);
    }

    assert!(
        batches.len() > 1,
        "expected pagination into multiple batches, got {}",
        batches.len()
    );
    let total_lines: usize = batches.iter().map(|b| b.lines.len()).sum();
    assert_eq!(total_lines, 2000);
}

#[test]
fn subscribe_index_progress_reports_completion() {
    let app = mock_app();
    let state = app.state::<Arc<AppState>>();

    let content = b"a\nb\nc\n".to_vec();
    let path = write_temp_file("ready.log", &content);
    let mmap = open_mmap(&path);
    let offsets = line_offsets(&content);

    let runtime = Arc::new(FileRuntime {
        file_id: 1,
        mmap,
        index: RwLock::new(FileIndex {
            line_offsets: offsets,
            total_lines: 3,
            state: IndexState::Ready,
            timestamp_profile: None,
            line_timestamps: None,
        }),
    });
    state.files.write().unwrap().insert("ready".into(), runtime);

    let (channel, rx) = collecting_channel::<IndexProgress>();
    viewing::subscribe_index_progress(state.clone(), "ready".into(), channel).unwrap();

    let progress = rx.recv_timeout(Duration::from_secs(1)).unwrap();
    assert_eq!(progress.indexed_lines, 3);
    assert!(progress.complete);
}
