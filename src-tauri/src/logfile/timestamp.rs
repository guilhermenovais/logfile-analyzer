//! Sample-based timestamp format detection and per-line epoch-ms parsing
//! (research.md §4). Implemented in User Story 5 (T067).

use std::sync::RwLock;

use chrono::{DateTime, NaiveDateTime};
use memmap2::Mmap;

use crate::logfile::mmap_index::line_bytes;
use crate::logfile::offset;
use crate::logfile::view_filter;
use crate::state::{FileIndex, TimestampFormat, TimestampFormatProfile};

/// Number of lines sampled to detect a file's timestamp format (FR-011).
pub const SAMPLE_SIZE: usize = 1000;

/// Minimum proportion of the sample that must match a format for it to be
/// considered "detected" (FR-011).
pub const DETECTION_THRESHOLD: f64 = 0.70;

/// Formats tried during detection, in preference order.
const CANDIDATE_FORMATS: &[TimestampFormat] = &[
    TimestampFormat::Iso8601,
    TimestampFormat::EpochMillis,
    TimestampFormat::EpochSeconds,
    TimestampFormat::SpaceSeparated,
];

/// `NaiveDateTime` formats accepted for ISO-8601 timestamps without a
/// timezone offset (assumed UTC).
const ISO8601_NAIVE_FORMATS: &[&str] = &["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%dT%H:%M:%S"];

/// Parses an epoch-millisecond timestamp from an ISO-8601 string (with or
/// without a `Z`/offset suffix). Used both for per-line detection and for
/// parsing `time_from`/`time_to` bounds (MCP `search_with_context`).
pub fn parse_iso8601(token: &str) -> Option<i64> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(token) {
        return Some(dt.timestamp_millis());
    }
    for format in ISO8601_NAIVE_FORMATS {
        if let Ok(naive) = NaiveDateTime::parse_from_str(token, format) {
            return Some(naive.and_utc().timestamp_millis());
        }
    }
    None
}

/// Parses an epoch timestamp from a string of ASCII digits whose length
/// falls within `digit_range`, converting to epoch-milliseconds via
/// `to_millis`.
fn parse_epoch(
    token: &str,
    digit_range: std::ops::RangeInclusive<usize>,
    to_millis: i64,
) -> Option<i64> {
    if token.is_empty() || !token.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    if !digit_range.contains(&token.len()) {
        return None;
    }
    token.parse::<i64>().ok().map(|v| v * to_millis)
}

/// Parses a `SpaceSeparated` timestamp (data-model.md "Parsing algorithm for
/// SpaceSeparated"): the first two whitespace-separated tokens of `line` are
/// `YYYY-MM-DD` and `HH:MM:SS[.fff]` or `HH:MM:SS[,fff]`.
fn parse_space_separated(line: &str) -> Option<i64> {
    let mut tokens = line.split_whitespace();
    let date_token = tokens.next()?;
    let time_token = tokens.next()?;
    let time_token = time_token.replacen(',', ".", 1);
    let candidate = format!("{date_token} {time_token}");
    let naive = NaiveDateTime::parse_from_str(&candidate, "%Y-%m-%d %H:%M:%S%.f").ok()?;
    Some(naive.and_utc().timestamp_millis())
}

/// Extracts an epoch-millisecond timestamp from the start of `line` for the
/// given `format`, or `None` if the leading token doesn't match.
pub fn extract_timestamp(line: &str, format: TimestampFormat) -> Option<i64> {
    let token = line.split_whitespace().next()?;
    match format {
        TimestampFormat::Iso8601 => parse_iso8601(token),
        TimestampFormat::EpochSeconds => parse_epoch(token, 9..=10, 1000),
        TimestampFormat::EpochMillis => parse_epoch(token, 12..=13, 1),
        TimestampFormat::SpaceSeparated => parse_space_separated(line),
    }
}

/// Detects the dominant timestamp format across `sample_lines`, returning a
/// [`TimestampFormatProfile`] only if some format's match ratio reaches
/// [`DETECTION_THRESHOLD`] (FR-011). Returns `None` for an empty sample.
pub fn detect_format<'a>(
    sample_lines: impl Iterator<Item = &'a str>,
) -> Option<TimestampFormatProfile> {
    let mut total = 0usize;
    let mut counts = [0usize; CANDIDATE_FORMATS.len()];

    for line in sample_lines {
        total += 1;
        for (i, &format) in CANDIDATE_FORMATS.iter().enumerate() {
            if extract_timestamp(line, format).is_some() {
                counts[i] += 1;
            }
        }
    }

    if total == 0 {
        return None;
    }

    counts
        .iter()
        .enumerate()
        .filter_map(|(i, &count)| {
            let match_ratio = count as f64 / total as f64;
            if match_ratio >= DETECTION_THRESHOLD {
                Some(TimestampFormatProfile {
                    format: CANDIDATE_FORMATS[i],
                    match_ratio,
                })
            } else {
                None
            }
        })
        .max_by(|a, b| a.match_ratio.partial_cmp(&b.match_ratio).unwrap())
}

