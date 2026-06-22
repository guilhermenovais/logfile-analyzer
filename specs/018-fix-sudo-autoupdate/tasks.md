# Tasks: Fix Sudo Auto-Update on Linux

**Input**: Design documents from `/specs/018-fix-sudo-autoupdate/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: Tests are MANDATORY per the project constitution (Test-First Quality Gates). Write tests for each user story before implementing it, and ensure they fail before implementation begins.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add new dependencies and create the update command module skeleton

- [x] T001 Add `reqwest` (with `rustls-tls` feature) as regular dependency, add `minisign-verify`, `base64`, `tempfile`, and `infer` crates to `[dependencies]` in `src-tauri/Cargo.toml`
- [x] T002 Create `src-tauri/src/commands/update.rs` with an empty module and register it as `pub mod update` in `src-tauri/src/commands/mod.rs`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define shared types and wire up command registration so user story work can begin

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Add update-specific error variants (`DownloadFailed`, `SignatureInvalid`, `PkexecNotFound`, `UserCancelled`, `InstallFailed`, `Timeout`, `TempDirFailed`, `InvalidPackageFormat`) to `AppError` in `src-tauri/src/error.rs` with Display and serde mappings
- [x] T004 Define `DownloadResult` struct (with `Serialize`, `specta::Type`) and `PackageType` enum in `src-tauri/src/commands/update.rs`
- [x] T005 Add stub implementations of `download_update`, `install_update`, and `get_platform` commands (returning `todo!()` or placeholder errors) in `src-tauri/src/commands/update.rs` and register them in the specta builder in `src-tauri/src/lib.rs`
- [x] T006 Create `src/ipc/update.ts` with typed IPC wrappers (`downloadUpdate`, `installUpdate`, `getPlatform`) using the specta-generated bindings

**Checkpoint**: Foundation ready — command registration compiles, IPC wrappers exist, user story implementation can now begin

---

## Phase 3: User Story 1 — Seamless Auto-Update Without Privilege Escalation (Priority: P1) 🎯 MVP

**Goal**: Make the Linux update flow use pkexec instead of sudo so updates complete without hanging, regardless of how the app was launched

**Independent Test**: Launch the app from a desktop environment (no terminal), trigger an update, and confirm the download + pkexec install completes without hanging

### Tests for User Story 1 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T007 [P] [US1] Write Rust unit tests for `get_platform` command (returns correct platform string) in `src-tauri/src/commands/update.rs` `#[cfg(test)]` module
- [x] T008 [P] [US1] Write Rust unit tests for `download_update` error paths (invalid signature, download failure, temp dir failure, invalid package format) in `src-tauri/src/commands/update.rs` `#[cfg(test)]` module
- [x] T009 [P] [US1] Write Rust unit tests for `install_update` error paths (pkexec not found, user cancelled exit code 126/127, install failed) in `src-tauri/src/commands/update.rs` `#[cfg(test)]` module
- [x] T010 [P] [US1] Write frontend tests for Linux two-phase update flow (platform branching, downloading → installing → downloaded states) in `src/hooks/useUpdateChecker.test.ts`
- [x] T011 [P] [US1] Write frontend tests for "Downloading..." and "Installing..." UI phases rendering in `src/components/UpdateDialog.test.tsx`

### Implementation for User Story 1

- [x] T012 [US1] Implement `get_platform` command returning `"linux"`, `"macos"`, or `"windows"` via `cfg!(target_os)` in `src-tauri/src/commands/update.rs`
- [x] T013 [US1] Implement `download_update` command: HTTP GET via reqwest, signature verification via minisign-verify + base64 using pubkey from `app.config().plugins.updater.pubkey`, write to tempfile, detect package type via infer, return `DownloadResult` in `src-tauri/src/commands/update.rs`
- [x] T014 [US1] Implement `install_update` command: check `which pkexec`, run `pkexec dpkg -i` or `pkexec rpm -U` via `Command::status()` in `tokio::task::spawn_blocking`, map exit codes 126/127 to `UserCancelled`, handle AppImage file replacement in `src-tauri/src/commands/update.rs`
- [x] T015 [US1] Update `useUpdateChecker.ts` to call `getPlatform()`, branch on Linux vs non-Linux, implement two-phase flow (download_update → install_update) with state transitions (downloading → installing → downloaded) in `src/hooks/useUpdateChecker.ts`
- [x] T016 [US1] Update `UpdateDialog.tsx` to render "Downloading..." spinner for `"downloading"` status and "Installing..." spinner for `"installing"` status in `src/components/UpdateDialog.tsx`

**Checkpoint**: At this point, User Story 1 should be fully functional — Linux update downloads via custom HTTP, verifies signature, and installs via pkexec without any sudo invocation

---

## Phase 4: User Story 2 — Clear Error Feedback on Update Failure (Priority: P2)

**Goal**: Show actionable error messages when the update fails, with retry-install and manual download options, enforced by a 120-second hard timeout

**Independent Test**: Simulate an install failure (e.g., pkexec not found or user cancels polkit prompt) and verify the user sees a specific error message with a retry button and releases page link within 10 seconds

