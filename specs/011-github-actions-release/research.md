# Research: GitHub Actions Release Workflow

**Feature**: 011-github-actions-release  
**Date**: 2026-06-18

## R-001: Tauri v2 GitHub Actions Build Setup

**Decision**: Use `tauri-apps/tauri-action@v0` for building Tauri v2 apps in CI.

**Rationale**: The `@v0` tag is the Tauri v2-compatible version of the official action. It handles invoking `tauri build` with the correct arguments, collecting bundle artifacts, and optionally creating GitHub releases. Using the official action avoids reimplementing Tauri-specific build logic (frontend build, Rust compilation, bundling).

**Alternatives considered**:
- Manual `pnpm tauri build` in CI: More control but requires manually locating output artifacts per platform; fragile if Tauri changes bundle paths.
- Third-party actions: No maintained alternatives with Tauri v2 support.

## R-002: Preventing Partial Releases (FR-007)

**Decision**: Separate building from releasing — build artifacts are uploaded via `actions/upload-artifact@v4` during a matrix job, then a downstream `release` job (which depends on all builds succeeding) creates the GitHub release with all artifacts at once.

**Rationale**: If `tauri-action` creates the release inline during the matrix, the first platform to finish publishes a release with only its artifacts. If another platform later fails, users see a partial release. By deferring release creation to a job gated on all builds, either all artifacts are published or none are.

**Alternatives considered**:
- Use `tauri-action`'s built-in release creation with `fail-fast: true`: Partial release still exists briefly; cancelled jobs leave artifacts already uploaded to the release.
- Draft release in matrix, undraft after all succeed: Still exposes partial artifacts in the draft, adds complexity.

## R-003: Release Overwrite Strategy (FR-006)

**Decision**: Delete the existing release and tag (via `gh release delete --cleanup-tag`) before creating the new release in the `release` job.

**Rationale**: `softprops/action-gh-release@v2` does not natively support overwriting an existing release's assets cleanly. Deleting first then recreating ensures a clean release with only the latest artifacts. The `--cleanup-tag` flag also removes the Git tag so the new release can re-tag at the new commit.

**Alternatives considered**:
- GitHub API to update existing release: Complex asset management (must delete each old asset individually, then upload new ones).
- `softprops/action-gh-release` with `allowUpdates: true`: Updates release metadata but appends assets rather than replacing them — users would see stale artifacts from prior builds alongside new ones.

## R-004: macOS Universal Binary

**Decision**: Pass `--target universal-apple-darwin` to `tauri build` on macOS, after installing both `aarch64-apple-darwin` and `x86_64-apple-darwin` Rust targets.

**Rationale**: Produces a single set of bundles (`.dmg`, `.app`) that work on both Intel and Apple Silicon Macs. This matches the spec requirement for universal macOS support and avoids publishing separate Intel/ARM artifacts that confuse users.

**Alternatives considered**:
- Separate aarch64 and x86_64 builds: Doubles macOS CI time, produces two sets of artifacts users must choose between.
- aarch64-only: Excludes Intel Mac users still on older hardware.

## R-005: Linux Build Dependencies

**Decision**: Install Tauri v2 system dependencies on Ubuntu 22.04 via `apt-get`: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`.

**Rationale**: Tauri v2 on Linux requires WebKitGTK 4.1 (not 4.0 which is Tauri v1). Ubuntu 22.04 provides the correct package versions. These are build-time only — the bundled `.deb` and `.AppImage` handle runtime dependencies.

**Alternatives considered**:
- Ubuntu 24.04 (`ubuntu-latest`): May work but 22.04 is the tested/documented runner for Tauri v2 builds, producing more compatible binaries.
- Container-based build: Unnecessary complexity for a standard Tauri build.

## R-006: Concurrency and Run Cancellation

**Decision**: Use GitHub Actions `concurrency` key with `group: release` and `cancel-in-progress: true`.

**Rationale**: When multiple rapid pushes to main occur, only the latest push should complete its workflow. The concurrency group ensures in-progress runs are automatically cancelled, matching the spec requirement.

**Alternatives considered**:
- No concurrency control: Multiple releases could be created in rapid succession, wasting CI time and potentially producing releases from stale commits.
- Queue-based approach: Overly complex for this use case.

## R-007: pnpm Setup in CI

**Decision**: Use `pnpm/action-setup@v4` (which auto-detects version from `package.json` `packageManager` field, or uses latest if unset) combined with `actions/setup-node@v4` for Node.js and caching.

**Rationale**: The project uses pnpm but doesn't have a `packageManager` field in `package.json`. `pnpm/action-setup@v4` without an explicit version will install the latest pnpm, which is acceptable since pnpm is backwards-compatible and the lockfile format is stable.

**Alternatives considered**:
- `corepack enable`: Requires `packageManager` field in `package.json`; would need a separate change.
- Manual `npm install -g pnpm`: No caching benefits.

## R-008: Auto-Generated Release Notes (FR-009)

**Decision**: Use `softprops/action-gh-release@v2` with `generate_release_notes: true`.

**Rationale**: GitHub's built-in release notes auto-generation lists merged PRs and contributors since the previous release. This matches FR-009 without requiring manual changelog maintenance. The `softprops/action-gh-release` action supports this flag directly.

**Alternatives considered**:
- Manual changelog generation: Requires tooling, maintenance, and is error-prone.
- Empty release body: Doesn't meet the spec requirement.

## R-009: Rust Toolchain in CI

**Decision**: Use `dtolnay/rust-toolchain@stable` for general builds, adding macOS cross-compilation targets conditionally. The project's `rust-toolchain.toml` (pinned at 1.94.0) is respected locally but CI uses stable for forward compatibility.

**Rationale**: Using `stable` ensures the CI builds with a well-supported toolchain. The `rust-toolchain.toml` pin is primarily for local development reproducibility. If strict pinning is desired in CI, the version can be changed to `@1.94.0`.

**Alternatives considered**:
- Pin to exact version (`@1.94.0`): More reproducible but requires manual updates; stable Rust is highly backwards-compatible.
- `@master` with `toolchain` from file: Adds complexity without meaningful benefit.
