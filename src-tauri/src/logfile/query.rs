//! Search-with-context windowing and bounds clamping (research.md §3).

use memmap2::Mmap;

use crate::logfile::mmap_index::line_bytes;
use crate::logfile::search::{scan_matches, CompiledQuery};

/// Default `surrounding_count` when unspecified (contracts/mcp-tools.md, FR-025).
pub const DEFAULT_SURROUNDING_COUNT: usize = 5;

/// Maximum `surrounding_count`; larger values are clamped, not rejected
/// (contracts/mcp-tools.md, FR-025).
pub const MAX_SURROUNDING_COUNT: usize = 200;

/// Caps the number of matches returned by `search_with_context` in a single
/// response; any remaining matches are signalled via `truncated`
/// (contracts/mcp-tools.md).
pub const MAX_MATCHES: usize = 100;

/// Resolves the effective surrounding-line count: `None` defaults to
/// [`DEFAULT_SURROUNDING_COUNT`], `Some(n)` is clamped to
/// [`MAX_SURROUNDING_COUNT`].
pub fn resolve_surrounding_count(requested: Option<usize>) -> usize {
    requested
        .unwrap_or(DEFAULT_SURROUNDING_COUNT)
        .min(MAX_SURROUNDING_COUNT)
}

/// One line of match/context content (contracts/mcp-tools.md `LineContent`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LineContent {
    pub line_index: usize,
    pub content: String,
}

/// A single match with its surrounding context (contracts/mcp-tools.md
/// `search_with_context`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextMatch {
    pub line_index: usize,
    pub before: Vec<LineContent>,
    pub matched: LineContent,
    pub after: Vec<LineContent>,
}

/// Result of a search-with-context scan.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SearchWithContextResult {
    pub matches: Vec<ContextMatch>,
    pub truncated: bool,
}

fn line_content(mmap: &Mmap, line_offsets: &[u64], line_index: usize) -> Option<LineContent> {
    line_bytes(mmap, line_offsets, line_index).map(|bytes| LineContent {
        line_index,
        content: String::from_utf8_lossy(bytes).into_owned(),
    })
}

/// Per-line parsed timestamps (epoch-ms) and an optional inclusive
/// `[time_from, time_to]` bound, as passed to [`search_with_context`] and
/// [`filter_by_time_range`] (FR-012/FR-013).
pub type TimeFilter<'a> = (&'a [Option<i64>], Option<i64>, Option<i64>);

/// Filters 1-based `match_indices` to only those whose `line_timestamps`
/// entry falls within `[time_from, time_to]` (each bound optional,
/// inclusive). Lines without a parsed timestamp are excluded. A no-op when
/// both bounds are `None`.
pub fn filter_by_time_range(
    match_indices: Vec<usize>,
    line_timestamps: &[Option<i64>],
    time_from: Option<i64>,
    time_to: Option<i64>,
) -> Vec<usize> {
    if time_from.is_none() && time_to.is_none() {
        return match_indices;
    }
    match_indices
        .into_iter()
        .filter(|&line_index| {
            line_timestamps
                .get(line_index - 1)
                .copied()
                .flatten()
                .map(|ts| {
                    time_from.map(|from| ts >= from).unwrap_or(true)
                        && time_to.map(|to| ts <= to).unwrap_or(true)
                })
                .unwrap_or(false)
        })
        .collect()
}

