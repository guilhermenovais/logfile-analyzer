//! Detects a file's UTC offset from its sampled timestamp lines
//! (data-model.md §5, research.md §3.2).

/// Returns the explicit UTC offset, in minutes, of the first sampled line
/// whose leading token parses as an RFC 3339 timestamp with an explicit
/// offset (e.g. `+02:00` -> `120`, `-05:00` -> `-300`, `Z` -> `0`). Returns
/// `0` if no sampled line has an explicit offset (naive ISO-8601, epoch, or
/// space-separated samples).
pub fn detect_utc_offset_minutes(sample: &[String]) -> i32 {
    sample
        .iter()
        .find_map(|line| {
            let token = line.split_whitespace().next()?;
            let dt = chrono::DateTime::parse_from_rfc3339(token).ok()?;
            Some(dt.offset().local_minus_utc() / 60)
        })
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_zero_for_empty_sample() {
        assert_eq!(detect_utc_offset_minutes(&[]), 0);
    }

    #[test]
    fn returns_positive_offset_minutes_for_explicit_positive_offset() {
        let sample = vec!["2026-06-12T12:00:00+02:00 connected".to_string()];
        assert_eq!(detect_utc_offset_minutes(&sample), 120);
    }

    #[test]
    fn returns_negative_offset_minutes_for_explicit_negative_offset() {
        let sample = vec!["2026-06-12T12:00:00-05:00 connected".to_string()];
        assert_eq!(detect_utc_offset_minutes(&sample), -300);
    }

    #[test]
    fn returns_zero_for_z_suffix() {
        let sample = vec!["2026-06-12T10:00:00Z connected".to_string()];
        assert_eq!(detect_utc_offset_minutes(&sample), 0);
    }

    #[test]
    fn returns_zero_for_naive_iso8601_without_offset() {
        let sample = vec!["2026-06-12T10:00:00 connected".to_string()];
        assert_eq!(detect_utc_offset_minutes(&sample), 0);
    }

    #[test]
    fn returns_zero_for_epoch_seconds_sample() {
        let sample = vec!["1781258400 connected".to_string()];
        assert_eq!(detect_utc_offset_minutes(&sample), 0);
    }

    #[test]
    fn returns_zero_for_space_separated_sample() {
        let sample =
            vec!["2026-05-21 18:14:06.043 [main] INFO HikariPool-1 - Starting...".to_string()];
        assert_eq!(detect_utc_offset_minutes(&sample), 0);
    }

    #[test]
    fn uses_first_line_with_an_explicit_offset_when_earlier_lines_have_none() {
        let sample = vec![
            "2026-06-12T10:00:00 no offset".to_string(),
            "2026-06-12T12:00:00+02:00 connected".to_string(),
        ];
        assert_eq!(detect_utc_offset_minutes(&sample), 120);
    }
}
