pub mod highlight;
pub mod log_file_entry;
pub mod search_history;
pub mod settings;
pub mod workspace;

use rusqlite::ErrorCode;

/// True if `err` represents a SQLite `UNIQUE`/`CHECK` constraint violation
/// (used by repo callers to map storage errors onto specific `AppError`
/// variants such as `AliasCollision`/`WorkspaceAliasInUse`).
pub fn is_constraint_violation(err: &rusqlite::Error) -> bool {
    matches!(
        err,
        rusqlite::Error::SqliteFailure(e, _) if e.code == ErrorCode::ConstraintViolation
    )
}
