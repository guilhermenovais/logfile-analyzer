//! `app_settings` key-value repo (data-model.md "McpServerConfiguration"):
//! persists the single user-configured MCP server port.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::Result;

const MCP_PORT_KEY: &str = "mcp_port";

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
}
