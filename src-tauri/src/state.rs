use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use memmap2::Mmap;
use rusqlite::Connection;
use serde::Serialize;

/// Whether a file's background line-offset index has finished scanning the
/// whole file (FR-014/FR-032).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum IndexState {
    #[default]
    Indexing,
    Ready,
}

/// Which timestamp matcher was detected for a file (research.md §4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum TimestampFormat {
    Iso8601,
    EpochSeconds,
    EpochMillis,
    SpaceSeparated,
    DayFirst,
    Syslog,
    ApacheCombined,
    MonthFirst,
}

/// The detected timestamp pattern for a file (data-model.md
/// "TimestampFormatProfile"), present only if `match_ratio >= 0.70`.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct TimestampFormatProfile {
    pub format: TimestampFormat,
    pub match_ratio: f64,
}

/// Mutable, incrementally-built index state for one open file (data-model.md
/// "FileRuntime"). Guarded by a `RwLock` so the background indexer can extend
/// it while readers (viewing/search/MCP) consult the latest snapshot.
#[derive(Debug, Default)]
pub struct FileIndex {
    pub line_offsets: Vec<u64>,
    pub total_lines: usize,
    pub state: IndexState,
    pub timestamp_profile: Option<TimestampFormatProfile>,
    pub line_timestamps: Option<Vec<Option<i64>>>,
    /// `line_timestamps[i]` if `Some`, else the nearest preceding `Some`
    /// value (carry-forward). Drives FR-004 inheritance for both main-view
    /// filtering and `filter_by_time_range` (data-model.md §1).
    pub effective_timestamps: Option<Vec<Option<i64>>>,
    /// The file's detected log-timestamp UTC offset in minutes (FR-008).
    /// `0` (UTC) unless the detected format is `Iso8601` and a sampled line
    /// carries an explicit offset (data-model.md §1).
    pub utc_offset_minutes: i32,
    /// Set once `detect_and_parse` has returned, regardless of whether a
    /// format was detected. Decouples "timestamp detection settled" from
    /// `state == Ready` (data-model.md §1, research.md §2.2).
    pub timestamp_detection_complete: bool,
}

/// Per-open-file engine state backing viewing, search, get-line, and
/// properties. Rebuilt whenever a file is added/loaded; never persisted.
pub struct FileRuntime {
    pub file_id: i64,
    pub mmap: Mmap,
    pub index: RwLock<FileIndex>,
    /// `None` = identity (all lines visible, in file order). `Some(indices)`
    /// = the ordered 1-based file line indices visible under the currently
    /// committed time range (FR-001–FR-005), set by `set_view_time_range`.
    /// Guarded by its own lock since it's recomputed far more often (every
    /// range commit) than `FileIndex` changes (data-model.md §2).
    pub view_filter: RwLock<Option<Vec<u32>>>,
}

/// Shared application state: the single active workspace and the in-memory
/// registry of open files, keyed by their workspace alias. Used by both the
/// Tauri command layer (UI) and the MCP tool layer (agents) so the two stay
/// consistent (FR-029).
pub struct AppState {
    pub db: Mutex<Connection>,
    pub active_workspace_id: Mutex<i64>,
    pub files: RwLock<HashMap<String, Arc<FileRuntime>>>,
}

impl AppState {
    pub fn new(db: Connection, active_workspace_id: i64) -> Self {
        Self {
            db: Mutex::new(db),
            active_workspace_id: Mutex::new(active_workspace_id),
            files: RwLock::new(HashMap::new()),
        }
    }
}
