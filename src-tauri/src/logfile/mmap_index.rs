//! Read-only `memmap2` mapping plus a background line-offset index builder
//! (research.md §2).

use std::fs::File;
use std::path::Path;
use std::sync::RwLock;

use memmap2::Mmap;

use crate::state::{FileIndex, IndexState};

/// Number of line offsets discovered between incremental publishes to the
/// shared [`FileIndex`], so viewers can render before the scan completes
/// (FR-014/FR-032).
const INDEX_BATCH_LINES: usize = 4096;

/// Opens `path` as a read-only memory map (research.md §2).
pub fn open(path: &Path) -> std::io::Result<Mmap> {
    let file = File::open(path)?;
    unsafe { Mmap::map(&file) }
}

/// Scans `mmap` for line-start byte offsets, publishing them to `index` in
/// batches so readers see progress before the scan completes. Sets
/// `index.state = Ready` and `index.total_lines` once the whole file has been
/// scanned. Intended to run on a blocking thread (`spawn_blocking`).
pub fn build_line_index(mmap: &Mmap, index: &RwLock<FileIndex>) {
    let data: &[u8] = mmap;
    let mut batch = Vec::with_capacity(INDEX_BATCH_LINES);

    if !data.is_empty() {
        batch.push(0u64);
    }

    for (i, &byte) in data.iter().enumerate() {
        if byte == b'\n' && i + 1 < data.len() {
            batch.push((i + 1) as u64);
        }
        if batch.len() >= INDEX_BATCH_LINES {
            publish(index, &mut batch, false);
            // Yield between batches so readers (viewer, MCP tools) are not
            // starved while a large file is being scanned.
            std::thread::yield_now();
        }
    }

    publish(index, &mut batch, true);
}

fn publish(index: &RwLock<FileIndex>, batch: &mut Vec<u64>, done: bool) {
    let mut guard = index.write().expect("file index lock poisoned");
    guard.line_offsets.append(batch);
    guard.total_lines = guard.line_offsets.len();
    if done {
        guard.state = IndexState::Ready;
    }
}

/// Returns the bytes of the 1-based `line_index`, with its trailing
/// `\n`/`\r\n` stripped, or `None` if it is beyond the offsets discovered so
/// far (`line_offsets.len()`).
pub fn line_bytes<'a>(mmap: &'a Mmap, line_offsets: &[u64], line_index: usize) -> Option<&'a [u8]> {
    if line_index == 0 || line_index > line_offsets.len() {
        return None;
    }
    let start = line_offsets[line_index - 1] as usize;
    let end = line_offsets
        .get(line_index)
        .map(|&o| o as usize)
        .unwrap_or(mmap.len());

    let mut slice = &mmap[start..end];
    if slice.ends_with(b"\n") {
        slice = &slice[..slice.len() - 1];
        if slice.ends_with(b"\r") {
            slice = &slice[..slice.len() - 1];
        }
    }
    Some(slice)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;
    use std::thread;
    use std::time::{Duration, Instant};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn write_temp_file(contents: &[u8]) -> std::path::PathBuf {
        let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
        let mut path = std::env::temp_dir();
        path.push(format!(
            "mmap_index_test_{}_{}_{unique}",
            std::process::id(),
            line!()
        ));
        let mut f = File::create(&path).unwrap();
        f.write_all(contents).unwrap();
        path
    }

    #[test]
    fn computes_offsets_for_small_sample() {
        let path = write_temp_file(b"alpha\nbeta\ngamma");
        let mmap = open(&path).unwrap();
        let index = RwLock::new(FileIndex::default());

        build_line_index(&mmap, &index);

        let guard = index.read().unwrap();
        assert_eq!(guard.line_offsets, vec![0, 6, 11]);
        assert_eq!(guard.total_lines, 3);
        assert_eq!(guard.state, IndexState::Ready);
        drop(guard);
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn trailing_newline_does_not_add_an_empty_line() {
        let path = write_temp_file(b"one\ntwo\n");
        let mmap = open(&path).unwrap();
        let index = RwLock::new(FileIndex::default());

        build_line_index(&mmap, &index);

        let guard = index.read().unwrap();
        assert_eq!(guard.line_offsets, vec![0, 4]);
        assert_eq!(guard.total_lines, 2);
        assert_eq!(guard.state, IndexState::Ready);
        drop(guard);
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn empty_file_has_no_lines() {
        let path = write_temp_file(b"");
        let mmap = open(&path).unwrap();
        let index = RwLock::new(FileIndex::default());

        build_line_index(&mmap, &index);

        let guard = index.read().unwrap();
        assert_eq!(guard.line_offsets, Vec::<u64>::new());
        assert_eq!(guard.total_lines, 0);
        assert_eq!(guard.state, IndexState::Ready);
        drop(guard);
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn index_is_incrementally_available_before_completion() {
        let line_count = INDEX_BATCH_LINES * 3;
        let mut contents = String::new();
        for i in 0..line_count {
            contents.push_str(&format!("line {i}\n"));
        }
        let path = write_temp_file(contents.as_bytes());
        let mmap = Arc::new(open(&path).unwrap());
        let index = Arc::new(RwLock::new(FileIndex::default()));

        let mmap_clone = mmap.clone();
        let index_clone = index.clone();
        let handle = thread::spawn(move || {
            build_line_index(&mmap_clone, &index_clone);
        });

        let mut saw_partial_progress = false;
        let deadline = Instant::now() + Duration::from_secs(10);
        while Instant::now() < deadline {
            let guard = index.read().unwrap();
            let partial = guard.total_lines > 0 && guard.total_lines < line_count;
            let still_indexing = guard.state == IndexState::Indexing;
            drop(guard);
            if partial && still_indexing {
                saw_partial_progress = true;
                break;
            }
            thread::sleep(Duration::from_micros(50));
        }
        assert!(
            saw_partial_progress,
            "expected to observe the index partially populated before completion"
        );

        handle.join().unwrap();

        let guard = index.read().unwrap();
        assert_eq!(guard.total_lines, line_count);
        assert_eq!(guard.line_offsets.len(), line_count);
        assert_eq!(guard.state, IndexState::Ready);
        drop(guard);
        std::fs::remove_file(&path).unwrap();
    }
}
