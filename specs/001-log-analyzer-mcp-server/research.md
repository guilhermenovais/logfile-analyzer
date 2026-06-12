# Phase 0 Research: Log Analyzer Desktop App with MCP Server

All NEEDS CLARIFICATION items from the spec were resolved in its Clarifications
section (transport, alias/path collisions, `surrounding_count` bounds, save
collisions). The constitution pins the core stack (Tauri v2, React 19 + TS
strict, Rust). The decisions below resolve the remaining technical unknowns:
how to serve MCP, how to handle 5GB files within memory limits, search,
timestamp detection, persistence, and frontend rendering/typing.

---

## 1. MCP server transport & SDK

- **Decision**: Use the official Rust MCP SDK `rmcp` with its SSE server
  transport (axum-based), bound to `127.0.0.1` on a fixed/configurable local
  port. The server runs inside the Tauri backend process and is spawned on app
  startup; its tool handlers operate on the shared `AppState`.
- **Rationale**: The clarification mandates "Local network transport (HTTP/SSE
  on localhost)." `rmcp` is the canonical SDK, gives spec-compliant tool
  registration, and its SSE/streamable-HTTP transport matches the requirement.
  Co-locating the server in the backend process lets MCP tools and Tauri
  commands share one in-memory workspace, satisfying FR-029 without an extra IPC
  hop.
- **Alternatives considered**: stdio transport (rejected — the desktop app is
  always-running and agents connect over the network per the clarification, not
  by spawning a child); hand-rolling a JSON-RPC/SSE server (rejected — re-implements
  the protocol, violates Principle III).

## 2. Large-file access — memory-mapped + background line index

- **Decision**: `memmap2`-map each log file read-only. On add, a background
  `spawn_blocking` task scans the mapping once to build a **line-offset index**
  (byte offset of each line start). The viewer streams ranges of lines on demand
  by slicing the mmap between consecutive offsets; nothing copies the whole file.
- **Rationale**: Satisfies FR-034/SC-006 (never load the whole file) and SC-001
  (first lines visible <2s — the viewer reads the head immediately while the full
  index builds in the background). Offsets give O(1) random access for
  get-line-by-index (FR-028) and goto-line (FR-016).
- **Index memory note**: a `Vec<u64>` of offsets costs ~8 bytes/line (~400MB for
  a 5GB file of ~50M short lines). Acceptable on target desktops and far below
  loading the file itself; an on-disk/delta-encoded index is recorded as future
  optimization, not built now (Principle III).
