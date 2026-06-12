<!--
Sync Impact Report
- Version change: [TEMPLATE] -> 1.0.0 (initial ratification)
- Modified principles: n/a (first concrete version)
- Added sections:
  - Core Principles I-VI (Type-Safe IPC & Shared Contracts, Security & Least
    Privilege, Simplicity & Minimal Footprint, Test-First Quality Gates,
    Accessible Native-Feeling Desktop UI, Performance for Large Log Volumes)
  - Technology Stack & Project Structure
  - Development Workflow & Release Discipline
  - Governance
- Removed sections: none (template placeholders replaced)
- Templates requiring updates:
  - .specify/templates/plan-template.md (no change needed - Constitution
    Check gate is generic and reads this file dynamically)
  - .specify/templates/spec-template.md (no change needed - principles do
    not add new mandatory spec sections)
  - .specify/templates/tasks-template.md (updated - tests are now mandatory
    per Principle IV, "OPTIONAL" language removed)
  - .specify/templates/commands/*.md (none present - skipped)
- Follow-up TODOs: none
-->

# Logfile Analyzer Constitution

## Core Principles

### I. Type-Safe IPC & Shared Contracts (NON-NEGOTIABLE)

TypeScript strict mode is always on; `any` is forbidden unless interfacing
with an untyped third-party library, and then only with a one-line
eslint-disable justification. Every Tauri command that can fail returns
`Result<T, AppError>` where `AppError: Serialize`; `.unwrap()`/`.expect()`
are forbidden in command handlers. Every `invoke()` call MUST be wrapped in
a typed function under `src/ipc/` - components never call `invoke()`
directly. Types shared across the IPC boundary are generated (specta/ts-rs)
or, if hand-mirrored, live in `src/bindings/` and are audited on every PR
that touches a command.

Rationale: the IPC boundary is where type drift and unhandled Rust errors
turn into opaque frontend crashes. Enforcing typed wrappers and serializable
errors prevents both failure classes structurally instead of by review.

### II. Security & Least Privilege (NON-NEGOTIABLE)

Tauri v2 capabilities grant only the permissions a window or command
actually needs - no blanket `allow-*` entries "just in case." `tauri.conf.json`
carries a strict CSP with no `unsafe-inline`/`unsafe-eval`. All command
inputs - including file paths and log content arriving through the MCP
server - are validated and canonicalized in Rust; the frontend and any MCP
client are treated as untrusted. No secrets, tokens, or API keys live in the
frontend bundle or `localStorage`; sensitive data goes through the OS
keychain (`keyring`/`stronghold`).

Rationale: this app has two untrusted-input surfaces - the webview and the
MCP transport it exposes. Both must be defended at the Rust boundary, since
both are attacker-reachable the moment either side is compromised.

### III. Simplicity & Minimal Footprint

Write the simplest code that solves the stated problem; no speculative
abstractions or "might need later" scaffolding. Keep files under 200 lines
(TS/TSX) and 300 lines (Rust), splitting by responsibility when exceeded.
Prefer the lighter dependency for equivalent functionality - check
bundlephobia/`cargo bloat` before adding one - and remove unused
dependencies and dead code immediately rather than commenting it out.
Refactors are explicitly scoped, requested, and covered by tests before they
start.

Rationale: a desktop app pays for every dependency and abstraction twice -
once in bundle size users download, and once in the maintenance cost of
code nobody asked for.

### IV. Test-First Quality Gates (NON-NEGOTIABLE)

Every project must have tests; `passWithNoTests: true` (or equivalent) is a
red flag, not a default. New frontend behavior is covered by Vitest +
React Testing Library with mocked Tauri IPC (`@tauri-apps/api/mocks`). New
backend commands are covered by `cargo test`, using Tauri's mock runtime for
command integration tests, including both success and error paths. A task is
not complete until `tsc --noEmit`, `eslint .`, `cargo clippy -- -D warnings`,
`cargo fmt --check`, the frontend test suite, and `cargo test` all pass.

Rationale: IPC contract breaks and log-parsing regressions are expensive to
find after a desktop release ships, since users cannot easily roll back.
Catching them locally and in CI is the only cheap point to catch them.

### V. Accessible, Native-Feeling Desktop UI

Use semantic HTML and ensure every interactive element is keyboard
accessible; `<div onClick>` is forbidden in favor of `<button>`/`<a>`. Build
modals, dropdowns, tabs, and other complex interactive components on a
headless UI library (Radix, Headless UI, React Aria, or shadcn/ui) rather
than from scratch. Respect the OS light/dark theme and match platform
conventions for window chrome and spacing. Error boundaries exist at the
app, feature, and list-item levels so a single bad log entry cannot crash
the whole view, and users never see raw errors or stack traces.

Rationale: this is an incident-response tool. It must stay usable
keyboard-only or with a screen reader under stress, and a single malformed
log line must never take down the session.

### VI. Performance for Large Log Volumes

Log parsing, filtering, and search run in Rust, not JavaScript - that is a
primary reason this is a Tauri app. Large or streamed results (log lines,
MCP responses, progress updates) use the Tauri v2 `Channel<T>` API, not
repeated `emit` calls or single giant IPC payloads; keep individual IPC
payloads under roughly 100KB, paginating or streaming beyond that. Blocking
I/O and CPU-heavy parsing run via `tokio::task::spawn_blocking` or the async
runtime - never on the Tauri main thread, and never `std::thread::sleep` in
an async command.

Rationale: log files are large and effectively unbounded. The architecture
must scale to multi-GB files without freezing the UI or saturating the IPC
channel.

## Technology Stack & Project Structure

- Stack: Tauri v2, React 19 + TypeScript (`strict: true`) + Vite frontend,
  Rust (stable, pinned via `rust-toolchain.toml`) backend.
- Server/IPC data state uses TanStack Query or SWR - never copied into
  `useState`. App-wide client state uses Zustand. Local component state uses
  `useState`/`useReducer`.
- Styling follows whichever zero-runtime approach the project adopts
  (Tailwind or CSS Modules); no runtime CSS-in-JS (styled-components,
  Emotion).
- Project layout follows: `src/{app,pages,components,hooks,ipc,bindings,lib}`
  on the frontend and `src-tauri/src/{commands,error.rs,state.rs}` on the
  backend, with one component/hook/Rust module per file.
- New Tauri commands use `snake_case` in Rust and are invoked as `camelCase`
  from JS (Tauri's default conversion); each new command requires a matching
  capability entry in `src-tauri/capabilities/`.
- Prefer official `tauri-apps/plugins-workspace` plugins over hand-rolled
  equivalents; install only the plugins actually needed, pinned to the
  project's Tauri major version.

## Development Workflow & Release Discipline

- CI MUST run: `tsc --noEmit`, `eslint .`, the frontend test suite,
  `cargo clippy -- -D warnings`, `cargo fmt --check`, `cargo test`, and a
  release `tauri build` smoke test across the supported platform matrix.
- CI/CD configuration files (`.github/workflows/`) are never modified
  without explicit user approval, and never gain `--no-verify`, `--force`,
  or other skip flags.
- If the updater is enabled, releases MUST be signed; the private signing
  key is a CI secret and is never committed.
- One major dependency bump per PR; lockfiles (`package-lock.json` /
  `pnpm-lock.yaml`, `Cargo.lock`) are committed.
- When working on an existing area of the codebase, follow its existing
  conventions even where they differ from this constitution's defaults -
  consistency within a feature beats theoretical best practice - and flag
  the inconsistency to the user rather than silently fixing it.

## Governance

This constitution supersedes ad-hoc conventions and prior informal
practice. `CLAUDE.md` and other agent guidance files provide supplementary,
day-to-day implementation detail and MUST NOT contradict this document; where
they conflict, this constitution wins and the guidance file should be
corrected.

Amendments require: a stated rationale, a version bump following semantic
versioning (MAJOR for backward-incompatible principle removals or
redefinitions, MINOR for new principles or materially expanded sections,
PATCH for clarifications and wording), and an update to the "Last Amended"
date below. Every amendment updates this file's Sync Impact Report comment.

Every plan produced by `/speckit-plan` MUST pass the Constitution Check gate
against the principles above before Phase 0 research begins, and again after
Phase 1 design. Any violation that cannot be avoided MUST be recorded in that
plan's Complexity Tracking table with the specific principle, the reason it
is needed, and why a simpler alternative was rejected. Reviews verify
compliance using the per-task checklist (typecheck, lint, tests, clippy,
fmt) implied by Principle IV before any task is marked complete.

**Version**: 1.0.0 | **Ratified**: 2026-06-12 | **Last Amended**: 2026-06-12
