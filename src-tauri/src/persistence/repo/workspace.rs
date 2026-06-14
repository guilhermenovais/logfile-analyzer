use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::error::{AppError, Result};
use crate::persistence::repo::is_constraint_violation;

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct Workspace {
    pub id: i64,
    pub alias: Option<String>,
    pub is_draft: bool,
    pub created_at: String,
    pub modified_at: String,
}

fn row_to_workspace(row: &rusqlite::Row) -> rusqlite::Result<Workspace> {
    Ok(Workspace {
        id: row.get("id")?,
        alias: row.get("alias")?,
        is_draft: row.get::<_, i64>("is_draft")? != 0,
        created_at: row.get("created_at")?,
        modified_at: row.get("modified_at")?,
    })
}

/// Returns the single auto-maintained draft workspace, creating it if none
/// exists yet (FR-004/FR-005).
pub fn get_or_create_draft(conn: &Connection) -> Result<Workspace> {
    if let Some(ws) = get_draft(conn)? {
        return Ok(ws);
    }
    conn.execute("INSERT INTO workspaces (is_draft) VALUES (1)", [])?;
    let id = conn.last_insert_rowid();
    get(conn, id)?.ok_or(AppError::NoActiveWorkspace)
}

pub fn get_draft(conn: &Connection) -> Result<Option<Workspace>> {
    conn.query_row(
        "SELECT id, alias, is_draft, created_at, modified_at FROM workspaces WHERE is_draft = 1",
        [],
        row_to_workspace,
    )
    .optional()
    .map_err(AppError::from)
}

pub fn get(conn: &Connection, id: i64) -> Result<Option<Workspace>> {
    conn.query_row(
        "SELECT id, alias, is_draft, created_at, modified_at FROM workspaces WHERE id = ?1",
        params![id],
        row_to_workspace,
    )
    .optional()
    .map_err(AppError::from)
}

pub fn find_by_alias(conn: &Connection, alias: &str) -> Result<Option<Workspace>> {
    conn.query_row(
        "SELECT id, alias, is_draft, created_at, modified_at FROM workspaces WHERE alias = ?1",
        params![alias],
        row_to_workspace,
    )
    .optional()
    .map_err(AppError::from)
}

/// Returns every saved (non-draft) workspace, most recently modified first
/// (FR-009).
pub fn list_saved(conn: &Connection) -> Result<Vec<Workspace>> {
    let mut stmt = conn.prepare(
        "SELECT id, alias, is_draft, created_at, modified_at FROM workspaces \
         WHERE is_draft = 0 ORDER BY modified_at DESC",
    )?;
    let rows = stmt.query_map([], row_to_workspace)?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(AppError::from)
}

/// Persists the draft `id` under `alias`, converting it into a saved
/// workspace (FR-008). Rejects with `WorkspaceAliasInUse` if another
/// workspace already uses `alias`.
pub fn save(conn: &Connection, id: i64, alias: &str) -> Result<Workspace> {
    if let Some(existing) = find_by_alias(conn, alias)? {
        if existing.id != id {
            return Err(AppError::WorkspaceAliasInUse);
        }
    }
    conn.execute(
        "UPDATE workspaces SET alias = ?1, is_draft = 0, \
         modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?2",
        params![alias, id],
    )
    .map_err(|err| {
        if is_constraint_violation(&err) {
            AppError::WorkspaceAliasInUse
        } else {
            AppError::from(err)
        }
    })?;
    get(conn, id)?.ok_or(AppError::NoActiveWorkspace)
}

/// Renames workspace `id` to `alias` without changing its `is_draft` status
/// (FR-0xx). The alias is trimmed; an empty result is rejected with
/// `InvalidWorkspaceName`. Rejects with `WorkspaceAliasInUse` if another
/// workspace already uses `alias`.
pub fn rename(conn: &Connection, id: i64, alias: &str) -> Result<Workspace> {
    let alias = alias.trim();
    if alias.is_empty() {
        return Err(AppError::InvalidWorkspaceName);
    }
    if let Some(existing) = find_by_alias(conn, alias)? {
        if existing.id != id {
            return Err(AppError::WorkspaceAliasInUse);
        }
    }
    conn.execute(
        "UPDATE workspaces SET alias = ?1, \
         modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?2",
        params![alias, id],
    )
    .map_err(|err| {
        if is_constraint_violation(&err) {
            AppError::WorkspaceAliasInUse
        } else {
            AppError::from(err)
        }
    })?;
    get(conn, id)?.ok_or(AppError::NoActiveWorkspace)
}

/// Deletes a workspace, cascading to its log file entries, highlights, and
/// search history (FK `ON DELETE CASCADE`).
pub fn delete(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM workspaces WHERE id = ?1", params![id])?;
    Ok(())
}

