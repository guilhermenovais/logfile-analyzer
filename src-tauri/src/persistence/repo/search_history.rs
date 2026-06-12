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
    pub file_id: i64,
    pub query: String,
    pub search_type: SearchType,
    pub time_from: Option<i64>,
    pub time_to: Option<i64>,
    pub executed_at: String,
}

fn row_to_entry(row: &rusqlite::Row) -> rusqlite::Result<SearchHistoryEntry> {
    Ok(SearchHistoryEntry {
        id: row.get("id")?,
        file_id: row.get("file_id")?,
        query: row.get("query")?,
        search_type: SearchType::from_str(&row.get::<_, String>("search_type")?),
        time_from: row.get("time_from")?,
        time_to: row.get("time_to")?,
        executed_at: row.get("executed_at")?,
    })
}

/// Records a search execution (FR-024), called on every `search`/
/// `search_with_context` invocation from the UI or MCP.
pub fn record(
    conn: &Connection,
    file_id: i64,
    query: &str,
    search_type: SearchType,
    time_from: Option<i64>,
    time_to: Option<i64>,
) -> Result<SearchHistoryEntry> {
    conn.execute(
        "INSERT INTO search_history_entries (file_id, query, search_type, time_from, time_to) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![file_id, query, search_type.as_str(), time_from, time_to],
    )?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, file_id, query, search_type, time_from, time_to, executed_at \
         FROM search_history_entries WHERE id = ?1",
        params![id],
        row_to_entry,
    )
    .map_err(Into::into)
}

pub fn list_for_file(conn: &Connection, file_id: i64) -> Result<Vec<SearchHistoryEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, file_id, query, search_type, time_from, time_to, executed_at \
         FROM search_history_entries WHERE file_id = ?1 ORDER BY executed_at DESC",
    )?;
    let rows = stmt.query_map(params![file_id], row_to_entry)?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::repo::{log_file_entry, workspace};
    use crate::persistence::schema;

    #[test]
    fn record_and_list() {
        let conn = Connection::open_in_memory().unwrap();
        schema::migrate(&conn).unwrap();
        let ws = workspace::get_or_create_draft(&conn).unwrap();
        let file_id = log_file_entry::insert(&conn, ws.id, "/var/log/app.log", "app")
            .unwrap()
            .id;

        record(
            &conn,
            file_id,
            "\"error\" AND \"db\"",
            SearchType::Logical,
            None,
            None,
        )
        .unwrap();
        record(
            &conn,
            file_id,
            "err.*",
            SearchType::Regex,
            Some(0),
            Some(1000),
        )
        .unwrap();

        let history = list_for_file(&conn, file_id).unwrap();
        assert_eq!(history.len(), 2);
    }
}