- **Alternatives considered**: read-through `BufReader` with no index (rejected —
  no random access, can't satisfy get-line-by-index efficiently); loading lines
  into a `Vec<String>` (rejected — violates FR-034/SC-006).

## 3. Search — logical operators, regex, parallel scan

- **Decision**: Two search modes. (a) **Logical**: a small hand-written parser
  for quoted terms with `AND`/`OR`/`NOT`(`!`), precedence NOT>AND>OR,
  case-insensitive, compiled to a predicate over a line's bytes. (b) **Regex**:
  the `regex` crate. Both scan the mmap in parallel with `rayon`, splitting on
  line boundaries, collecting matching line indices + content. Results are
  streamed/paginated back via `Channel<T>`.
- **Rationale**: Meets SC-002 (<10s over 5GB, UI responsive) via data-parallel
  scanning off the main thread (Principle VI). The `regex` crate's linear-time
  guarantee avoids catastrophic backtracking from agent/user-supplied patterns
  (Principle II). A tiny bespoke parser for a 3-operator grammar is simpler than
  pulling a parser-combinator dependency (Principle III).
- **Validation**: invalid regex or malformed logical expressions (unbalanced
  quotes/operators) return a clear `AppError` validation variant without
  crashing/hanging (spec Edge Cases, FR — handled at the Rust boundary).
- **Alternatives considered**: full-text index (e.g. tantivy) (rejected —
  heavyweight, files are static snapshots searched ad hoc, indexing cost not
  justified); JS-side search (rejected — violates Principle VI).

## 4. Timestamp detection & time-range search

- **Decision**: On add, sample the first 1000 lines and test each against an
  ordered set of recognized format matchers (ISO-8601 variants incl. `Z`/offset;
  Unix epoch seconds and milliseconds). If one matcher hits ≥70% of sampled
  lines, record it as the file's detected format and parse each line's timestamp
  during the same background pass that builds the offset index, storing an
  `Option<i64>` epoch-ms per line. Below threshold → "no detected format."
- **Rationale**: Directly implements FR-010–FR-013 and SC-003. Reusing the
  single background scan avoids a second full pass. Time-range search filters by
  the precomputed per-line timestamp (no assumption that logs are monotonic, so a
  parallel linear scan is used, not binary search).
- **Memory note**: per-line `i64` adds ~8 bytes/line; combined with the offset
  index this is bounded and only allocated for files with a detected format.
- **Alternatives considered**: parse timestamps lazily per query (rejected —
  FR-011 requires parsing per line on detection, and lazy parsing makes
  time-range search slow); `chrono`/`dateparser` brute force on every format
  (rejected — overkill; a small fixed matcher set per the Assumptions is simpler
  and faster, extensible later).

## 5. Persistence — SQLite via rusqlite

- **Decision**: Store workspace metadata in a single SQLite DB in the OS app-data
  dir using `rusqlite` (bundled SQLite) from the Rust backend. Tables: workspaces
  (incl. the single auto-maintained draft), log-file entries (path, alias,
  detected-format flag), highlights (line index, label, origin), search history.
  Log content is never persisted — only references and analysis state.
- **Rationale**: Highlights and search history are relational, queryable, and can
  grow; SQLite handles this with transactional durability for the unsaved-draft
  auto-recovery (FR-004/FR-005, SC-004). Driving it from Rust keeps all state
  mutation behind the same `AppState` the MCP server uses, and keeps the DB off
  the untrusted frontend (Principle II).
- **Alternatives considered**: `tauri-plugin-sql` (rejected — frontend-driven SQL
  puts data access on the untrusted webview side and bypasses the shared Rust
  state); JSON files via `tauri-plugin-store` (rejected — no transactions/
  indexing, awkward for growing history and concurrent UI+MCP writes).

## 6. Incremental rendering & streaming IPC

- **Decision**: Stream log-line batches and index/search progress from Rust to
  the frontend with the Tauri v2 `Channel<T>` API; the frontend renders the log
  with **TanStack Virtual** (windowed list) requesting line ranges on scroll.
- **Rationale**: FR-014/FR-032/SC-001 require incremental display; `Channel<T>`
  is the constitution-mandated mechanism for large/streamed results and keeps
  individual payloads <100KB (Principle VI). Virtualization renders only visible
  rows, so a multi-GB file's line count never materializes in the DOM.
- **Alternatives considered**: repeated `emit` (rejected — Principle VI forbids
  it for streams); rendering all lines (rejected — impossible at 50M lines).

## 7. Frontend state & typed IPC

- **Decision**: `tauri-specta` + `specta` to generate TS types for commands and
  channel events into `src/bindings/`; thin typed wrappers in `src/ipc/`.
  TanStack Query for IPC read/cache state, Zustand for app-wide client state
  (active workspace, view filters), local `useState` for component state.
- **Rationale**: Principle I (generated shared contracts, no direct `invoke`,
  `Result<T,AppError>`) and the constitution's state-management rules.
- **Alternatives considered**: hand-mirrored types in `src/bindings/` (allowed by
  Principle I but rejected as default — generation prevents drift); Redux
  (rejected — heavier than needed, Principle III).

## 8. UI accessibility & component primitives

- **Decision**: Build modals (save prompt, add-file, alias entry), dropdowns,
  and tabs on **Radix/shadcn-ui**; Tailwind (zero-runtime) for styling; semantic
  elements only; error boundaries at app/feature/list-item levels.
- **Rationale**: Principle V (headless library for complex widgets, keyboard
  access, no runtime CSS-in-JS, resilient to one bad log line).
- **Alternatives considered**: from-scratch dialogs (rejected — Principle V
  forbids); styled-components/Emotion (rejected — runtime CSS-in-JS banned).

---

## Resolved unknowns summary

| Unknown | Resolution |
|---------|------------|
| MCP transport/SDK | `rmcp` SSE server on `127.0.0.1`, in-process, over shared `AppState` |
| 5GB file access | `memmap2` + background `Vec<u64>` line-offset index |
| Search performance | `rayon`-parallel scan; `regex` crate; bespoke logical parser |
| Timestamp detection | first-1000 sample, ≥70% matcher, per-line `Option<i64>` epoch-ms |
| Persistence | `rusqlite` SQLite in app-data dir, Rust-side, behind `AppState` |
| Incremental UI | `Channel<T>` streaming + TanStack Virtual |
| Typed IPC | `tauri-specta` generated bindings, wrappers in `src/ipc/` |
| UI primitives | Radix/shadcn-ui + Tailwind, layered error boundaries |
