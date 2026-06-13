use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::error::Result;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum HighlightOrigin {
    User,
    McpAgent,
}

impl HighlightOrigin {
    fn as_str(self) -> &'static str {
        match self {
            HighlightOrigin::User => "user",
            HighlightOrigin::McpAgent => "mcp_agent",
        }
    }

    fn from_str(value: &str) -> Self {
        match value {
            "mcp_agent" => HighlightOrigin::McpAgent,
            _ => HighlightOrigin::User,
        }
    }
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct Highlight {
    pub id: i64,
    pub file_id: i64,
    pub line_index: i64,
    pub label: Option<String>,
    pub origin: HighlightOrigin,
}

fn row_to_highlight(row: &rusqlite::Row) -> rusqlite::Result<Highlight> {
    Ok(Highlight {
        id: row.get("id")?,
        file_id: row.get("file_id")?,
        line_index: row.get("line_index")?,
        label: row.get("label")?,
        origin: HighlightOrigin::from_str(&row.get::<_, String>("origin")?),
    })
}

/// Creates a highlight on `line_index`, or updates its label/origin if one
/// already exists on that line (FR-017/FR-018; `(file_id, line_index)` is
/// unique).
pub fn upsert(
    conn: &Connection,
    file_id: i64,
    line_index: i64,
    label: Option<&str>,
    origin: HighlightOrigin,
) -> Result<Highlight> {
    conn.execute(
        "INSERT INTO highlights (file_id, line_index, label, origin) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT (file_id, line_index) DO UPDATE SET label = excluded.label, origin = excluded.origin",
        params![file_id, line_index, label, origin.as_str()],
    )?;
    get_by_line(conn, file_id, line_index)?
        .ok_or_else(|| crate::error::AppError::Io("highlight not found after upsert".to_string()))
}

pub fn get_by_line(conn: &Connection, file_id: i64, line_index: i64) -> Result<Option<Highlight>> {
    conn.query_row(
        "SELECT id, file_id, line_index, label, origin FROM highlights \
         WHERE file_id = ?1 AND line_index = ?2",
        params![file_id, line_index],
        row_to_highlight,
    )
    .optional()
    .map_err(Into::into)
}

pub fn list_for_file(conn: &Connection, file_id: i64) -> Result<Vec<Highlight>> {
    let mut stmt = conn.prepare(
        "SELECT id, file_id, line_index, label, origin FROM highlights \
         WHERE file_id = ?1 ORDER BY line_index",
    )?;
    let rows = stmt.query_map(params![file_id], row_to_highlight)?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(Into::into)
}

pub fn clear(conn: &Connection, file_id: i64, line_index: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM highlights WHERE file_id = ?1 AND line_index = ?2",
        params![file_id, line_index],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::repo::{log_file_entry, workspace};
    use crate::persistence::schema;

    fn test_file(conn: &Connection) -> i64 {
        schema::migrate(conn).unwrap();
        let ws = workspace::get_or_create_draft(conn).unwrap();
        log_file_entry::insert(conn, ws.id, "/var/log/app.log", "app")
            .unwrap()
            .id
    }

    #[test]
    fn upsert_then_update_label() {
        let conn = Connection::open_in_memory().unwrap();
        let file_id = test_file(&conn);

        upsert(&conn, file_id, 10, None, HighlightOrigin::User).unwrap();
        let updated = upsert(
            &conn,
            file_id,
            10,
            Some("root cause"),
            HighlightOrigin::McpAgent,
        )
        .unwrap();

        assert_eq!(updated.label, Some("root cause".to_string()));
        assert_eq!(updated.origin, HighlightOrigin::McpAgent);
        assert_eq!(list_for_file(&conn, file_id).unwrap().len(), 1);
    }

    #[test]
    fn clear_removes_highlight() {
        let conn = Connection::open_in_memory().unwrap();
        let file_id = test_file(&conn);

        upsert(&conn, file_id, 5, None, HighlightOrigin::User).unwrap();
        clear(&conn, file_id, 5).unwrap();

        assert!(list_for_file(&conn, file_id).unwrap().is_empty());
    }
}
