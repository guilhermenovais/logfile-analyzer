//! `app_settings` key-value repo (data-model.md "McpServerConfiguration"):
//! persists the single user-configured MCP server port.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::Result;

const MCP_PORT_KEY: &str = "mcp_port";
const LAST_ACTIVE_WORKSPACE_KEY: &str = "last_active_workspace_id";

/// Returns the persisted MCP server port, or `None` if not yet configured
/// (FR-001/FR-002).
pub fn get_mcp_port(conn: &Connection) -> Result<Option<u16>> {
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![MCP_PORT_KEY],
            |row| row.get(0),
        )
        .optional()?;

    Ok(value.and_then(|v| v.parse::<u16>().ok()))
}

/// Persists `port` as the configured MCP server port (FR-006), overwriting
/// any previously-configured value.
pub fn set_mcp_port(conn: &Connection, port: u16) -> Result<()> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2) \
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        params![MCP_PORT_KEY, port.to_string()],
    )?;
    Ok(())
}

/// Returns the id of the workspace that was active when the app last
/// closed, or `None` if no session has been recorded yet (FR-009).
pub fn get_last_active_workspace(conn: &Connection) -> Result<Option<i64>> {
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![LAST_ACTIVE_WORKSPACE_KEY],
            |row| row.get(0),
        )
        .optional()?;

    Ok(value.and_then(|v| v.parse::<i64>().ok()))
}

/// Persists `workspace_id` as the last active workspace (FR-003),
/// overwriting any previously-recorded value.
pub fn set_last_active_workspace(conn: &Connection, workspace_id: i64) -> Result<()> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2) \
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        params![LAST_ACTIVE_WORKSPACE_KEY, workspace_id.to_string()],
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
    fn get_mcp_port_returns_none_when_absent() {
        let conn = test_conn();
        assert_eq!(get_mcp_port(&conn).unwrap(), None);
    }

    #[test]
    fn set_then_get_returns_the_persisted_port() {
        let conn = test_conn();
        set_mcp_port(&conn, 8741).unwrap();
        assert_eq!(get_mcp_port(&conn).unwrap(), Some(8741));
    }

    #[test]
    fn set_overwrites_the_previous_port_on_second_set() {
        let conn = test_conn();
        set_mcp_port(&conn, 8741).unwrap();
        set_mcp_port(&conn, 9000).unwrap();
        assert_eq!(get_mcp_port(&conn).unwrap(), Some(9000));
    }

    #[test]
    fn get_last_active_workspace_returns_none_when_absent() {
        let conn = test_conn();
        assert_eq!(get_last_active_workspace(&conn).unwrap(), None);
    }

    #[test]
    fn set_then_get_returns_the_persisted_workspace_id() {
        let conn = test_conn();
        set_last_active_workspace(&conn, 3).unwrap();
        assert_eq!(get_last_active_workspace(&conn).unwrap(), Some(3));
    }

    #[test]
    fn set_overwrites_the_previous_workspace_id_on_second_set() {
        let conn = test_conn();
        set_last_active_workspace(&conn, 3).unwrap();
        set_last_active_workspace(&conn, 7).unwrap();
        assert_eq!(get_last_active_workspace(&conn).unwrap(), Some(7));
    }
}