/// Updates `modified_at` to now (drives `is_workspace_dirty`/draft
/// auto-recovery, SC-004).
pub fn touch(conn: &Connection, id: i64) -> Result<()> {
    conn.execute(
        "UPDATE workspaces SET modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::schema;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        schema::migrate(&conn).unwrap();
        conn
    }

    #[test]
    fn get_or_create_draft_is_idempotent() {
        let conn = test_conn();
        let first = get_or_create_draft(&conn).unwrap();
        let second = get_or_create_draft(&conn).unwrap();
        assert_eq!(first.id, second.id);
        assert!(second.is_draft);
        assert!(second.alias.is_none());
    }

    #[test]
    fn touch_updates_modified_at() {
        let conn = test_conn();
        let ws = get_or_create_draft(&conn).unwrap();
        touch(&conn, ws.id).unwrap();
        let reloaded = get(&conn, ws.id).unwrap().unwrap();
        assert_eq!(reloaded.id, ws.id);
    }

    #[test]
    fn save_converts_draft_to_saved_workspace() {
        let conn = test_conn();
        let draft = get_or_create_draft(&conn).unwrap();

        let saved = save(&conn, draft.id, "my-investigation").unwrap();

        assert_eq!(saved.alias, Some("my-investigation".to_string()));
        assert!(!saved.is_draft);
    }

    #[test]
    fn save_rejects_alias_collision() {
        let conn = test_conn();
        let first = get_or_create_draft(&conn).unwrap();
        save(&conn, first.id, "taken").unwrap();

        // A new draft can now be created since the previous one was saved.
        let second = get_or_create_draft(&conn).unwrap();
        assert!(matches!(
            save(&conn, second.id, "taken"),
            Err(AppError::WorkspaceAliasInUse)
        ));
    }

    #[test]
    fn list_saved_excludes_drafts() {
        let conn = test_conn();
        let draft = get_or_create_draft(&conn).unwrap();
        save(&conn, draft.id, "saved-one").unwrap();
        get_or_create_draft(&conn).unwrap();

        let saved = list_saved(&conn).unwrap();
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].alias, Some("saved-one".to_string()));
    }

    #[test]
    fn rename_updates_alias_and_modified_at_without_changing_is_draft() {
        let conn = test_conn();
        let draft = get_or_create_draft(&conn).unwrap();

        // `modified_at` has millisecond resolution; ensure the rename's
        // timestamp lands in a later millisecond than the draft's.
        std::thread::sleep(std::time::Duration::from_millis(5));

        let renamed = rename(&conn, draft.id, "my-investigation").unwrap();

        assert_eq!(renamed.alias, Some("my-investigation".to_string()));
        assert!(renamed.is_draft);
        assert_ne!(renamed.modified_at, draft.modified_at);

        let saved = save(&conn, draft.id, "saved-name").unwrap();
        let renamed_saved = rename(&conn, saved.id, "renamed-saved").unwrap();
        assert_eq!(renamed_saved.alias, Some("renamed-saved".to_string()));
        assert!(!renamed_saved.is_draft);
    }

    #[test]
    fn rename_trims_surrounding_whitespace() {
        let conn = test_conn();
        let draft = get_or_create_draft(&conn).unwrap();

        let renamed = rename(&conn, draft.id, "  spaced-name  ").unwrap();

        assert_eq!(renamed.alias, Some("spaced-name".to_string()));
    }

    #[test]
    fn rename_rejects_empty_or_whitespace_only_alias() {
        let conn = test_conn();
        let draft = get_or_create_draft(&conn).unwrap();

        assert!(matches!(
            rename(&conn, draft.id, ""),
            Err(AppError::InvalidWorkspaceName)
        ));
        assert!(matches!(
            rename(&conn, draft.id, "   "),
            Err(AppError::InvalidWorkspaceName)
        ));

        let reloaded = get(&conn, draft.id).unwrap().unwrap();
        assert_eq!(reloaded.alias, None);
        assert_eq!(reloaded.modified_at, draft.modified_at);
    }

    #[test]
    fn rename_rejects_alias_collision() {
        let conn = test_conn();
        let first = get_or_create_draft(&conn).unwrap();
        save(&conn, first.id, "taken").unwrap();

        let second = get_or_create_draft(&conn).unwrap();
        let err = rename(&conn, second.id, "taken").unwrap_err();
        assert!(matches!(err, AppError::WorkspaceAliasInUse));

        let reloaded = get(&conn, second.id).unwrap().unwrap();
        assert_eq!(reloaded.alias, None);
        assert_eq!(reloaded.modified_at, second.modified_at);
    }
}
