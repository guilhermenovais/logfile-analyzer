# Tasks: GitHub Actions Release Workflow

**Input**: Design documents from `/specs/011-github-actions-release/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not applicable for this feature. Workflow files cannot be unit tested (confirmed in plan.md constitution check). Validation is manual: push to main and verify the release appears with correct artifacts (see quickstart.md).

**Organization**: Tasks are grouped by user story. US1 (Automatic Release) and US3 (Cross-Platform Artifacts) are co-implemented since the build matrix inherently delivers both stories. US2 (Release Overwrite) is a distinct phase adding overwrite behavior to the release job.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Create the workflow file with top-level configuration

- [x] T001 Create `.github/workflows/release.yml` with workflow name (`Release`), push trigger filtered to `main` branch, and concurrency group (`release` with `cancel-in-progress: true`)

---

## Phase 2: Foundational (Version Extraction)

**Purpose**: Implement the `get-version` job that all downstream jobs depend on

**CRITICAL**: Both the build and release jobs depend on this version output

- [x] T002 Implement `get-version` job in `.github/workflows/release.yml`: run on `ubuntu-latest`, checkout repo, extract `.version` from `src-tauri/tauri.conf.json` via `jq -r .version`, set as job output `version`

**Checkpoint**: Version extraction job is defined — build and release jobs can now reference the version output

---

## Phase 3: User Story 1 + User Story 3 — Automatic Release with Cross-Platform Builds (Priority: P1)

**Goal**: When code is pushed to main, automatically build the Tauri app for all three platforms and publish a GitHub release with all artifacts

**Independent Test**: Push a commit to main, wait for workflow completion (~10-15 min), verify a GitHub release exists with the correct version name and downloadable artifacts for Windows (.msi, .exe), macOS (.dmg universal), and Linux (.deb, .AppImage)

### Implementation

- [x] T003 [US1] [US3] Define `build` job matrix in `.github/workflows/release.yml`: depend on `get-version`, set `fail-fast: true`, define matrix with three platform entries — `ubuntu-22.04` (args: empty), `macos-latest` (args: `--target universal-apple-darwin`), `windows-latest` (args: empty)
- [x] T004 [US1] [US3] Implement `build` job steps in `.github/workflows/release.yml`: checkout, `actions/setup-node@v4` (LTS), `pnpm/action-setup@v4`, `dtolnay/rust-toolchain@stable` with conditional macOS targets (`aarch64-apple-darwin`, `x86_64-apple-darwin`), Linux system deps via `apt-get` (`libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`), `pnpm install`, `tauri-apps/tauri-action@v0` with matrix args (build only, no release), `actions/upload-artifact@v4` for build output
- [x] T005 [US1] Implement `release` job in `.github/workflows/release.yml`: depend on `get-version` and `build`, run on `ubuntu-latest`, set `permissions: contents: write`, download all artifacts via `actions/download-artifact@v4` with merge-multiple, create GitHub release via `softprops/action-gh-release@v2` with `tag_name: v${{ version }}`, `name: v${{ version }}`, `generate_release_notes: true`, and glob pattern for artifact files

**Checkpoint**: Pushing to main triggers a full build-and-release pipeline. All three platform artifacts appear in the GitHub release. US1 and US3 are delivered.

---

## Phase 4: User Story 2 — Release Overwrite for Existing Versions (Priority: P2)

**Goal**: When a push to main uses the same version as an existing release, the old release is cleanly replaced with new artifacts

**Independent Test**: Push two consecutive commits to main without changing the version in `src-tauri/tauri.conf.json`. Verify the release is updated with artifacts from the second build (check timestamps or commit references in auto-generated notes).

### Implementation

- [x] T006 [US2] Add release overwrite step to `release` job in `.github/workflows/release.yml`: before the `softprops/action-gh-release` step, add a step using `gh release delete v${{ version }} --cleanup-tag --yes` with `continue-on-error: true` (handles first-time releases where no prior release exists) and `env: GH_TOKEN: ${{ github.token }}`

**Checkpoint**: Overwrite behavior works — same-version pushes cleanly replace the prior release. US2 is delivered.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and edge case review

- [x] T007 Validate complete `.github/workflows/release.yml`: verify YAML syntax is valid, job dependency chain is correct (`get-version` → `build` → `release`), `permissions` block is scoped to `release` job only, concurrency group is at workflow level, and all action versions match plan.md pinned versions (`tauri-action@v0`, `action-gh-release@v2`, `upload-artifact@v4`, `download-artifact@v4`)
- [x] T008 Run quickstart.md validation checklist against `.github/workflows/release.yml` to confirm all design decisions are implemented

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — creates the version extraction job
- **US1 + US3 (Phase 3)**: Depends on Phase 2 — build and release jobs reference version output
- **US2 (Phase 4)**: Depends on Phase 3 — adds overwrite step to existing release job
- **Polish (Phase 5)**: Depends on Phase 4 — validates the complete workflow

### User Story Dependencies

- **US1 + US3 (P1)**: Depend on Foundational (Phase 2). These stories are co-implemented — the build matrix delivers cross-platform artifacts, the release job publishes them.
- **US2 (P2)**: Depends on US1/US3 (Phase 3) — the release job must exist before overwrite logic can be added to it.

### Within Each Phase

- T003 before T004 (matrix definition before build steps)
- T004 before T005 (build job before release job that downloads its artifacts)
- T005 before T006 (release job must exist before adding overwrite step)

### Parallel Opportunities

- This feature produces a single file (`.github/workflows/release.yml`), so parallelism across tasks is limited
- T007 and T008 can run in parallel (validation vs. checklist review)

---

## Parallel Example: Phase 5

```bash
# Validation tasks can run in parallel:
Task: "Validate complete .github/workflows/release.yml"
Task: "Run quickstart.md validation checklist"
```

---

## Implementation Strategy

### MVP First (US1 + US3)

1. Complete Phase 1: Setup — scaffold workflow file
2. Complete Phase 2: Foundational — version extraction job
3. Complete Phase 3: US1 + US3 — build matrix + release job
4. **STOP and VALIDATE**: Push to main, verify release appears with all platform artifacts
5. If working: proceed to Phase 4 for overwrite behavior

### Incremental Delivery

1. Setup + Foundational → Workflow file exists with trigger and version job
2. Add US1 + US3 → Full build-and-release pipeline (MVP!)
3. Add US2 → Overwrite behavior for same-version pushes
4. Polish → Validate everything matches spec

---

## Notes

- Single file feature: all tasks modify `.github/workflows/release.yml`
- No application code changes — this is purely CI/CD
- No automated tests — workflow validation is manual (push to main)
- Total estimated YAML: ~100 lines
- All research decisions (R-001 through R-009) are encoded in the task descriptions
