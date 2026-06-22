use std::process::Command;

use serde::Serialize;

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct DownloadResult {
    pub path: String,
    pub package_type: String,
}

#[derive(Debug, Clone, Copy)]
pub enum PackageType {
    Deb,
    Rpm,
    AppImage,
}

impl PackageType {
    pub fn as_str(&self) -> &'static str {
        match self {
            PackageType::Deb => "deb",
            PackageType::Rpm => "rpm",
            PackageType::AppImage => "appimage",
        }
    }

    pub fn from_mime(mime: &str) -> Option<Self> {
        match mime {
            "application/x-debian-package" => Some(PackageType::Deb),
            "application/x-rpm" => Some(PackageType::Rpm),
            "application/x-executable" | "application/x-elf" => Some(PackageType::AppImage),
            _ => None,
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn get_platform() -> String {
    if cfg!(target_os = "linux") {
        "linux".into()
    } else if cfg!(target_os = "macos") {
        "macos".into()
    } else {
        "windows".into()
    }
}

#[tauri::command]
#[specta::specta]
pub async fn download_update(
    app: tauri::AppHandle,
    url: String,
    signature: String,
) -> Result<DownloadResult, AppError> {
    use base64::Engine;

    let pubkey_b64 = app
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|v| v.get("pubkey"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::SignatureInvalid("no pubkey configured".into()))?
        .to_string();

    let pubkey_str = String::from_utf8(
        base64::engine::general_purpose::STANDARD
            .decode(&pubkey_b64)
            .map_err(|e| AppError::SignatureInvalid(format!("pubkey base64: {e}")))?,
    )
    .map_err(|e| AppError::SignatureInvalid(format!("pubkey utf8: {e}")))?;

    let pubkey = minisign_verify::PublicKey::from_base64(
        pubkey_str
            .lines()
            .nth(1)
            .ok_or_else(|| AppError::SignatureInvalid("malformed pubkey".into()))?,
    )
    .map_err(|e| AppError::SignatureInvalid(format!("pubkey parse: {e}")))?;

    let response = reqwest::get(&url)
        .await
        .map_err(|e| AppError::DownloadFailed(e.to_string()))?;

    if !response.status().is_success() {
        return Err(AppError::DownloadFailed(format!(
            "HTTP {}",
            response.status()
        )));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| AppError::DownloadFailed(e.to_string()))?;

    let sig_decoded = base64::engine::general_purpose::STANDARD
        .decode(signature.trim())
        .map_err(|e| AppError::SignatureInvalid(format!("signature base64: {e}")))?;

    let sig_str = String::from_utf8(sig_decoded)
        .map_err(|e| AppError::SignatureInvalid(format!("signature utf8: {e}")))?;

    let sig = minisign_verify::Signature::decode(&sig_str)
        .map_err(|e| AppError::SignatureInvalid(format!("signature decode: {e}")))?;

    pubkey
        .verify(&bytes, &sig, false)
        .map_err(|e| AppError::SignatureInvalid(format!("verification: {e}")))?;

    let kind = infer::get(&bytes);
    let package_type = kind
        .and_then(|k| PackageType::from_mime(k.mime_type()))
        .ok_or(AppError::InvalidPackageFormat)?;

    let mut tmp = tempfile::Builder::new()
        .prefix("logfile-analyzer-update-")
        .suffix(match package_type {
            PackageType::Deb => ".deb",
            PackageType::Rpm => ".rpm",
            PackageType::AppImage => ".AppImage",
        })
        .tempfile()
        .map_err(|_| AppError::TempDirFailed)?;

    std::io::Write::write_all(&mut tmp, &bytes).map_err(|e| AppError::Io(e.to_string()))?;

    let path = tmp.into_temp_path();
    let path_str = path
        .to_str()
        .ok_or_else(|| AppError::Io("non-utf8 temp path".into()))?
        .to_string();

    // Persist the temp file so it isn't deleted when path drops
    path.persist(&path_str)
        .map_err(|e| AppError::Io(e.to_string()))?;

    Ok(DownloadResult {
        path: path_str,
        package_type: package_type.as_str().to_string(),
    })
}

#[tauri::command]
#[specta::specta]
pub async fn install_update(package_path: String, package_type: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || install_update_blocking(&package_path, &package_type))
        .await
        .map_err(|e| AppError::InstallFailed(e.to_string()))?
}

fn install_update_blocking(package_path: &str, package_type: &str) -> Result<(), AppError> {
    match package_type {
        "appimage" => {
            let current_exe =
                std::env::current_exe().map_err(|e| AppError::InstallFailed(e.to_string()))?;
            std::fs::copy(package_path, &current_exe)
                .map_err(|e| AppError::InstallFailed(e.to_string()))?;
            return Ok(());
        }
        "deb" | "rpm" => {}
        _ => return Err(AppError::InvalidPackageFormat),
    }

    let pkexec = which_pkexec()?;

    let (cmd, args): (&str, &[&str]) = match package_type {
        "deb" => ("dpkg", &["-i", package_path]),
        "rpm" => ("rpm", &["-U", package_path]),
        _ => unreachable!(),
    };

    let timeout = std::time::Duration::from_secs(110);
    let child = Command::new(&pkexec)
        .arg(cmd)
        .args(args)
        .spawn()
        .map_err(|e| AppError::InstallFailed(e.to_string()))?;

    let start = std::time::Instant::now();
    let mut child = child;

    loop {
        match child.try_wait() {
            Ok(Some(exit_status)) => {
                return match exit_status.code() {
                    Some(0) => Ok(()),
                    Some(126) | Some(127) => Err(AppError::UserCancelled),
                    Some(code) => Err(AppError::InstallFailed(format!("exit code {code}"))),
                    None => Err(AppError::InstallFailed("killed by signal".into())),
                };
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    return Err(AppError::Timeout);
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err(e) => return Err(AppError::InstallFailed(e.to_string())),
        }
    }
}

fn which_pkexec() -> Result<String, AppError> {
    let output = Command::new("which")
        .arg("pkexec")
        .output()
        .map_err(|_| AppError::PkexecNotFound)?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(AppError::PkexecNotFound)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // T007: get_platform tests
    #[test]
    fn get_platform_returns_linux_on_linux() {
        let platform = get_platform();
        if cfg!(target_os = "linux") {
            assert_eq!(platform, "linux");
        } else if cfg!(target_os = "macos") {
            assert_eq!(platform, "macos");
        } else {
            assert_eq!(platform, "windows");
        }
    }

    #[test]
    fn get_platform_returns_known_value() {
        let platform = get_platform();
        assert!(
            ["linux", "macos", "windows"].contains(&platform.as_str()),
            "unexpected platform: {platform}"
        );
    }

    // T008: download_update error path tests (no AppHandle available in unit tests,
    // so we test the helper types and error mapping logic)
    #[test]
    fn package_type_from_mime_deb() {
        assert!(matches!(
            PackageType::from_mime("application/x-debian-package"),
            Some(PackageType::Deb)
        ));
    }

    #[test]
    fn package_type_from_mime_rpm() {
        assert!(matches!(
            PackageType::from_mime("application/x-rpm"),
            Some(PackageType::Rpm)
        ));
    }

    #[test]
    fn package_type_from_mime_appimage() {
        assert!(matches!(
            PackageType::from_mime("application/x-executable"),
            Some(PackageType::AppImage)
        ));
        assert!(matches!(
            PackageType::from_mime("application/x-elf"),
            Some(PackageType::AppImage)
        ));
    }

    #[test]
    fn package_type_from_mime_unknown_returns_none() {
        assert!(PackageType::from_mime("text/plain").is_none());
        assert!(PackageType::from_mime("application/json").is_none());
    }

    #[test]
    fn package_type_as_str() {
        assert_eq!(PackageType::Deb.as_str(), "deb");
        assert_eq!(PackageType::Rpm.as_str(), "rpm");
        assert_eq!(PackageType::AppImage.as_str(), "appimage");
    }

    #[test]
    fn download_result_serializes_correctly() {
        let result = DownloadResult {
            path: "/tmp/test.deb".into(),
            package_type: "deb".into(),
        };
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["path"], "/tmp/test.deb");
        assert_eq!(json["package_type"], "deb");
    }

    // T009: install_update error path tests
    #[test]
    fn install_update_blocking_rejects_invalid_package_type() {
        let result = install_update_blocking("/tmp/test.pkg", "unknown");
        assert!(matches!(result, Err(AppError::InvalidPackageFormat)));
    }

    #[test]
    fn install_update_blocking_appimage_fails_on_nonexistent_path() {
        let result = install_update_blocking("/tmp/nonexistent-99999.AppImage", "appimage");
        assert!(matches!(result, Err(AppError::InstallFailed(_))));
    }

    #[test]
    fn which_pkexec_returns_result() {
        // This test verifies the function runs without panicking.
        // On systems without pkexec, it returns PkexecNotFound.
        let result = which_pkexec();
        match result {
            Ok(path) => assert!(!path.is_empty()),
            Err(e) => assert!(matches!(e, AppError::PkexecNotFound)),
        }
    }
}
