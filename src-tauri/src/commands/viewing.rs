//! `stream_lines` and `subscribe_index_progress` (contracts/ipc-commands.md,
//! FR-014/FR-016/FR-032, SC-001).

use std::sync::Arc;
use std::time::Duration;

use tauri::ipc::Channel;
use tauri::State;

use crate::commands::files::resolve_runtime;
use crate::commands::types::{IndexProgress, LineBatch};
use crate::error::{AppError, Result};
use crate::logfile::mmap_index;
use crate::state::{AppState, IndexState};

/// Soft cap on the serialized size of a single `LineBatch` (Principle VI:
/// streamed payloads must stay under ~100KB).
const MAX_BATCH_BYTES: usize = 64 * 1024;

/// Streams `count` lines starting at the 1-based `start_index`, in batches
/// under [`MAX_BATCH_BYTES`]. Works incrementally while indexing is still in
/// progress (FR-014).
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

    let start = (start_index as usize).max(1);
    let end = (start_index as usize)
        .saturating_add(count as usize)
        .min(available + 1);

    let mut batch = Vec::new();
    let mut batch_size = 0usize;
    let mut batch_first = start;

    for line_index in start..end {
        let content = mmap_index::line_bytes(&runtime.mmap, &index.line_offsets, line_index)
            .map(|bytes| String::from_utf8_lossy(bytes).into_owned())
            .unwrap_or_default();
        batch_size += content.len();
        batch.push(content);

        if batch_size >= MAX_BATCH_BYTES {
            channel
                .send(LineBatch {
                    start_index: batch_first as u32,
                    lines: std::mem::take(&mut batch),
                })
                .map_err(|err| AppError::Io(err.to_string()))?;
            batch_size = 0;
            batch_first = line_index + 1;
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
