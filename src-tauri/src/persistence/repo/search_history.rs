use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::Result;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum SearchType {
    Logical,
    Regex,
}

impl SearchType {
    fn as_str(self) -> &'static str {
        match self {
            SearchType::Logical => "logical",
            SearchType::Regex => "regex",
        }
    }

    fn from_str(value: &str) -> Self {
        match value {
            "regex" => SearchType::Regex,
            _ => SearchType::Logical,
        }
    }
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct SearchHistoryEntry {
    pub id: i64,
    pub workspace_id: i64,
    pub query: String,
    pub search_type: SearchType,
    pub time_from: Option<i64>,
    pub time_to: Option<i64>,
    pub last_used_at: String,
}

fn row_to_entry(row: &rusqlite::Row) -> rusqlite::Result<SearchHistoryEntry> {
    Ok(SearchHistoryEntry {
        id: row.get("id")?,
        workspace_id: row.get("workspace_id")?,
        query: row.get("query")?,
        search_type: SearchType::from_str(&row.get::<_, String>("search_type")?),
        time_from: row.get("time_from")?,
        time_to: row.get("time_to")?,
        last_used_at: row.get("last_used_at")?,
    })
}

/// Records a search execution (FR-024), called on every `search`/
/// `search_with_context` invocation from the UI or MCP. Re-running an
/// identical search (same `workspace_id`/`query`/`search_type`/`time_from`/
/// `time_to`) updates that entry's `last_used_at` instead of inserting a
/// duplicate (FR-010/FR-012).
pub fn record(
    conn: &Connection,
    workspace_id: i64,
    query: &str,
    search_type: SearchType,
    time_from: Option<i64>,
    time_to: Option<i64>,
) -> Result<SearchHistoryEntry> {
    conn.execute(
        "INSERT INTO search_history_entries (workspace_id, query, search_type, time_from, time_to, last_used_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) \
         ON CONFLICT (workspace_id, query, search_type, \
             COALESCE(time_from, -9223372036854775808), COALESCE(time_to, -9223372036854775808)) \
         DO UPDATE SET last_used_at = excluded.last_used_at",
        params![workspace_id, query, search_type.as_str(), time_from, time_to],
    )?;
    conn.query_row(
        "SELECT id, workspace_id, query, search_type, time_from, time_to, last_used_at \
         FROM search_history_entries \
         WHERE workspace_id = ?1 AND query = ?2 AND search_type = ?3 \
             AND COALESCE(time_from, -9223372036854775808) = COALESCE(?4, -9223372036854775808) \
             AND COALESCE(time_to, -9223372036854775808) = COALESCE(?5, -9223372036854775808)",
        params![
            workspace_id,
            query,
            search_type.as_str(),
            time_from,
            time_to
        ],
        row_to_entry,
    )
    .map_err(Into::into)
}

/// Returns `workspace_id`'s recorded search history, most-recently-used
/// first (FR-012/FR-013).
pub fn list_for_workspace(conn: &Connection, workspace_id: i64) -> Result<Vec<SearchHistoryEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, query, search_type, time_from, time_to, last_used_at \
         FROM search_history_entries WHERE workspace_id = ?1 ORDER BY last_used_at DESC",
    )?;
    let rows = stmt.query_map(params![workspace_id], row_to_entry)?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::repo::workspace;
    use crate::persistence::schema;

    fn test_conn() -> (Connection, i64) {
        let conn = Connection::open_in_memory().unwrap();
        schema::migrate(&conn).unwrap();
        let ws = workspace::get_or_create_draft(&conn).unwrap();
        (conn, ws.id)
    }

    #[test]
    fn record_inserts_a_new_row_for_a_new_search() {
        let (conn, workspace_id) = test_conn();

        record(
            &conn,
            workspace_id,
            "\"error\" AND \"db\"",
            SearchType::Logical,
            None,
            None,
        )
        .unwrap();
        record(
            &conn,
            workspace_id,
            "err.*",
            SearchType::Regex,
            Some(0),
            Some(1000),
        )
        .unwrap();

        let history = list_for_workspace(&conn, workspace_id).unwrap();
        assert_eq!(history.len(), 2);
    }

    #[test]
    fn record_with_the_same_key_updates_last_used_at_instead_of_inserting_a_duplicate() {
        let (conn, workspace_id) = test_conn();

        let first = record(
            &conn,
            workspace_id,
            "\"error\" AND \"db\"",
            SearchType::Logical,
            None,
            None,
        )
        .unwrap();

        // Re-running the identical search later should update `last_used_at`
        // on the same row, not insert a second one.
        std::thread::sleep(std::time::Duration::from_millis(10));
        let second = record(
            &conn,
            workspace_id,
            "\"error\" AND \"db\"",
            SearchType::Logical,
            None,
            None,
        )
        .unwrap();

        let history = list_for_workspace(&conn, workspace_id).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(second.id, first.id);
        assert!(second.last_used_at >= first.last_used_at);
    }

    #[test]
    fn list_for_workspace_orders_by_last_used_at_descending() {
        let (conn, workspace_id) = test_conn();

        record(
            &conn,
            workspace_id,
            "older",
            SearchType::Logical,
            None,
            None,
        )
        .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        record(
            &conn,
            workspace_id,
            "newer",
            SearchType::Logical,
            None,
            None,
        )
        .unwrap();

        let history = list_for_workspace(&conn, workspace_id).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].query, "newer");
        assert_eq!(history[1].query, "older");

        // Re-running "older" moves it back to the top (FR-012).
        std::thread::sleep(std::time::Duration::from_millis(10));
        record(
            &conn,
            workspace_id,
            "older",
            SearchType::Logical,
            None,
            None,
        )
        .unwrap();

        let history = list_for_workspace(&conn, workspace_id).unwrap();
        assert_eq!(history[0].query, "older");
        assert_eq!(history[1].query, "newer");
    }
}
