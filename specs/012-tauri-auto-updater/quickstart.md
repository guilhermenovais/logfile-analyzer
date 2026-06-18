# Quickstart: Tauri Auto-Updater

## Prerequisites

- Tauri CLI installed (`pnpm tauri --version`)
- GitHub repository with Actions enabled
- Repository secrets access (for signing key)

## 1. Generate Signing Keys

```bash
pnpm tauri signer generate -w ~/.tauri/logfile-analyzer.key
```

Save the output:
- **Public key**: Goes into `tauri.conf.json`
- **Private key file** (`~/.tauri/logfile-analyzer.key`): Content goes into GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY`

## 2. Add GitHub Secrets

In the repository settings (Settings > Secrets and variables > Actions), add:
- `TAURI_SIGNING_PRIVATE_KEY`: Content of the private key file
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: The password entered during key generation (or empty string)

## 3. Install Dependencies

```bash
# Frontend
pnpm add @tauri-apps/plugin-updater @tauri-apps/plugin-process

# Backend (from repo root)
cd src-tauri
cargo add tauri-plugin-updater --target 'cfg(any(target_os = "macos", windows, target_os = "linux"))'
cargo add tauri-plugin-process --target 'cfg(any(target_os = "macos", windows, target_os = "linux"))'
```

## 4. Configure Tauri

In `src-tauri/tauri.conf.json`, add:
- `bundle.createUpdaterArtifacts: true`
- `plugins.updater` section with pubkey and endpoint

## 5. Register Plugins (Rust)

In `src-tauri/src/lib.rs`, register both plugins:
```rust
.plugin(tauri_plugin_updater::Builder::new().build())
.plugin(tauri_plugin_process::init())
```

## 6. Add Permissions

In `src-tauri/capabilities/default.json`, add:
```json
"updater:default",
"process:allow-restart"
```

## 7. Test Locally

Local update checks will return "no update available" (or fail gracefully if offline) since the endpoint points to GitHub Releases. To test the full flow:

1. Merge changes and let CI create a release at current version
2. Bump the version in `tauri.conf.json` and `package.json`
3. Merge again to create a new release
4. Run the older version — it should detect and offer the update

## 8. Verify the Release Workflow

After pushing, confirm the GitHub Actions release workflow:
1. Builds with signing enabled (no errors about missing `TAURI_SIGNING_PRIVATE_KEY`)
2. Uploads `.sig` files alongside installers
3. Uploads `latest.json` to the release
4. The `latest.json` contains valid platform entries with signatures
