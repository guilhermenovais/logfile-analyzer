//! Main-view time range filtering: FR-004 timestamp inheritance and
//! FR-001–FR-005 visible-line computation (research.md §1.2-1.4,
//! data-model.md §4).

use crate::logfile::query::filter_by_time_range;

/// For each line, its own timestamp if `Some`, else the nearest preceding
/// `Some` value (carry-forward). Remains `None` for any line before the
/// first timestamped line (FR-004, research.md §1.3).
pub fn effective_timestamps(line_timestamps: &[Option<i64>]) -> Vec<Option<i64>> {
    let mut result = Vec::with_capacity(line_timestamps.len());
    let mut last_seen: Option<i64> = None;
    for &ts in line_timestamps {
        if ts.is_some() {
            last_seen = ts;
        }
        result.push(last_seen);
    }
    result
}

/// Returns the first and last `Some` entry of `timestamps`, in order, or
/// `(None, None)` if there are none (data-model.md §4, generalizes
/// `commands::files::line_timestamp_bounds`).
pub fn timestamp_bounds(timestamps: &[Option<i64>]) -> (Option<i64>, Option<i64>) {
    let first = timestamps.iter().flatten().next().copied();
    let last = timestamps.iter().flatten().next_back().copied();
    (first, last)
}

/// Computes the ordered 1-based file line indices visible under
/// `[time_from, time_to]` (FR-001–FR-005, research.md §1.2/§1.4).
///
/// Returns `None` (identity, all `total_lines` visible) when either both
/// bounds are `None`, or the requested range fully covers
/// `[first_ts, last_ts]` (the FR-007/009 pre-filled default span, possibly
/// widened) — FR-005's "default span MUST NOT exclude any line". Otherwise
/// returns `Some(filter_by_time_range((1..=total_lines), effective_timestamps,
/// time_from, time_to))`, which drops any line with no effective timestamp.
pub fn visible_line_indices(
    total_lines: usize,
    effective_timestamps: &[Option<i64>],
    first_ts: Option<i64>,
    last_ts: Option<i64>,
    time_from: Option<i64>,
    time_to: Option<i64>,
) -> Option<Vec<u32>> {
    if time_from.is_none() && time_to.is_none() {
        return None;
    }

    let covers_full_span = match (first_ts, last_ts) {
        (Some(first), Some(last)) => {
            time_from.is_some_and(|from| from <= first) && time_to.is_some_and(|to| to >= last)
        }
        _ => false,
    };
    if covers_full_span {
        return None;
    }

    let visible = filter_by_time_range(
        (1..=total_lines).collect(),
        effective_timestamps,
        time_from,
        time_to,
    );
    Some(visible.into_iter().map(|i| i as u32).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn effective_timestamps_carries_forward_from_nearest_preceding() {
        let line_timestamps = vec![None, Some(100), None, None, Some(400)];
        assert_eq!(
            effective_timestamps(&line_timestamps),
            vec![None, Some(100), Some(100), Some(100), Some(400)]
        );
    }

    #[test]
    fn effective_timestamps_remains_none_before_first_timestamped_line() {
        let line_timestamps = vec![None, None, Some(300)];
        assert_eq!(
            effective_timestamps(&line_timestamps),
            vec![None, None, Some(300)]
        );
    }

    #[test]
    fn effective_timestamps_is_identity_when_every_line_has_its_own() {
        let line_timestamps = vec![Some(100), Some(200), Some(300)];
        assert_eq!(
            effective_timestamps(&line_timestamps),
            vec![Some(100), Some(200), Some(300)]
        );
    }

    #[test]
    fn timestamp_bounds_returns_first_and_last_some() {
        let timestamps = vec![None, Some(100), Some(200), None, Some(400)];
        assert_eq!(timestamp_bounds(&timestamps), (Some(100), Some(400)));
    }

    #[test]
    fn timestamp_bounds_is_none_for_no_timestamps() {
        let timestamps = vec![None, None, None];
        assert_eq!(timestamp_bounds(&timestamps), (None, None));
    }

    #[test]
    fn visible_line_indices_is_none_for_no_bounds() {
        let timestamps = vec![Some(100), Some(200), Some(300)];
        assert_eq!(
            visible_line_indices(3, &timestamps, Some(100), Some(300), None, None),
            None
        );
    }

    #[test]
    fn visible_line_indices_is_none_for_exact_full_span() {
        let timestamps = vec![Some(100), Some(200), Some(300)];
        assert_eq!(
            visible_line_indices(3, &timestamps, Some(100), Some(300), Some(100), Some(300)),
            None
        );
    }

    #[test]
    fn visible_line_indices_is_none_when_requested_range_widens_beyond_full_span() {
        let timestamps = vec![Some(100), Some(200), Some(300)];
        assert_eq!(
            visible_line_indices(3, &timestamps, Some(100), Some(300), Some(0), Some(1000)),
            None
        );
    }

    #[test]
    fn visible_line_indices_returns_subset_for_narrower_range() {
        let timestamps = vec![Some(100), Some(200), Some(300)];
        assert_eq!(
            visible_line_indices(3, &timestamps, Some(100), Some(300), Some(100), Some(200)),
            Some(vec![1, 2])
        );
    }

    #[test]
    fn visible_line_indices_returns_empty_when_range_excludes_everything() {
        let timestamps = vec![Some(100), Some(200), Some(300)];
        assert_eq!(
            visible_line_indices(3, &timestamps, Some(100), Some(300), Some(400), Some(500)),
            Some(vec![])
        );
    }

    #[test]
    fn visible_line_indices_uses_effective_timestamps_for_inheritance() {
        // Line 2 has no own timestamp but inherits line 1's via
        // effective_timestamps (FR-004).
        let line_timestamps = vec![Some(100), None, Some(300)];
        let effective = effective_timestamps(&line_timestamps);
        assert_eq!(
            visible_line_indices(3, &effective, Some(100), Some(300), Some(100), Some(150)),
            Some(vec![1, 2])
        );
    }
}
