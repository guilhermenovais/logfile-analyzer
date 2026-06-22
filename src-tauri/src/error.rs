use serde::Serialize;

/// Shared error type returned by every fallible Tauri command and MCP tool
/// (Principle I). Serialized to the frontend as `{ "kind": ..., "message"?: ... }`.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    NoActiveWorkspace,
    WorkspaceNotFound,
    FileAlreadyInWorkspace,
    AliasCollision,
    WorkspaceAliasInUse,
    InvalidWorkspaceName,
    FileNotFound,
    FileUnavailable,
    LineOutOfRange,
    InvalidQuery,
    TimeRangeUnavailable,
    InvalidPort,
    PortUnavailable(String),
    Io(String),
    DownloadFailed(String),
    SignatureInvalid(String),
    PkexecNotFound,
    UserCancelled,
    InstallFailed(String),
    Timeout,
    TempDirFailed,
    InvalidPackageFormat,
}

pub type Result<T> = std::result::Result<T, AppError>;

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::NoActiveWorkspace => write!(f, "no active workspace"),
            AppError::WorkspaceNotFound => write!(f, "workspace not found"),
            AppError::FileAlreadyInWorkspace => write!(f, "file already in workspace"),
            AppError::AliasCollision => write!(f, "alias already in use in this workspace"),
            AppError::WorkspaceAliasInUse => write!(f, "workspace alias already in use"),
            AppError::InvalidWorkspaceName => write!(f, "workspace name cannot be empty"),
            AppError::FileNotFound => write!(f, "file not found"),
            AppError::FileUnavailable => write!(f, "file unavailable"),
            AppError::LineOutOfRange => write!(f, "line index out of range"),
            AppError::InvalidQuery => write!(f, "invalid query"),
            AppError::TimeRangeUnavailable => write!(f, "time range search unavailable"),
            AppError::InvalidPort => write!(f, "invalid port"),
            AppError::PortUnavailable(reason) => write!(f, "port unavailable: {reason}"),
            AppError::Io(msg) => write!(f, "io error: {msg}"),
            AppError::DownloadFailed(msg) => write!(f, "download failed: {msg}"),
            AppError::SignatureInvalid(msg) => write!(f, "signature invalid: {msg}"),
            AppError::PkexecNotFound => write!(f, "pkexec not found"),
            AppError::UserCancelled => write!(f, "user cancelled"),
            AppError::InstallFailed(msg) => write!(f, "install failed: {msg}"),
            AppError::Timeout => write!(f, "operation timed out"),
            AppError::TempDirFailed => write!(f, "failed to create temp directory"),
            AppError::InvalidPackageFormat => write!(f, "invalid package format"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError::Io(err.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err.to_string())
    }
}
