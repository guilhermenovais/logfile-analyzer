use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::error::{AppError, Result};
use crate::persistence::repo::is_constraint_violation;

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct LogFileEntry {
    pub id: i64,
    pub workspace_id: i64,
    pub path: String,
    pub alias: String,
    pub has_timestamp_format: bool,
}

fn row_to_entry(row: &rusqlite::Row) -> rusqlite::Result<LogFileEntry> {
    Ok(LogFileEntry {
        id: row.get("id")?,
        workspace_id: row.get("workspace_id")?,
        path: row.get("path")?,
        alias: row.get("alias")?,
        has_timestamp_format: row.get::<_, i64>("has_timestamp_format")? != 0,
    })
}

/// Inserts a new file reference into `workspace_id`. Maps SQLite `UNIQUE`
/// violations onto `FileAlreadyInWorkspace` (duplicate `path`) or
/// `AliasCollision` (duplicate `alias`), per FR-002/FR-003.
pub fn insert(
    conn: &Connection,
    workspace_id: i64,
    path: &str,
    alias: &str,
) -> Result<LogFileEntry> {
    if find_by_path(conn, workspace_id, path)?.is_some() {
        return Err(AppError::FileAlreadyInWorkspace);
    }
    if find_by_alias(conn, workspace_id, alias)?.is_some() {
        return Err(AppError::AliasCollision);
    }

    conn.execute(
        "INSERT INTO log_file_entries (workspace_id, path, alias) VALUES (?1, ?2, ?3)",
        params![workspace_id, path, alias],
    )
    .map_err(|err| {
        if is_constraint_violation(&err) {
            AppError::AliasCollision
        } else {
            AppError::from(err)
        }
    })?;

    let id = conn.last_insert_rowid();
    get(conn, id)?.ok_or(AppError::FileNotFound)
}

pub fn get(conn: &Connection, id: i64) -> Result<Option<LogFileEntry>> {
    conn.query_row(
        "SELECT id, workspace_id, path, alias, has_timestamp_format FROM log_file_entries WHERE id = ?1",
        params![id],
        row_to_entry,
    )
    .optional()
    .map_err(AppError::from)
}

pub fn list_for_workspace(conn: &Connection, workspace_id: i64) -> Result<Vec<LogFileEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, path, alias, has_timestamp_format FROM log_file_entries \
         WHERE workspace_id = ?1 ORDER BY id",
    )?;
    let rows = stmt.query_map(params![workspace_id], row_to_entry)?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(AppError::from)
}

pub fn find_by_path(
    conn: &Connection,
    workspace_id: i64,
    path: &str,
) -> Result<Option<LogFileEntry>> {
    conn.query_row(
        "SELECT id, workspace_id, path, alias, has_timestamp_format FROM log_file_entries \
         WHERE workspace_id = ?1 AND path = ?2",
        params![workspace_id, path],
        row_to_entry,
    )
    .optional()
    .map_err(AppError::from)
}

pub fn find_by_alias(
    conn: &Connection,
    workspace_id: i64,
    alias: &str,
) -> Result<Option<LogFileEntry>> {
    conn.query_row(
        "SELECT id, workspace_id, path, alias, has_timestamp_format FROM log_file_entries \
         WHERE workspace_id = ?1 AND alias = ?2",
        params![workspace_id, alias],
        row_to_entry,
    )
    .optional()
    .map_err(AppError::from)
}

pub fn set_has_timestamp_format(conn: &Connection, id: i64, value: bool) -> Result<()> {
    conn.execute(
        "UPDATE log_file_entries SET has_timestamp_format = ?1 WHERE id = ?2",
        params![value as i64, id],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM log_file_entries WHERE id = ?1", params![id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::repo::workspace;
    use crate::persistence::schema;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        schema::migrate(&conn).unwrap();
        conn
    }

    #[test]
    fn insert_rejects_duplicate_path_and_alias() {
        let conn = test_conn();
        let ws = workspace::get_or_create_draft(&conn).unwrap();

        insert(&conn, ws.id, "/var/log/app.log", "app").unwrap();

        assert!(matches!(
            insert(&conn, ws.id, "/var/log/app.log", "other"),
            Err(AppError::FileAlreadyInWorkspace)
        ));
        assert!(matches!(
            insert(&conn, ws.id, "/var/log/other.log", "app"),
            Err(AppError::AliasCollision)
        ));
    }

    #[test]
    fn list_for_workspace_returns_inserted_entries() {
        let conn = test_conn();
        let ws = workspace::get_or_create_draft(&conn).unwrap();
        insert(&conn, ws.id, "/var/log/app.log", "app").unwrap();
        insert(&conn, ws.id, "/var/log/db.log", "db").unwrap();

        let entries = list_for_workspace(&conn, ws.id).unwrap();
        assert_eq!(entries.len(), 2);
    }
}
