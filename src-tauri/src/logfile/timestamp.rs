//! Sample-based timestamp format detection and per-line epoch-ms parsing
//! (research.md §4). Implemented in User Story 5 (T067).

use std::sync::{OnceLock, RwLock};
use std::time::SystemTime;

use chrono::{DateTime, Datelike, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use memmap2::Mmap;
use regex::Regex;

use crate::logfile::mmap_index::line_bytes;
use crate::logfile::offset;
use crate::logfile::view_filter;
use crate::state::{FileIndex, TimestampFormat, TimestampFormatProfile};

/// Number of lines sampled to detect a file's timestamp format (FR-011).
pub const SAMPLE_SIZE: usize = 1000;

/// Minimum proportion of the sample that must match a format for it to be
/// considered "detected" (FR-011).
pub const DETECTION_THRESHOLD: f64 = 0.70;

/// Formats tried during detection, in preference order (research.md §4).
const CANDIDATE_FORMATS: &[TimestampFormat] = &[
    TimestampFormat::Iso8601,
    TimestampFormat::SpaceSeparated,
    TimestampFormat::ApacheCombined,
    TimestampFormat::Syslog,
    TimestampFormat::EpochMillis,
    TimestampFormat::EpochSeconds,
    TimestampFormat::DayFirst,
    TimestampFormat::MonthFirst,
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

fn parse_day_first(line: &str) -> Option<i64> {
    let mut tokens = line.split_whitespace();
    let date_token = tokens.next()?;
    let time_token = tokens.next()?;
    let time_token = time_token.replacen(',', ".", 1);
    let candidate = format!("{date_token} {time_token}");
    for fmt in &["%d-%m-%Y %H:%M:%S%.f", "%d/%m/%Y %H:%M:%S%.f"] {
        if let Ok(naive) = NaiveDateTime::parse_from_str(&candidate, fmt) {
            return Some(naive.and_utc().timestamp_millis());
        }
    }
    None
}

fn parse_month_first(line: &str) -> Option<i64> {
    let mut tokens = line.split_whitespace();
    let date_token = tokens.next()?;
    let time_token = tokens.next()?;
    let time_token = time_token.replacen(',', ".", 1);
    let candidate = format!("{date_token} {time_token}");
    let naive = NaiveDateTime::parse_from_str(&candidate, "%m/%d/%Y %H:%M:%S%.f").ok()?;
    Some(naive.and_utc().timestamp_millis())
}

fn parse_syslog(line: &str, file_mtime: Option<SystemTime>) -> Option<i64> {
    let normalized = if line.len() >= 7 && &line[3..5] == "  " {
        format!("{} {}", &line[..3], &line[5..])
    } else {
        line.to_string()
    };
    let mut tokens = normalized.split_whitespace();
    let month_token = tokens.next()?;
    let day_token = tokens.next()?;
    let time_token = tokens.next()?;

    let month: u32 = match month_token {
        "Jan" => 1,
        "Feb" => 2,
        "Mar" => 3,
        "Apr" => 4,
        "May" => 5,
        "Jun" => 6,
        "Jul" => 7,
        "Aug" => 8,
        "Sep" => 9,
        "Oct" => 10,
        "Nov" => 11,
        "Dec" => 12,
        _ => return None,
    };
    let day: u32 = day_token.parse().ok()?;
    let time = NaiveTime::parse_from_str(time_token, "%H:%M:%S").ok()?;

    let year = match file_mtime {
        Some(mtime) => {
            let mtime_dt: DateTime<Utc> = mtime.into();
            if month > mtime_dt.month() {
                mtime_dt.year() - 1
            } else {
                mtime_dt.year()
            }
        }
        None => Utc::now().year(),
    };

    let date = NaiveDate::from_ymd_opt(year, month, day)?;
    let dt = NaiveDateTime::new(date, time);
    Some(dt.and_utc().timestamp_millis())
}

fn apache_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"\[(\d{2}/[A-Z][a-z]{2}/\d{4}:\d{2}:\d{2}:\d{2} [+-]\d{4})\]").unwrap()
    })
}

fn parse_apache_combined(line: &str) -> Option<i64> {
    let caps = apache_regex().captures(line)?;
    let dt = DateTime::parse_from_str(&caps[1], "%d/%b/%Y:%H:%M:%S %z").ok()?;
    Some(dt.timestamp_millis())
}

