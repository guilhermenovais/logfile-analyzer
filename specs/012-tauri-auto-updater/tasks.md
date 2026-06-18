# Tasks: Tauri Auto-Updater

**Input**: Design documents from `/specs/012-tauri-auto-updater/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Tests are MANDATORY per the project constitution (Test-First Quality Gates). Write tests for each user story before implementing it, and ensure they fail before implementation begins.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies, generate signing keys, and configure Tauri plugins for the updater and process relaunch.

- [x] T001 Install frontend dependencies: `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process`
- [x] T002 Install backend dependencies: `tauri-plugin-updater` and `tauri-plugin-process` in src-tauri/Cargo.toml
- [ ] T003 Generate signing key pair via `tauri signer generate` and document public key for configuration

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core Tauri configuration that MUST be complete before ANY user story can be implemented. These changes enable the updater plugin at the platform level.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Configure updater in src-tauri/tauri.conf.json: set `bundle.createUpdaterArtifacts` to `true`, add `plugins.updater` with endpoint URL `https://github.com/guilhermenovais/logfile-analyzer/releases/latest/download/latest.json` and public key
- [x] T005 Register `tauri_plugin_updater` and `tauri_plugin_process` plugins in src-tauri/src/lib.rs
- [x] T006 Add `updater:default` and `process:allow-restart` permissions to src-tauri/capabilities/default.json

**Checkpoint**: Foundation ready — the Tauri app can now check for updates at the plugin level. User story implementation can begin.

---

## Phase 3: User Story 1 — Automatic Update Notification (Priority: P1) 🎯 MVP

**Goal**: The application detects available updates from GitHub Releases on startup and notifies the user with the available version number. Offline/error scenarios are handled silently.

**Independent Test**: Publish a GitHub Release with a higher version number than the running app. Launch the app and verify a notification dialog appears showing the new version. With no update or no connectivity, verify no notification appears and the app operates normally.

### Tests for User Story 1 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T007 [P] [US1] Write tests for `useUpdateChecker` hook in src/hooks/useUpdateChecker.test.ts: test states (checking, available, not-available, error), verify check triggers on mount, verify error state does not surface to user
- [x] T008 [P] [US1] Write tests for `UpdateDialog` component in src/components/UpdateDialog.test.tsx: test renders version number when update available, test renders nothing when no update, test dismiss button behavior

### Implementation for User Story 1

- [x] T009 [US1] Create `useUpdateChecker` hook in src/hooks/useUpdateChecker.ts: call `check()` from `@tauri-apps/plugin-updater` on mount, expose update state (idle, checking, available, not-available, error) and the update object
- [x] T010 [US1] Create `UpdateDialog` component in src/components/UpdateDialog.tsx: Radix Dialog modal showing available version number with "Update Now" and "Later" buttons, wired to `useUpdateChecker` hook
- [x] T011 [US1] Integrate `UpdateDialog` into the app root (src/App.tsx) so it renders on startup

**Checkpoint**: At this point, the app detects updates on launch and shows a notification modal. Users can dismiss or accept. US1 is fully functional and testable independently.

---

## Phase 4: User Story 2 — Download and Install Update (Priority: P2)

**Goal**: When the user accepts the update notification, the app downloads the update with visible progress and prompts to restart to apply it.

**Independent Test**: From the update notification dialog, click "Update Now". Verify download progress is shown. After download completes, verify a restart prompt appears. Click restart and verify the app relaunches at the new version.

### Tests for User Story 2 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T012 [P] [US2] Write tests for download progress state in src/hooks/useUpdateChecker.test.ts: test downloading state with progress tracking (contentLength, downloaded bytes), test download-complete triggers ready-to-restart state, test download-error state
- [x] T013 [P] [US2] Write tests for download progress UI in src/components/UpdateDialog.test.tsx: test progress bar renders during download, test restart prompt renders after download completes, test error message renders on download failure, test "Later" during download dismisses dialog

### Implementation for User Story 2

- [x] T014 [US2] Extend `useUpdateChecker` hook in src/hooks/useUpdateChecker.ts: add `startDownload` function calling `update.downloadAndInstall()` with `onProgress` callback, track download states (downloading, downloaded, error), track progress (contentLength, chunkLength accumulation)
- [x] T015 [US2] Extend `UpdateDialog` component in src/components/UpdateDialog.tsx: add download progress bar, restart prompt with "Restart Now" button calling `relaunch()` from `@tauri-apps/plugin-process`, error state display, "Later" button to dismiss at any stage
- [x] T016 [US2] Wire "Update Now" button in `UpdateDialog` to `startDownload` and "Restart Now" button to `relaunch()`

**Checkpoint**: At this point, Users can detect, download, and install updates with full progress visibility. US1 and US2 are both functional and testable independently.

