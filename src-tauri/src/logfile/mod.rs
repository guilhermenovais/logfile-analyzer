//! Core log-file engine: memory-mapped access, line indexing, search, and
//! timestamp detection. No Tauri dependencies — unit-testable in isolation
//! (Structure Decision, plan.md).

pub mod mmap_index;
pub mod offset;
pub mod query;
pub mod search;
pub mod timestamp;
pub mod view_filter;