/// Extracts an epoch-millisecond timestamp from the start of `line` for the
/// given `format`, or `None` if the leading token doesn't match.
pub fn extract_timestamp(
    line: &str,
    format: TimestampFormat,
    file_mtime: Option<SystemTime>,
) -> Option<i64> {
    let token = line.split_whitespace().next()?;
    match format {
        TimestampFormat::Iso8601 => parse_iso8601(token),
        TimestampFormat::EpochSeconds => parse_epoch(token, 9..=10, 1000),
        TimestampFormat::EpochMillis => parse_epoch(token, 12..=13, 1),
        TimestampFormat::SpaceSeparated => parse_space_separated(line),
        TimestampFormat::DayFirst => parse_day_first(line),
        TimestampFormat::Syslog => parse_syslog(line, file_mtime),
        TimestampFormat::ApacheCombined => parse_apache_combined(line),
        TimestampFormat::MonthFirst => parse_month_first(line),
    }
}

/// Detects the dominant timestamp format across `sample_lines`, returning a
/// [`TimestampFormatProfile`] only if some format's match ratio reaches
/// [`DETECTION_THRESHOLD`] (FR-011). Returns `None` for an empty sample.
pub fn detect_format<'a>(
    sample_lines: impl Iterator<Item = &'a str>,
    file_mtime: Option<SystemTime>,
) -> Option<TimestampFormatProfile> {
    let mut total = 0usize;
    let mut counts = [0usize; CANDIDATE_FORMATS.len()];

    for line in sample_lines {
        total += 1;
        for (i, &format) in CANDIDATE_FORMATS.iter().enumerate() {
            if extract_timestamp(line, format, file_mtime).is_some() {
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
    file_mtime: Option<SystemTime>,
) -> Vec<Option<i64>> {
    (1..=line_offsets.len())
        .map(|line_index| {
            line_bytes(mmap, line_offsets, line_index).and_then(|bytes| {
                extract_timestamp(&String::from_utf8_lossy(bytes), format, file_mtime)
            })
        })
        .collect()
}

/// Samples up to [`SAMPLE_SIZE`] lines, detects a timestamp format
/// (FR-011), and if one is detected, parses an epoch-ms timestamp for every
/// line, storing the results on `index`. Intended to run on a blocking
/// thread, after [`crate::logfile::mmap_index::build_line_index`] has
/// populated `line_offsets` (research.md §4).
pub fn detect_and_parse(mmap: &Mmap, index: &RwLock<FileIndex>, file_mtime: Option<SystemTime>) {
    let line_offsets = index.read().unwrap().line_offsets.clone();
    let sample_size = line_offsets.len().min(SAMPLE_SIZE);

    let sample: Vec<String> = (1..=sample_size)
        .filter_map(|line_index| {
            line_bytes(mmap, &line_offsets, line_index)
                .map(|bytes| String::from_utf8_lossy(bytes).into_owned())
        })
        .collect();

    let Some(profile) = detect_format(sample.iter().map(String::as_str), file_mtime) else {
        return;
    };

    let line_timestamps = parse_line_timestamps(mmap, &line_offsets, profile.format, file_mtime);
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
        let ms = extract_timestamp(
            "2026-06-12T10:00:00Z connected",
            TimestampFormat::Iso8601,
            None,
        );
        assert_eq!(ms, Some(1781258400000));
    }

    #[test]
    fn extract_timestamp_parses_iso8601_with_offset() {
        let ms = extract_timestamp(
            "2026-06-12T12:00:00+02:00 connected",
            TimestampFormat::Iso8601,
            None,
        );
        assert_eq!(ms, Some(1781258400000));
    }

    #[test]
    fn extract_timestamp_parses_iso8601_without_timezone() {
        let ms = extract_timestamp(
            "2026-06-12T10:00:00.500 connected",
            TimestampFormat::Iso8601,
            None,
        );
        assert_eq!(ms, Some(1781258400500));
    }

    #[test]
    fn extract_timestamp_parses_epoch_seconds() {
        let ms = extract_timestamp("1781258400 connected", TimestampFormat::EpochSeconds, None);
        assert_eq!(ms, Some(1781258400000));
    }

    #[test]
    fn extract_timestamp_parses_epoch_millis() {
        let ms = extract_timestamp(
            "1781258400000 connected",
            TimestampFormat::EpochMillis,
            None,
        );
        assert_eq!(ms, Some(1781258400000));
    }

    #[test]
    fn extract_timestamp_returns_none_for_non_matching_format() {
        assert_eq!(
            extract_timestamp("not-a-timestamp connected", TimestampFormat::Iso8601, None),
            None
        );
        assert_eq!(
            extract_timestamp(
                "2026-06-12T10:00:00Z connected",
                TimestampFormat::EpochSeconds,
                None,
            ),
            None
        );
    }

    #[test]
    fn detect_format_returns_none_for_empty_sample() {
        assert!(detect_format(std::iter::empty(), None).is_none());
    }

    #[test]
    fn detect_format_picks_iso8601_when_dominant() {
        let lines = vec![
            "2026-06-12T10:00:00Z one",
            "2026-06-12T10:00:01Z two",
            "2026-06-12T10:00:02Z three",
            "no timestamp here",
        ];
        let profile = detect_format(lines.into_iter(), None).unwrap();
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
        let profile = detect_format(lines.into_iter(), None).unwrap();
        assert_eq!(profile.format, TimestampFormat::EpochMillis);
        assert!((profile.match_ratio - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn detect_format_picks_epoch_seconds_when_dominant() {
        let lines = vec!["1781258400 one", "1781258401 two", "1781258402 three"];
        let profile = detect_format(lines.into_iter(), None).unwrap();
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
        assert!(detect_format(lines.into_iter(), None).is_none());
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
            None,
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
        let profile = detect_format(lines.into_iter(), None).unwrap();
        assert_eq!(profile.format, TimestampFormat::SpaceSeparated);
        assert!((profile.match_ratio - 0.75).abs() < f64::EPSILON);
    }

    #[test]
    fn extract_timestamp_parses_space_separated_with_comma_millis() {
        let ms = extract_timestamp(
            "2026-05-21 18:14:06,043 [main] INFO com.zaxxer.hikari.HikariDataSource - HikariPool-1 - Starting...",
            TimestampFormat::SpaceSeparated,
            None,
        );
        assert_eq!(ms, Some(1779387246043));
    }

    #[test]
    fn extract_timestamp_parses_space_separated_without_fraction() {
        let ms = extract_timestamp(
            "2026-05-21 18:14:06 [main] INFO com.zaxxer.hikari.HikariDataSource - HikariPool-1 - Starting...",
            TimestampFormat::SpaceSeparated,
            None,
        );
        assert_eq!(ms, Some(1779387246000));
    }

    #[test]
    fn extract_timestamp_space_separated_does_not_match_iso8601_or_epoch_lines() {
        assert_eq!(
            extract_timestamp(
                "2026-06-12T10:00:00Z connected",
                TimestampFormat::SpaceSeparated,
                None,
            ),
            None
        );
        assert_eq!(
            extract_timestamp(
                "1781258400000 connected",
                TimestampFormat::SpaceSeparated,
                None
            ),
            None
        );
    }

    #[test]
    fn extract_timestamp_space_separated_rejects_invalid_calendar_value() {
        assert_eq!(
            extract_timestamp(
                "2026-13-01 10:00:00 bad month",
                TimestampFormat::SpaceSeparated,
                None,
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
        let profile = detect_format(lines.into_iter(), None).unwrap();
        assert_eq!(profile.format, TimestampFormat::Iso8601);
        assert!((profile.match_ratio - 0.75).abs() < f64::EPSILON);
    }

    // --- US1: Day-First ---

    #[test]
    fn extract_timestamp_parses_day_first_dash() {
        let ms = extract_timestamp(
            "12-06-2026 00:00:00.007 INFO ...",
            TimestampFormat::DayFirst,
            None,
        );
        assert_eq!(ms, Some(1781222400007));
    }

    #[test]
    fn extract_timestamp_parses_day_first_slash() {
        let ms = extract_timestamp(
            "12/06/2026 00:00:00.007 INFO ...",
            TimestampFormat::DayFirst,
            None,
        );
        assert_eq!(ms, Some(1781222400007));
    }

    #[test]
    fn extract_timestamp_parses_day_first_comma_millis() {
        let ms = extract_timestamp(
            "12-06-2026 00:00:00,007 INFO ...",
            TimestampFormat::DayFirst,
            None,
        );
        assert_eq!(ms, Some(1781222400007));
    }

    #[test]
    fn extract_timestamp_parses_day_first_without_fraction() {
        let ms = extract_timestamp(
            "12-06-2026 00:00:00 INFO ...",
            TimestampFormat::DayFirst,
            None,
        );
        assert_eq!(ms, Some(1781222400000));
    }

    #[test]
    fn extract_timestamp_day_first_rejects_invalid_date() {
        assert_eq!(
            extract_timestamp("31-02-2026 00:00:00 ...", TimestampFormat::DayFirst, None),
            None
        );
    }

    #[test]
    fn detect_format_picks_day_first_when_dominant() {
        let lines = vec![
            "12-06-2026 00:00:00.007 INFO one",
            "13-06-2026 01:00:00.000 INFO two",
            "14-06-2026 02:00:00.000 INFO three",
            "no timestamp here",
        ];
        let profile = detect_format(lines.into_iter(), None).unwrap();
        assert_eq!(profile.format, TimestampFormat::DayFirst);
    }

    // --- US2: Syslog ---

    fn mtime_for(year: i32, month: u32, day: u32) -> SystemTime {
        let dt = NaiveDate::from_ymd_opt(year, month, day)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc();
        SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(dt.timestamp() as u64)
    }

    #[test]
    fn extract_timestamp_parses_syslog() {
        let mtime = mtime_for(2026, 12, 31);
        let ms = extract_timestamp(
            "Dec 24 06:55:48 host sshd[1234]: ...",
            TimestampFormat::Syslog,
            Some(mtime),
        );
        assert_eq!(ms, Some(1798095348000));
    }

    #[test]
    fn extract_timestamp_parses_syslog_space_padded_day() {
        let mtime = mtime_for(2026, 12, 31);
        let ms = extract_timestamp(
            "Dec  4 06:55:48 host ...",
            TimestampFormat::Syslog,
            Some(mtime),
        );
        assert_eq!(ms, Some(1796367348000));
    }

    #[test]
    fn extract_timestamp_parses_syslog_zero_padded_day() {
        let mtime = mtime_for(2026, 12, 31);
        let ms = extract_timestamp(
            "Dec 04 06:55:48 host ...",
            TimestampFormat::Syslog,
            Some(mtime),
        );
        assert_eq!(ms, Some(1796367348000));
    }

    #[test]
    fn extract_timestamp_syslog_year_rollover() {
        let mtime = mtime_for(2027, 3, 15);
        let ms = extract_timestamp(
            "Dec 24 06:55:48 host sshd[1234]: ...",
            TimestampFormat::Syslog,
            Some(mtime),
        );
        assert_eq!(ms, Some(1798095348000));
    }

    #[test]
    fn extract_timestamp_syslog_no_mtime_uses_current_year() {
        let ms = extract_timestamp("Jun 12 10:00:00 host ...", TimestampFormat::Syslog, None);
        assert!(ms.is_some());
        let year = Utc::now().year();
        let expected = NaiveDate::from_ymd_opt(year, 6, 12)
            .unwrap()
            .and_hms_opt(10, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp_millis();
        assert_eq!(ms, Some(expected));
    }

    #[test]
    fn extract_timestamp_syslog_rejects_invalid() {
        assert_eq!(
            extract_timestamp("Abc 99 25:00:00 ...", TimestampFormat::Syslog, None),
            None
        );
    }

    #[test]
    fn detect_format_picks_syslog_when_dominant() {
        let mtime = mtime_for(2026, 12, 31);
        let lines = vec![
            "Dec 24 06:55:48 host one",
            "Dec 24 06:55:49 host two",
            "Dec 24 06:55:50 host three",
            "no timestamp here",
        ];
        let profile = detect_format(lines.into_iter(), Some(mtime)).unwrap();
        assert_eq!(profile.format, TimestampFormat::Syslog);
    }

    // --- US3: Apache Combined ---

    #[test]
    fn extract_timestamp_parses_apache_combined() {
        let ms = extract_timestamp(
            r#"127.0.0.1 - - [24/Dec/2026:06:55:48 +0000] "GET /""#,
            TimestampFormat::ApacheCombined,
            None,
        );
        assert_eq!(ms, Some(1798095348000));
    }

    #[test]
    fn extract_timestamp_parses_apache_combined_with_offset() {
        let ms = extract_timestamp(
            "[24/Dec/2026:06:55:48 +0530]",
            TimestampFormat::ApacheCombined,
            None,
        );
        assert_eq!(ms, Some(1798075548000));
    }

    #[test]
    fn extract_timestamp_parses_apache_combined_negative_offset() {
        let ms = extract_timestamp(
            "[24/Dec/2026:06:55:48 -0500]",
            TimestampFormat::ApacheCombined,
            None,
        );
        assert_eq!(ms, Some(1798113348000));
    }

    #[test]
    fn extract_timestamp_apache_rejects_no_brackets() {
        assert_eq!(
            extract_timestamp(
                "24/Dec/2026:06:55:48 +0000",
                TimestampFormat::ApacheCombined,
                None,
            ),
            None
        );
    }

    #[test]
    fn detect_format_picks_apache_when_dominant() {
        let lines = vec![
            r#"127.0.0.1 - - [24/Dec/2026:06:55:48 +0000] "GET / HTTP/1.1" 200"#,
            r#"192.168.1.1 - - [24/Dec/2026:06:55:49 +0000] "POST /api HTTP/1.1" 201"#,
            r#"10.0.0.1 - - [24/Dec/2026:06:55:50 +0000] "GET /health HTTP/1.1" 200"#,
            "no timestamp here",
        ];
        let profile = detect_format(lines.into_iter(), None).unwrap();
        assert_eq!(profile.format, TimestampFormat::ApacheCombined);
    }

    // --- US4: Month-First ---

    #[test]
    fn extract_timestamp_parses_month_first() {
        let ms = extract_timestamp(
            "06/12/2026 14:30:00.500 INFO ...",
            TimestampFormat::MonthFirst,
            None,
        );
        assert_eq!(ms, Some(1781274600500));
    }

    #[test]
    fn extract_timestamp_parses_month_first_without_fraction() {
        let ms = extract_timestamp(
            "06/12/2026 14:30:00 INFO ...",
            TimestampFormat::MonthFirst,
            None,
        );
        assert_eq!(ms, Some(1781274600000));
    }

    #[test]
    fn extract_timestamp_parses_month_first_comma_millis() {
        let ms = extract_timestamp(
            "06/12/2026 14:30:00,500 INFO ...",
            TimestampFormat::MonthFirst,
            None,
        );
        assert_eq!(ms, Some(1781274600500));
    }

    #[test]
    fn extract_timestamp_month_first_rejects_invalid_date() {
        assert_eq!(
            extract_timestamp("13/32/2026 00:00:00 ...", TimestampFormat::MonthFirst, None),
            None
        );
    }

    #[test]
    fn detect_format_picks_month_first_when_dominant() {
        let lines = vec![
            "06/12/2026 14:30:00.500 INFO one",
            "06/13/2026 14:30:01.000 INFO two",
            "06/14/2026 14:30:02.000 INFO three",
            "no timestamp here",
        ];
        let profile = detect_format(lines.into_iter(), None).unwrap();
        assert_eq!(profile.format, TimestampFormat::MonthFirst);
    }

    // --- US5: Regression Protection ---

    #[test]
    fn detect_format_still_picks_iso8601_over_new_formats() {
        let lines = vec![
            "2026-06-12T10:00:00Z one",
            "2026-06-12T10:00:01Z two",
            "2026-06-12T10:00:02Z three",
            "2026-06-12T10:00:03Z four",
        ];
        let profile = detect_format(lines.into_iter(), None).unwrap();
        assert_eq!(profile.format, TimestampFormat::Iso8601);
    }

    #[test]
    fn detect_format_still_picks_space_separated_over_new_formats() {
        let lines = vec![
            "2026-05-21 18:14:06.043 [main] INFO one",
            "2026-05-21 18:14:07.100 [main] INFO two",
            "2026-05-21 18:14:08.250 [main] INFO three",
            "2026-05-21 18:14:09.000 [main] INFO four",
        ];
        let profile = detect_format(lines.into_iter(), None).unwrap();
        assert_eq!(profile.format, TimestampFormat::SpaceSeparated);
    }

    #[test]
    fn detect_format_prefers_iso8601_over_day_first() {
        let lines = vec![
            "2026-06-12T10:00:00Z one",
            "2026-06-12T10:00:01Z two",
            "2026-06-12T10:00:02Z three",
            "12-06-2026 00:00:00.007 INFO four",
        ];
        let profile = detect_format(lines.into_iter(), None).unwrap();
        assert_eq!(profile.format, TimestampFormat::Iso8601);
    }
}