/// Runs `query` over the file and collects each match with up to
/// `surrounding_count` lines of context before/after, clamped to the file's
/// boundaries (no error near start/end, contracts/mcp-tools.md Edge Cases).
/// At most [`MAX_MATCHES`] matches are returned; `truncated` signals whether
/// more were found. `time_filter`, if given, restricts matches to lines whose
/// parsed timestamp falls within `[time_from, time_to]` (FR-012/FR-013).
pub(crate) fn search_with_context(
    mmap: &Mmap,
    line_offsets: &[u64],
    query: &CompiledQuery,
    surrounding_count: usize,
    time_filter: Option<TimeFilter>,
) -> SearchWithContextResult {
    let total = line_offsets.len();
    let mut match_indices = scan_matches(mmap, line_offsets, query);
    if let Some((line_timestamps, time_from, time_to)) = time_filter {
        match_indices = filter_by_time_range(match_indices, line_timestamps, time_from, time_to);
    }
    let truncated = match_indices.len() > MAX_MATCHES;

    let matches = match_indices
        .into_iter()
        .take(MAX_MATCHES)
        .map(|line_index| {
            let before_start = line_index.saturating_sub(surrounding_count).max(1);
            let after_end = (line_index + surrounding_count).min(total);

            let before = (before_start..line_index)
                .filter_map(|i| line_content(mmap, line_offsets, i))
                .collect();
            let after = ((line_index + 1)..=after_end)
                .filter_map(|i| line_content(mmap, line_offsets, i))
                .collect();
            let matched = line_content(mmap, line_offsets, line_index).unwrap_or(LineContent {
                line_index,
                content: String::new(),
            });

            ContextMatch {
                line_index,
                before,
                matched,
                after,
            }
        })
        .collect();

    SearchWithContextResult { matches, truncated }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::logfile::mmap_index;
    use crate::logfile::search::SearchType;
    use crate::state::FileIndex;
    use std::fs::File;
    use std::io::Write;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::RwLock;

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn write_temp_file(contents: &[u8]) -> std::path::PathBuf {
        let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
        let mut path = std::env::temp_dir();
        path.push(format!("query_test_{}_{unique}", std::process::id()));
        File::create(&path).unwrap().write_all(contents).unwrap();
        path
    }

    fn indexed(contents: &[u8]) -> (Mmap, Vec<u64>) {
        let path = write_temp_file(contents);
        let mmap = mmap_index::open(&path).unwrap();
        let index = RwLock::new(FileIndex::default());
        mmap_index::build_line_index(&mmap, &index);
        let offsets = index.read().unwrap().line_offsets.clone();
        std::fs::remove_file(&path).unwrap();
        (mmap, offsets)
    }

    #[test]
    fn resolve_surrounding_count_defaults_to_5() {
        assert_eq!(resolve_surrounding_count(None), DEFAULT_SURROUNDING_COUNT);
    }

    #[test]
    fn resolve_surrounding_count_clamps_to_max() {
        assert_eq!(resolve_surrounding_count(Some(1000)), MAX_SURROUNDING_COUNT);
    }

    #[test]
    fn resolve_surrounding_count_passes_through_within_range() {
        assert_eq!(resolve_surrounding_count(Some(2)), 2);
    }

    #[test]
    fn context_window_clamps_at_start_of_file() {
        let (mmap, offsets) = indexed(b"one\ntwo\nthree\nfour\nfive\n");
        let query = CompiledQuery::compile(SearchType::Logical, r#""one""#).unwrap();

        let result = search_with_context(&mmap, &offsets, &query, 5, None);

        assert_eq!(result.matches.len(), 1);
        let m = &result.matches[0];
        assert_eq!(m.line_index, 1);
        assert!(m.before.is_empty());
        assert_eq!(m.after.len(), 4);
        assert_eq!(m.after.last().unwrap().line_index, 5);
        assert!(!result.truncated);
    }

    #[test]
    fn context_window_clamps_at_end_of_file() {
        let (mmap, offsets) = indexed(b"one\ntwo\nthree\nfour\nfive\n");
        let query = CompiledQuery::compile(SearchType::Logical, r#""five""#).unwrap();

        let result = search_with_context(&mmap, &offsets, &query, 5, None);

        assert_eq!(result.matches.len(), 1);
        let m = &result.matches[0];
        assert_eq!(m.line_index, 5);
        assert!(m.after.is_empty());
        assert_eq!(m.before.len(), 4);
        assert_eq!(m.before.first().unwrap().line_index, 1);
    }

    #[test]
    fn middle_match_has_full_context_window() {
        let (mmap, offsets) = indexed(b"a\nb\nc\nd\ne\nf\ng\n");
        let query = CompiledQuery::compile(SearchType::Logical, r#""d""#).unwrap();

        let result = search_with_context(&mmap, &offsets, &query, 2, None);

        assert_eq!(result.matches.len(), 1);
        let m = &result.matches[0];
        assert_eq!(m.line_index, 4);
        assert_eq!(
            m.before.iter().map(|l| l.line_index).collect::<Vec<_>>(),
            vec![2, 3]
        );
        assert_eq!(
            m.after.iter().map(|l| l.line_index).collect::<Vec<_>>(),
            vec![5, 6]
        );
        assert_eq!(m.matched.content, "d");
    }

    #[test]
    fn truncated_flag_set_when_matches_exceed_cap() {
        let contents = "match\n".repeat(MAX_MATCHES + 1);
        let (mmap, offsets) = indexed(contents.as_bytes());
        let query = CompiledQuery::compile(SearchType::Logical, r#""match""#).unwrap();

        let result = search_with_context(&mmap, &offsets, &query, 0, None);

        assert_eq!(result.matches.len(), MAX_MATCHES);
        assert!(result.truncated);
    }

    #[test]
    fn filter_by_time_range_is_noop_without_bounds() {
        let indices = vec![1, 2, 3];
        let timestamps = vec![Some(100), None, Some(300)];
        assert_eq!(
            filter_by_time_range(indices.clone(), &timestamps, None, None),
            indices
        );
    }

    #[test]
    fn filter_by_time_range_excludes_lines_without_timestamps() {
        let indices = vec![1, 2, 3];
        let timestamps = vec![Some(100), None, Some(300)];
        assert_eq!(
            filter_by_time_range(indices, &timestamps, Some(0), Some(1000)),
            vec![1, 3]
        );
    }

    #[test]
    fn filter_by_time_range_applies_inclusive_bounds() {
        let indices = vec![1, 2, 3];
        let timestamps = vec![Some(100), Some(200), Some(300)];
        assert_eq!(
            filter_by_time_range(indices, &timestamps, Some(100), Some(200)),
            vec![1, 2]
        );
    }

    #[test]
    fn search_with_context_applies_time_filter() {
        let (mmap, offsets) = indexed(b"match one\nmatch two\nmatch three\n");
        let query = CompiledQuery::compile(SearchType::Logical, r#""match""#).unwrap();
        let timestamps = vec![Some(100), Some(200), Some(300)];

        let result = search_with_context(
            &mmap,
            &offsets,
            &query,
            0,
            Some((&timestamps, Some(150), Some(250))),
        );

        assert_eq!(result.matches.len(), 1);
        assert_eq!(result.matches[0].line_index, 2);
    }
}
