# Data Model: Fix Sudo Auto-Update on Linux

## Rust Types

### UpdateError (new enum in `src-tauri/src/error.rs` or dedicated update module)

Represents all failure modes for the custom Linux update flow.

```rust
#[derive(Debug, Serialize, specta::Type)]
#[serde(tag = "kind", content = "message")]
pub enum UpdateError {
    /// HTTP download failed
    DownloadFailed(String),
    /// Signature verification failed
    SignatureInvalid(String),
    /// pkexec binary not found on the system
    PkexecNotFound,
    /// User cancelled the pkexec authentication dialog
    UserCancelled,
    /// dpkg/rpm install command failed
    InstallFailed(String),
    /// Operation timed out
    Timeout,
    /// Could not write to any temp directory
    TempDirFailed,
    /// Downloaded file is not a valid deb/rpm/appimage
    InvalidPackageFormat,
}
```

### PackageType (enum for install dispatch)

```rust
#[derive(Debug, Clone, Copy)]
pub enum PackageType {
    Deb,
    Rpm,
    AppImage,
}
```

### DownloadResult (returned by download_update command)

```rust
#[derive(Debug, Serialize, specta::Type)]
pub struct DownloadResult {
    /// Absolute path to the downloaded and verified package in a temp directory
    pub path: String,
    /// Detected package type
    pub package_type: String, // "deb" | "rpm" | "appimage"
}
```

## Frontend Types

### UpdateStatus (extended)

```typescript
export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "error"
  | "downloading"
  | "installing"      // NEW: distinct install phase
  | "downloaded"       // renamed semantically to "installed" in UI, kept for compat
  | "signature-error"
  | "install-error";   // NEW: install-specific failure
```

### UpdateErrorInfo (new, for structured error display)

```typescript
export interface UpdateErrorInfo {
  kind: "download" | "signature" | "pkexec-not-found" | "user-cancelled"
      | "install-failed" | "timeout" | "unknown";
  message: string;
  releasesUrl: string;
}
```

## State Transitions

```
idle → checking → available → downloading → installing → downloaded (success)
                                    ↓              ↓
                                  error      install-error
                                              (retry install without re-download)
```

Key new transitions:
- `downloading → installing`: Download completed, now installing via pkexec
- `installing → downloaded`: Install succeeded, prompt restart
- `installing → install-error`: Install failed (pkexec not found, user cancelled, dpkg error)
- `install-error → installing`: User clicks "Retry Install" (reuses downloaded file path)

## Relationships

- The `DownloadResult.path` is stored in frontend state to enable retry-install without re-downloading.
- The `UpdateErrorInfo.releasesUrl` is derived from the app's update endpoint configuration.
- `PackageType` determines which install command is run (`dpkg -i` for Deb, `rpm -U` for Rpm, file replacement for AppImage).