/// Parses an epoch-ms timestamp for every line in `line_offsets` using
/// `format`.
fn parse_line_timestamps(
    mmap: &Mmap,
    line_offsets: &[u64],
    format: TimestampFormat,
) -> Vec<Option<i64>> {
    (1..=line_offsets.len())
        .map(|line_index| {
            line_bytes(mmap, line_offsets, line_index)
                .and_then(|bytes| extract_timestamp(&String::from_utf8_lossy(bytes), format))
        })
        .collect()
}

/// Samples up to [`SAMPLE_SIZE`] lines, detects a timestamp format
/// (FR-011), and if one is detected, parses an epoch-ms timestamp for every
/// line, storing the results on `index`. Intended to run on a blocking
/// thread, after [`crate::logfile::mmap_index::build_line_index`] has
/// populated `line_offsets` (research.md §4).
pub fn detect_and_parse(mmap: &Mmap, index: &RwLock<FileIndex>) {
    let line_offsets = index.read().unwrap().line_offsets.clone();
    let sample_size = line_offsets.len().min(SAMPLE_SIZE);

    let sample: Vec<String> = (1..=sample_size)
        .filter_map(|line_index| {
            line_bytes(mmap, &line_offsets, line_index)
                .map(|bytes| String::from_utf8_lossy(bytes).into_owned())
        })
        .collect();

    let Some(profile) = detect_format(sample.iter().map(String::as_str)) else {
        return;
    };

    let line_timestamps = parse_line_timestamps(mmap, &line_offsets, profile.format);
    let effective_timestamps = view_filter::effective_timestamps(&line_timestamps);
    let utc_offset_minutes = if profile.format == TimestampFormat::Iso8601 {
        offset::detect_utc_offset_minutes(&sample)
    } else {
        0
    };

    let mut guard = index.write().unwrap();
    guard.timestamp_profile = Some(profile);
    guard.line_timestamps = Some(line_timestamps);
    guard.effective_timestamps = Some(effective_timestamps);
    guard.utc_offset_minutes = utc_offset_minutes;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_timestamp_parses_iso8601_with_z() {
        let ms = extract_timestamp("2026-06-12T10:00:00Z connected", TimestampFormat::Iso8601);
        assert_eq!(ms, Some(1781258400000));
    }

    #[test]
    fn extract_timestamp_parses_iso8601_with_offset() {
        let ms = extract_timestamp(
            "2026-06-12T12:00:00+02:00 connected",
            TimestampFormat::Iso8601,
        );
        assert_eq!(ms, Some(1781258400000));
    }

    #[test]
    fn extract_timestamp_parses_iso8601_without_timezone() {
        let ms = extract_timestamp(
            "2026-06-12T10:00:00.500 connected",
            TimestampFormat::Iso8601,
        );
        assert_eq!(ms, Some(1781258400500));
    }

    #[test]
    fn extract_timestamp_parses_epoch_seconds() {
        let ms = extract_timestamp("1781258400 connected", TimestampFormat::EpochSeconds);
        assert_eq!(ms, Some(1781258400000));
    }

    #[test]
    fn extract_timestamp_parses_epoch_millis() {
        let ms = extract_timestamp("1781258400000 connected", TimestampFormat::EpochMillis);
        assert_eq!(ms, Some(1781258400000));
    }

    #[test]
    fn extract_timestamp_returns_none_for_non_matching_format() {
        assert_eq!(
            extract_timestamp("not-a-timestamp connected", TimestampFormat::Iso8601),
            None
        );
        assert_eq!(
            extract_timestamp(
                "2026-06-12T10:00:00Z connected",
                TimestampFormat::EpochSeconds
            ),
            None
        );
    }

    #[test]
    fn detect_format_returns_none_for_empty_sample() {
        assert!(detect_format(std::iter::empty()).is_none());
    }

    #[test]
    fn detect_format_picks_iso8601_when_dominant() {
        let lines = vec![
            "2026-06-12T10:00:00Z one",
            "2026-06-12T10:00:01Z two",
            "2026-06-12T10:00:02Z three",
            "no timestamp here",
        ];
        let profile = detect_format(lines.into_iter()).unwrap();
        assert_eq!(profile.format, TimestampFormat::Iso8601);
        assert!((profile.match_ratio - 0.75).abs() < f64::EPSILON);
    }

    #[test]
    fn detect_format_picks_epoch_millis_when_dominant() {
        let lines = vec![
            "1781258400000 one",
            "1781258401000 two",
            "1781258402000 three",
            "1781258403000 four",
        ];
        let profile = detect_format(lines.into_iter()).unwrap();
        assert_eq!(profile.format, TimestampFormat::EpochMillis);
        assert!((profile.match_ratio - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn detect_format_picks_epoch_seconds_when_dominant() {
        let lines = vec!["1781258400 one", "1781258401 two", "1781258402 three"];
        let profile = detect_format(lines.into_iter()).unwrap();
        assert_eq!(profile.format, TimestampFormat::EpochSeconds);
    }

    #[test]
    fn detect_format_returns_none_below_threshold() {
        let lines = vec![
            "2026-06-12T10:00:00Z one",
            "no timestamp two",
            "no timestamp three",
            "no timestamp four",
        ];
        assert!(detect_format(lines.into_iter()).is_none());
    }

    #[test]
    fn parse_iso8601_rejects_non_timestamp() {
        assert_eq!(parse_iso8601("not-a-timestamp"), None);
    }

    #[test]
    fn extract_timestamp_parses_space_separated_with_period_millis() {
        let ms = extract_timestamp(
            "2026-05-21 18:14:06.043 [main] INFO com.zaxxer.hikari.HikariDataSource - HikariPool-1 - Starting...",
            TimestampFormat::SpaceSeparated,
        );
        assert_eq!(ms, Some(1779387246043));
    }

    #[test]
    fn detect_format_picks_space_separated_when_dominant() {
        let lines = vec![
            "2026-05-21 18:14:06.043 [main] INFO one",
            "2026-05-21 18:14:07.100 [main] INFO two",
            "2026-05-21 18:14:08.250 [main] INFO three",
            "no timestamp here",
        ];
        let profile = detect_format(lines.into_iter()).unwrap();
        assert_eq!(profile.format, TimestampFormat::SpaceSeparated);
        assert!((profile.match_ratio - 0.75).abs() < f64::EPSILON);
    }

    #[test]
    fn extract_timestamp_parses_space_separated_with_comma_millis() {
        let ms = extract_timestamp(
            "2026-05-21 18:14:06,043 [main] INFO com.zaxxer.hikari.HikariDataSource - HikariPool-1 - Starting...",
            TimestampFormat::SpaceSeparated,
        );
        assert_eq!(ms, Some(1779387246043));
    }

    #[test]
    fn extract_timestamp_parses_space_separated_without_fraction() {
        let ms = extract_timestamp(
            "2026-05-21 18:14:06 [main] INFO com.zaxxer.hikari.HikariDataSource - HikariPool-1 - Starting...",
            TimestampFormat::SpaceSeparated,
        );
        assert_eq!(ms, Some(1779387246000));
    }

    #[test]
    fn extract_timestamp_space_separated_does_not_match_iso8601_or_epoch_lines() {
        assert_eq!(
            extract_timestamp(
                "2026-06-12T10:00:00Z connected",
                TimestampFormat::SpaceSeparated
            ),
            None
        );
        assert_eq!(
            extract_timestamp("1781258400000 connected", TimestampFormat::SpaceSeparated),
            None
        );
    }

    #[test]
    fn extract_timestamp_space_separated_rejects_invalid_calendar_value() {
        assert_eq!(
            extract_timestamp(
                "2026-13-01 10:00:00 bad month",
                TimestampFormat::SpaceSeparated
            ),
            None
        );
    }

    #[test]
    fn detect_format_picks_iso8601_for_mixed_iso8601_and_space_separated_sample() {
        let lines = vec![
            "2026-06-12T10:00:00Z one",
            "2026-06-12T10:00:01Z two",
            "2026-06-12T10:00:02Z three",
            "2026-05-21 18:14:06.043 [main] INFO four",
        ];
        let profile = detect_format(lines.into_iter()).unwrap();
        assert_eq!(profile.format, TimestampFormat::Iso8601);
        assert!((profile.match_ratio - 0.75).abs() < f64::EPSILON);
    }
}