### Tests for User Story 2 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T017 [P] [US2] Write frontend tests for `install-error` state rendering: error messages for each error kind (`pkexec-not-found`, `user-cancelled`, `install-failed`, `timeout`) in `src/components/UpdateDialog.test.tsx`
- [x] T018 [P] [US2] Write frontend tests for "Retry Install" button behavior (calls `installUpdate` with stored path, no re-download) in `src/hooks/useUpdateChecker.test.ts`
- [x] T019 [P] [US2] Write frontend tests for 120-second hard timeout via `Promise.race` (status transitions to `install-error` with timeout kind) in `src/hooks/useUpdateChecker.test.ts`

### Implementation for User Story 2

- [x] T020 [US2] Define `UpdateErrorInfo` type (`kind`, `message`, `releasesUrl`) in `src/ipc/update.ts` and add `installError` and `errorInfo` state fields to the update checker hook in `src/hooks/useUpdateChecker.ts`
- [x] T021 [US2] Implement `install-error` state rendering in `UpdateDialog.tsx`: show error message based on `errorInfo.kind`, display "Retry Install" `<button>` and "Download Manually" `<a>` link to releases page in `src/components/UpdateDialog.tsx`
- [x] T022 [US2] Implement `retryInstall()` function in `useUpdateChecker.ts` that re-calls `installUpdate` with the stored `DownloadResult.path` (transitions install-error → installing → downloaded) in `src/hooks/useUpdateChecker.ts`
- [x] T023 [US2] Implement 120-second frontend hard timeout via `Promise.race` wrapping the entire download+install flow in `src/hooks/useUpdateChecker.ts`
- [x] T024 [US2] Implement 110-second Rust-side timeout via `tokio::time::timeout` around the `Command::status()` call in `install_update`, returning `AppError::Timeout` on expiry in `src-tauri/src/commands/update.rs`
- [x] T025 [US2] Derive releases page URL from the update endpoint in `tauri.conf.json` (strip trailing path from endpoint URL) and expose it via the `get_platform` command or a constant in `src/ipc/update.ts`

**Checkpoint**: At this point, both User Stories work independently — happy-path updates complete via pkexec, and all failure modes show actionable errors with retry and manual download options

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Verify cross-platform safety, run quality gates, and validate end-to-end

- [x] T026 [P] Verify macOS/Windows codepaths are unchanged: confirm all custom update code is gated behind `cfg!(target_os = "linux")` or frontend platform checks in `src-tauri/src/commands/update.rs` and `src/hooks/useUpdateChecker.ts`
- [x] T027 Run full quality gate: `tsc --noEmit && eslint . && cargo clippy -- -D warnings && cargo fmt --check`
- [x] T028 Run full test suite: `pnpm test` and `cargo test -p logfile-analyzer` — all tests pass
- [ ] T029 Run quickstart.md manual verification steps (build release, install .deb/.rpm, test from desktop launch, test pkexec deny, test macOS/Windows no-regression)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) completion
- **User Story 2 (Phase 4)**: Depends on Foundational (Phase 2) completion; also depends on US1 implementation (T012–T016) since error handling builds on the working update flow
- **Polish (Phase 5)**: Depends on both user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — no dependencies on other stories
- **User Story 2 (P2)**: Depends on US1 implementation being complete (T012–T016) since error states, retry, and timeout wrap the two-phase flow introduced by US1

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Rust types/commands before frontend IPC consumers
- Hook logic before UI rendering
- Core implementation before integration

### Parallel Opportunities

- T001 and T002 are sequential (T002 needs deps from T001 to compile)
- T003, T004, T005 can run sequentially (same file dependencies) but T006 is parallel (different language/file)
- All tests within a user story (T007–T011, T017–T019) can run in parallel
- T012 (get_platform) can run in parallel with T013 (download_update) — different functions, same file
- T013 and T014 are independent (download vs install)
- T015 and T016 are sequential (hook logic before UI)

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task T007: "Rust unit tests for get_platform in src-tauri/src/commands/update.rs"
Task T008: "Rust unit tests for download_update error paths in src-tauri/src/commands/update.rs"
Task T009: "Rust unit tests for install_update error paths in src-tauri/src/commands/update.rs"
Task T010: "Frontend tests for Linux two-phase flow in src/hooks/useUpdateChecker.test.ts"
Task T011: "Frontend tests for UI phases in src/components/UpdateDialog.test.tsx"

# Launch independent Rust implementations together:
Task T012: "get_platform command in src-tauri/src/commands/update.rs"
Task T013: "download_update command in src-tauri/src/commands/update.rs"
Task T014: "install_update command in src-tauri/src/commands/update.rs"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (dependencies + module skeleton)
2. Complete Phase 2: Foundational (types, stubs, IPC wrappers)
3. Complete Phase 3: User Story 1 (tests → Rust commands → hook → UI)
4. **STOP and VALIDATE**: Build and test on Linux — update via pkexec works
5. Deploy/demo if ready — core bug is fixed

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP! Linux update works)
3. Add User Story 2 → Test independently → Deploy/Demo (error UX polished)
4. Polish → Quality gates, cross-platform validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- The custom update code only runs on Linux; macOS/Windows continue using `tauri-plugin-updater` plugin flow unchanged
- `reqwest` is already a dev-dependency; promoting it to regular dependency with `rustls-tls` feature
- `infer` is a transitive dependency via the updater plugin; adding as direct dependency for explicit use
