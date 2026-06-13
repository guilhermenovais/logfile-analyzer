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

        CREATE TABLE IF NOT EXISTS app_settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    )?;

    migrate_search_history_entries(conn)
}

/// A sentinel standing in for `NULL` `time_from`/`time_to` in the dedup
/// index below, so two "no time range" entries with the same `query`/
/// `search_type` collide (data-model.md "Uniqueness / dedup").
const NULL_TIME_SENTINEL: i64 = i64::MIN;

/// Creates the `workspace_id`-scoped `search_history_entries` table and its
/// dedup index (data-model.md "SearchHistoryEntry"), migrating rows from the
/// old `file_id`-based table if present (FR-019).
fn migrate_search_history_entries(conn: &Connection) -> rusqlite::Result<()> {
    let has_old_schema = table_has_column(conn, "search_history_entries", "file_id")?;

    if has_old_schema {
        conn.execute_batch(&format!(
            r#"
            ALTER TABLE search_history_entries RENAME TO search_history_entries_old;

            CREATE TABLE search_history_entries (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id  INTEGER NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
                query         TEXT NOT NULL,
                search_type   TEXT NOT NULL CHECK (search_type IN ('logical', 'regex')),
                time_from     INTEGER,
                time_to       INTEGER,
                last_used_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );

            CREATE UNIQUE INDEX idx_search_history_dedup
                ON search_history_entries (
                    workspace_id, query, search_type,
                    COALESCE(time_from, {sentinel}),
                    COALESCE(time_to, {sentinel})
                );

            INSERT INTO search_history_entries
                (workspace_id, query, search_type, time_from, time_to, last_used_at)
            SELECT
                log_file_entries.workspace_id,
                search_history_entries_old.query,
                search_history_entries_old.search_type,
                search_history_entries_old.time_from,
                search_history_entries_old.time_to,
                MAX(search_history_entries_old.executed_at)
            FROM search_history_entries_old
            JOIN log_file_entries ON log_file_entries.id = search_history_entries_old.file_id
            GROUP BY
                log_file_entries.workspace_id,
                search_history_entries_old.query,
                search_history_entries_old.search_type,
                search_history_entries_old.time_from,
                search_history_entries_old.time_to;

            DROP TABLE search_history_entries_old;
            "#,
            sentinel = NULL_TIME_SENTINEL,
        ))
    } else {
        conn.execute_batch(&format!(
            r#"
            CREATE TABLE IF NOT EXISTS search_history_entries (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id  INTEGER NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
                query         TEXT NOT NULL,
                search_type   TEXT NOT NULL CHECK (search_type IN ('logical', 'regex')),
                time_from     INTEGER,
                time_to       INTEGER,
                last_used_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_search_history_dedup
                ON search_history_entries (
                    workspace_id, query, search_type,
                    COALESCE(time_from, {sentinel}),
                    COALESCE(time_to, {sentinel})
                );
            "#,
            sentinel = NULL_TIME_SENTINEL,
        ))
    }
}

/// Whether `table` has a column named `column`, or `false` if `table`
/// doesn't exist (used to detect the pre-FR-019 `search_history_entries`
/// shape).
fn table_has_column(conn: &Connection, table: &str, column: &str) -> rusqlite::Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get("name")?;
        if name == column {
            return Ok(true);
        }
    }
    Ok(false)
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

    /// data-model.md "Migration (FR-019)": the old `file_id`-based
    /// `search_history_entries` table is migrated to the new
    /// `workspace_id`-based shape, with rows deduped by the new uniqueness
    /// key and `last_used_at = MAX(executed_at)` per group, and the old
    /// table dropped.
    #[test]
    fn migrate_search_history_from_file_id_to_workspace_id_dedupes_and_drops_old_table() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE workspaces (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                alias       TEXT UNIQUE,
                is_draft    INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );

            CREATE TABLE log_file_entries (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id          INTEGER NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
                path                  TEXT NOT NULL,
                alias                 TEXT NOT NULL,
                has_timestamp_format  INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE search_history_entries (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id      INTEGER NOT NULL REFERENCES log_file_entries (id) ON DELETE CASCADE,
                query        TEXT NOT NULL,
                search_type  TEXT NOT NULL CHECK (search_type IN ('logical', 'regex')),
                time_from    INTEGER,
                time_to      INTEGER,
                executed_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );

            INSERT INTO workspaces (id, alias, is_draft) VALUES (1, 'ws', 1);
            INSERT INTO log_file_entries (id, workspace_id, path, alias) VALUES (1, 1, '/var/log/app.log', 'app');
            INSERT INTO log_file_entries (id, workspace_id, path, alias) VALUES (2, 1, '/var/log/db.log', 'db');

            -- Same (workspace_id, query, search_type, time_from, time_to) key via two
            -- different files (file_id 1 and 2 both resolve to workspace 1) — should
            -- dedup into one row with last_used_at = the later executed_at.
            INSERT INTO search_history_entries (file_id, query, search_type, time_from, time_to, executed_at)
                VALUES (1, '"error" AND "db"', 'logical', NULL, NULL, '2026-01-01T00:00:00.000Z');
            INSERT INTO search_history_entries (file_id, query, search_type, time_from, time_to, executed_at)
                VALUES (2, '"error" AND "db"', 'logical', NULL, NULL, '2026-01-02T00:00:00.000Z');
            INSERT INTO search_history_entries (file_id, query, search_type, time_from, time_to, executed_at)
                VALUES (1, 'err.*', 'regex', 0, 1000, '2026-01-01T12:00:00.000Z');
            "#,
        )
        .unwrap();

        migrate(&conn).unwrap();

        let mut stmt = conn
            .prepare("PRAGMA table_info(search_history_entries)")
            .unwrap();
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>("name"))
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        assert_eq!(
            columns,
            vec![
                "id",
                "workspace_id",
                "query",
                "search_type",
                "time_from",
                "time_to",
                "last_used_at",
            ]
        );

        let count: i64 = conn
            .query_row("SELECT count(*) FROM search_history_entries", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 2);

        let (workspace_id, last_used_at): (i64, String) = conn
            .query_row(
                "SELECT workspace_id, last_used_at FROM search_history_entries WHERE query = ?1",
                rusqlite::params![r#""error" AND "db""#],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(workspace_id, 1);
        assert_eq!(last_used_at, "2026-01-02T00:00:00.000Z");

        // The UNIQUE dedup index rejects a second row with the same key.
        let err = conn
            .execute(
                "INSERT INTO search_history_entries (workspace_id, query, search_type, time_from, time_to) \
                 VALUES (1, ?1, 'logical', NULL, NULL)",
                rusqlite::params![r#""error" AND "db""#],
            )
            .unwrap_err();
        assert!(matches!(err, rusqlite::Error::SqliteFailure(_, _)));
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
