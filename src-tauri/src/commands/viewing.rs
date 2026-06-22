//! `stream_lines` and `subscribe_index_progress` (contracts/ipc-commands.md,
//! FR-014/FR-016/FR-032, SC-001).

use std::sync::Arc;
use std::time::Duration;

use tauri::ipc::Channel;
use tauri::State;

use crate::commands::files::resolve_runtime;
use crate::commands::types::{IndexProgress, LineBatch, LineContent};
use crate::error::{AppError, Result};
use crate::logfile::{mmap_index, view_filter};
use crate::state::{AppState, IndexState};

/// Soft cap on the serialized size of a single `LineBatch` (Principle VI:
/// streamed payloads must stay under ~100KB).
const MAX_BATCH_BYTES: usize = 64 * 1024;

/// Maps a 1-based file line index to its 1-based view-row under the current
/// view filter for `alias`. Used by the frontend scroll mechanism to compute
/// the correct virtualizer index before calling `scrollToIndex`.
#[tauri::command]
#[specta::specta]
pub fn resolve_view_row(
    state: State<'_, Arc<AppState>>,
    alias: String,
    line_index: u32,
) -> Result<u32> {
    let runtime = resolve_runtime(&state, &alias)?;
    let view_filter = runtime.view_filter.read().unwrap();
    match &*view_filter {
        None => Ok(line_index),
        Some(indices) => indices
            .binary_search(&line_index)
            .map(|pos| pos as u32 + 1)
            .map_err(|_| AppError::LineOutOfRange),
    }
}

/// Recomputes and caches `runtime.view_filter` for `alias` under
/// `[time_from, time_to]` (epoch-ms, inclusive bounds), and returns the new
/// visible line count — the value `LogViewer`'s virtualizer should use as
/// `count` (FR-001–FR-005, data-model.md §3, contracts/main-view-time-filter.md §1).
#[tauri::command]
#[specta::specta]
pub async fn set_view_time_range(
    state: State<'_, Arc<AppState>>,
    alias: String,
    time_from: Option<f64>,
    time_to: Option<f64>,
) -> Result<u32> {
    let runtime = resolve_runtime(&state, &alias)?;

    tauri::async_runtime::spawn_blocking(move || {
        let index = runtime.index.read().unwrap();
        let effective_timestamps = index.effective_timestamps.as_deref().unwrap_or(&[]);
        let (first_ts, last_ts) = view_filter::timestamp_bounds(effective_timestamps);
        let total_lines = index.total_lines;

        let visible = view_filter::visible_line_indices(
            total_lines,
            effective_timestamps,
            first_ts,
            last_ts,
            time_from.map(|v| v as i64),
            time_to.map(|v| v as i64),
        );
        let count = visible
            .as_ref()
            .map_or(total_lines as u32, |v| v.len() as u32);

        *runtime.view_filter.write().unwrap() = visible;
        count
    })
    .await
    .map_err(|err| AppError::Io(err.to_string()))
}

/// Streams `count` lines starting at the 1-based **view-row** `start_index`,
/// in batches under [`MAX_BATCH_BYTES`]. Works incrementally while indexing
/// is still in progress (FR-014). When `runtime.view_filter` is `Some`, only
/// the cached visible file line indices are addressed, in order
/// (FR-001–FR-005, contracts/main-view-time-filter.md §2).
#[tauri::command]
#[specta::specta]
pub fn stream_lines(
    state: State<'_, Arc<AppState>>,
    alias: String,
    start_index: u32,
    count: u32,
    channel: Channel<LineBatch>,
) -> Result<()> {
    let runtime = resolve_runtime(&state, &alias)?;
    let index = runtime.index.read().unwrap();
    // While indexing is in progress, the end offset of the last published
    // line isn't known yet (`line_bytes` would fall back to EOF and return
    // unindexed content concatenated in). Hold it back until either the next
    // line's start offset is published or indexing completes (FR-014).
    let available = if index.state == IndexState::Ready {
        index.line_offsets.len()
    } else {
        index.line_offsets.len().saturating_sub(1)
    };

    let view_filter = runtime.view_filter.read().unwrap();
    let total_visible = view_filter.as_ref().map_or(available, Vec::len);

    let start = (start_index as usize).max(1);
    let end = (start_index as usize)
        .saturating_add(count as usize)
        .min(total_visible + 1);

    let mut batch = Vec::new();
    let mut batch_size = 0usize;
    let mut batch_first = start;

    for view_row in start..end {
        let line_index = view_filter
            .as_ref()
            .map_or(view_row, |v| v[view_row - 1] as usize);
        let content = mmap_index::line_bytes(&runtime.mmap, &index.line_offsets, line_index)
            .map(|bytes| String::from_utf8_lossy(bytes).into_owned())
            .unwrap_or_default();
        batch_size += content.len();
        batch.push(LineContent {
            line_index: line_index as u32,
            content,
        });

        if batch_size >= MAX_BATCH_BYTES {
            channel
                .send(LineBatch {
                    start_index: batch_first as u32,
                    lines: std::mem::take(&mut batch),
                })
                .map_err(|err| AppError::Io(err.to_string()))?;
            batch_size = 0;
            batch_first = view_row + 1;
        }
    }

    if !batch.is_empty() {
        channel
            .send(LineBatch {
                start_index: batch_first as u32,
                lines: batch,
            })
            .map_err(|err| AppError::Io(err.to_string()))?;
    }

    Ok(())
}

/// Streams index-build progress until the background index reaches
/// `IndexState::Ready` (SC-001).
#[tauri::command]
#[specta::specta]
pub fn subscribe_index_progress(
    state: State<'_, Arc<AppState>>,
    alias: String,
    channel: Channel<IndexProgress>,
) -> Result<()> {
    let runtime = resolve_runtime(&state, &alias)?;

    tauri::async_runtime::spawn(async move {
        loop {
            let (indexed_lines, complete) = {
                let index = runtime.index.read().unwrap();
                (index.total_lines, index.state == IndexState::Ready)
            };

            if channel
                .send(IndexProgress {
                    indexed_lines: indexed_lines as u32,
                    complete,
                })
                .is_err()
                || complete
            {
                break;
            }

            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::RwLock;

    use crate::error::AppError;

    fn resolve(view_filter: &RwLock<Option<Vec<u32>>>, line_index: u32) -> Result<u32, AppError> {
        let guard = view_filter.read().unwrap();
        match &*guard {
            None => Ok(line_index),
            Some(indices) => indices
                .binary_search(&line_index)
                .map(|pos| pos as u32 + 1)
                .map_err(|_| AppError::LineOutOfRange),
        }
    }

    #[test]
    fn identity_mapping_no_filter() {
        let vf = RwLock::new(None);
        assert_eq!(resolve(&vf, 42).unwrap(), 42);
    }

    #[test]
    fn correct_view_row_with_filter() {
        let vf = RwLock::new(Some(vec![2, 5, 10, 15]));
        assert_eq!(resolve(&vf, 2).unwrap(), 1);
        assert_eq!(resolve(&vf, 5).unwrap(), 2);
        assert_eq!(resolve(&vf, 10).unwrap(), 3);
        assert_eq!(resolve(&vf, 15).unwrap(), 4);
    }

    #[test]
    fn line_out_of_range_when_not_in_filter() {
        let vf = RwLock::new(Some(vec![2, 5, 10]));
        assert!(resolve(&vf, 7).is_err());
    }
}
