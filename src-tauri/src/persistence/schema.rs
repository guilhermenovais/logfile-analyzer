use std::path::Path;

use rusqlite::Connection;

/// Opens (creating if needed) the SQLite database at `path` and applies the
/// schema migrations for workspaces, log file entries, highlights, and search
/// history (per data-model.md).
pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    migrate(&conn)?;
    Ok(conn)
}

/// Applies schema migrations to an existing connection (exposed for tests in
/// sibling `repo` modules and `src-tauri/tests/` that need a migrated
/// in-memory database).
pub fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS workspaces (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            alias       TEXT UNIQUE,
            is_draft    INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_single_draft
            ON workspaces (is_draft)
            WHERE is_draft = 1;

        CREATE TABLE IF NOT EXISTS log_file_entries (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            workspace_id          INTEGER NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
            path                  TEXT NOT NULL,
            alias                 TEXT NOT NULL,
            has_timestamp_format  INTEGER NOT NULL DEFAULT 0,
            UNIQUE (workspace_id, path),
            UNIQUE (workspace_id, alias)
        );

        CREATE TABLE IF NOT EXISTS highlights (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id     INTEGER NOT NULL REFERENCES log_file_entries (id) ON DELETE CASCADE,
            line_index  INTEGER NOT NULL,
            label       TEXT,
            origin      TEXT NOT NULL CHECK (origin IN ('user', 'mcp_agent')),
            created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            UNIQUE (file_id, line_index)
        );

        CREATE TABLE IF NOT EXISTS search_history_entries (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id      INTEGER NOT NULL REFERENCES log_file_entries (id) ON DELETE CASCADE,
            query        TEXT NOT NULL,
            search_type  TEXT NOT NULL CHECK (search_type IN ('logical', 'regex')),
            time_from    INTEGER,
            time_to      INTEGER,
            executed_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrate_creates_expected_tables() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();

        let table_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name IN \
                 ('workspaces', 'log_file_entries', 'highlights', 'search_history_entries')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(table_count, 4);
    }

    #[test]
    fn only_one_draft_workspace_allowed() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();

        conn.execute("INSERT INTO workspaces (is_draft) VALUES (1)", [])
            .unwrap();

        let err = conn
            .execute("INSERT INTO workspaces (is_draft) VALUES (1)", [])
            .unwrap_err();
        assert!(matches!(err, rusqlite::Error::SqliteFailure(_, _)));
    }
}
