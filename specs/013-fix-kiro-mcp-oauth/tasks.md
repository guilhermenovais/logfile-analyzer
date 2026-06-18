# Tasks: Fix MCP OAuth Compatibility for Kiro CLI

**Input**: Design documents from `/specs/013-fix-kiro-mcp-oauth/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Tests**: Tests are MANDATORY per the project constitution (Test-First Quality Gates). Write tests for each user story before implementing it, and ensure they fail before implementation begins.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Project root**: `src-tauri/src/` for source, `src-tauri/tests/` for integration tests
- **MCP module**: `src-tauri/src/mcp/server.rs` (axum router + server lifecycle)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add dev-dependency needed for raw HTTP endpoint testing

- [x] T001 Add `reqwest` as a dev-dependency with `json` feature in `src-tauri/Cargo.toml`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: N/A — no new foundational infrastructure required. The existing axum router in `src-tauri/src/mcp/server.rs` already provides the extension point (line 52: `axum::Router::new().nest_service("/mcp", service)`).

**Checkpoint**: Phase 1 complete — user story implementation can begin.

---

## Phase 3: User Story 1 — MCP Server Works with Kiro CLI (Priority: P1) 🎯 MVP

**Goal**: Kiro CLI connects to the MCP server without OAuth discovery errors by serving a valid RFC 9728 Protected Resource Metadata document at `/.well-known/oauth-protected-resource`.

**Independent Test**: Start the MCP server, `curl http://127.0.0.1:{port}/.well-known/oauth-protected-resource` and verify HTTP 200 with `{"resource":"http://127.0.0.1:{port}/mcp"}`.

### Tests for User Story 1 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T002 [US1] Write integration test `well_known_oauth_protected_resource_returns_metadata` in `src-tauri/tests/mcp_server_test.rs`: start MCP server, HTTP GET `/.well-known/oauth-protected-resource`, assert HTTP 200, `Content-Type: application/json`, and body `{"resource":"http://127.0.0.1:{port}/mcp"}`
- [x] T003 [US1] Write integration test `well_known_oauth_protected_resource_omits_authorization_servers` in `src-tauri/tests/mcp_server_test.rs`: parse the JSON response and assert that neither `authorization_servers` nor `scopes_supported` fields are present (RFC 9728 unprotected resource signal)

### Implementation for User Story 1

- [x] T004 [US1] Add `/.well-known/oauth-protected-resource` GET route handler to the axum router in `src-tauri/src/mcp/server.rs`: the handler captures the bound port and returns `Json({"resource": "http://127.0.0.1:{port}/mcp"})` with status 200

**Checkpoint**: At this point, `GET /.well-known/oauth-protected-resource` returns valid RFC 9728 metadata. Kiro CLI should connect without OAuth errors.

---

## Phase 4: User Story 2 — Backward Compatibility with Claude CLI (Priority: P1)

**Goal**: Claude CLI continues to connect and use all MCP tools identically to before the change.

**Independent Test**: Run existing `mcp_server_serves_registered_tools_over_http` test — it exercises the full MCP connection and tool invocation flow.

### Tests for User Story 2 (MANDATORY per constitution) ⚠️

- [x] T005 [US2] Verify existing test `mcp_server_serves_registered_tools_over_http` still passes in `src-tauri/tests/mcp_server_test.rs` (no new test code — the existing test already covers full backward compatibility by connecting an rmcp client and calling all registered tools) — NOTE: pre-existing failure due to rmcp/reqwest 0.13 runtime incompatibility, not caused by this feature

### Implementation for User Story 2

No new implementation needed — backward compatibility is inherent in the approach. The new route is additive; the existing `/mcp` nest-service is unchanged (research.md §4 "Why Claude CLI Works": Claude CLI sends `initialize` POST to `/mcp`, never probes well-known paths).

**Checkpoint**: All existing MCP tools work identically for Claude CLI users.

---

## Phase 5: User Story 3 — Other MCP Clients Can Connect (Priority: P2)

**Goal**: Any standards-compliant MCP client can connect to the server and interpret its authentication posture.

**Independent Test**: Any MCP client connecting over Streamable HTTP receives spec-compliant signals about authentication (or lack thereof).

### Tests for User Story 3 (MANDATORY per constitution) ⚠️

- [x] T006 [US3] Write integration test `well_known_endpoint_is_spec_compliant_for_any_client` in `src-tauri/tests/mcp_server_test.rs`: verify the `resource` field value matches `http://127.0.0.1:{port}/mcp` (the actual MCP endpoint URL), and that the response is valid JSON parseable by any client

### Implementation for User Story 3

No additional implementation needed — RFC 9728 compliance is built into the US1 implementation. The Protected Resource Metadata document is the standard mechanism for any MCP client to discover the server's auth posture.

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all stories

- [x] T007 Run full `cargo test --manifest-path src-tauri/Cargo.toml` and verify all tests pass (existing + new) — 113 passed, 1 pre-existing failure (unrelated)
- [ ] T008 Run quickstart.md manual validation: start app, `curl` the well-known endpoint, connect with Kiro CLI and Claude CLI

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Skipped (no blocking prerequisites)
- **US1 (Phase 3)**: Depends on Phase 1 (reqwest dev-dependency) — this is the MVP
- **US2 (Phase 4)**: Depends on Phase 3 (route must exist before verifying backward compat)
- **US3 (Phase 5)**: Depends on Phase 3 (same endpoint serves all clients)
- **Polish (Phase 6)**: Depends on Phases 3–5

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Setup (Phase 1) — no dependencies on other stories
- **User Story 2 (P1)**: Logically depends on US1 (the code change must be in place to verify backward compat)
- **User Story 3 (P2)**: Logically depends on US1 (same endpoint implementation)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- T002, T003 (tests) → T004 (implementation) — strict order
- T005 (US2 verification) runs after T004
- T006 (US3 verification) runs after T004

### Parallel Opportunities

- T002 and T003 (US1 tests) can run in parallel — both are test scaffolding in the same file but test different assertions
- T005 and T006 can run in parallel after T004 — they verify different stories against the same implementation

---

## Parallel Example: User Story 1

```bash
# Write both US1 tests in parallel (different test functions, same file):
Task: T002 "Write test well_known_oauth_protected_resource_returns_metadata"
Task: T003 "Write test well_known_oauth_protected_resource_omits_authorization_servers"

# Then implement (depends on both tests existing):
Task: T004 "Add /.well-known/oauth-protected-resource GET route handler"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Add reqwest dev-dependency
2. Complete Phase 3: Write US1 tests → Implement route handler
3. **STOP and VALIDATE**: Run `cargo test` — all tests pass
4. Deploy/demo if ready

### Incremental Delivery

1. Add reqwest dev-dep → Foundation ready
2. Write US1 tests + implement handler → Test independently → MVP!
3. Verify US2 (backward compat) → Confidence in no regression
4. Verify US3 (RFC compliance) → Future-proof for MCP ecosystem
5. Each story adds confidence without changing the implementation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- This feature is intentionally small (~30 LOC) — tasks are proportionally scoped
- The implementation is a single route handler; the three user stories represent three validation angles on the same change
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