---

## Phase 5: User Story 3 — Update with Signature Verification (Priority: P3)

**Goal**: All updates are verified for authenticity before installation. Invalid or missing signatures cause the update to be rejected with a user-facing error message.

**Independent Test**: Attempt to install an update with an invalid or missing signature (e.g., tampered `latest.json`). Verify the app rejects the update and displays a verification error. Verify a valid signed update proceeds normally.

### Tests for User Story 3 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T017 [P] [US3] Write tests for signature verification error handling in src/hooks/useUpdateChecker.test.ts: test that signature verification failure during download produces a distinct error state (`signature-error`), test error message content distinguishes signature failure from network failure
- [x] T018 [P] [US3] Write tests for signature error UI in src/components/UpdateDialog.test.tsx: test that signature verification error renders a specific message ("Update could not be verified") distinct from generic download errors

### Implementation for User Story 3

- [x] T019 [US3] Extend error handling in `useUpdateChecker` hook in src/hooks/useUpdateChecker.ts: catch and classify signature verification errors from `downloadAndInstall()` separately from network errors, expose error type (network vs. signature) in state
- [x] T020 [US3] Extend `UpdateDialog` component in src/components/UpdateDialog.tsx: display distinct error message for signature verification failures vs. network/download errors

**Checkpoint**: All user stories are now independently functional. Signature verification errors are surfaced to the user with clear messaging.

---

## Phase 6: Release Workflow (CI/CD)

**Purpose**: Modify the GitHub Actions release workflow to use `tauri-action` with `tagName` for automatic updater artifact generation (`latest.json` + `.sig` files).

**⚠️ CI/CD Gate**: Per constitution, CI/CD configuration files are never modified without explicit user approval. Flag for approval before applying changes.

- [x] T021 Modify release workflow in .github/workflows/release.yml: replace current build and release jobs with `tauri-action` using `tagName`, configure signing secrets (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`), ensure `latest.json` and `.sig` files are uploaded to the GitHub Release
- [ ] T022 Add `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as GitHub Actions repository secrets (manual step — document instructions)

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and final validation

- [x] T023 [P] Run all quality gates: `pnpm tsc --noEmit`, `pnpm eslint`, `cargo clippy`, `cargo fmt --check`, `pnpm vitest run`, `cargo test`
- [ ] T024 Run quickstart.md validation: verify full end-to-end update flow per specs/012-tauri-auto-updater/quickstart.md steps 7-8
- [ ] T025 Verify update check does not degrade app startup performance (SC-001: within 30 seconds)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phases 3-5)**: All depend on Foundational phase completion
  - US1 (Phase 3): No dependencies on other stories
  - US2 (Phase 4): Extends US1 components (hook and dialog) but does not break US1
  - US3 (Phase 5): Extends US2 error handling but does not break US1 or US2
- **Release Workflow (Phase 6)**: Can proceed in parallel with user stories (independent files)
- **Polish (Phase 7)**: Depends on all user stories and workflow being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — No dependencies on other stories
- **User Story 2 (P2)**: Extends US1 hook and dialog — should follow US1 for clean incremental development
- **User Story 3 (P3)**: Extends US2 error handling — should follow US2 for clean incremental development

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Hook logic before component UI
- Component before app integration
- Core implementation before integration

### Parallel Opportunities

- T001 and T002 (Setup installs) can run in parallel
- T007 and T008 (US1 tests) can run in parallel
- T012 and T013 (US2 tests) can run in parallel
- T017 and T018 (US3 tests) can run in parallel
- T021 (Release workflow) can run in parallel with user story phases
- T023 quality gate checks can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Write tests for useUpdateChecker hook in src/components/useUpdateChecker.test.ts"
Task: "Write tests for UpdateDialog component in src/components/UpdateDialog.test.tsx"

# Then implement sequentially:
Task: "Create useUpdateChecker hook in src/components/useUpdateChecker.ts"
Task: "Create UpdateDialog component in src/components/UpdateDialog.tsx"
Task: "Integrate UpdateDialog into app root"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (install dependencies, generate keys)
2. Complete Phase 2: Foundational (configure tauri.conf.json, register plugins, add permissions)
3. Complete Phase 3: User Story 1 (update detection + notification)
4. **STOP and VALIDATE**: Test US1 independently — publish a release and verify notification appears
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Demo (MVP: users see update notifications)
3. Add User Story 2 → Test independently → Demo (users can download and install updates)
4. Add User Story 3 → Test independently → Demo (signature verification with clear error messages)
5. Complete Release Workflow → Full CI/CD pipeline with signed updates
6. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Signature verification (US3) is largely handled by the Tauri plugin; our tasks focus on error classification and user-facing messaging
