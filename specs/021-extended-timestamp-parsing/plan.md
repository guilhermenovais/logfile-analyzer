# Implementation Plan: Extended Timestamp Format Parsing

**Branch**: `021-extended-timestamp-parsing` | **Date**: 2026-06-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/021-extended-timestamp-parsing/spec.md`

## Summary

Extend the Rust timestamp detection and parsing engine (`src-tauri/src/logfile/timestamp.rs`) to recognize four additional log timestamp formats — day-first European (`DD-MM-YYYY HH:MM:SS`), BSD/syslog (`MMM DD HH:MM:SS`), Apache/Nginx combined log (`[DD/Mon/YYYY:HH:MM:SS ±ZZZZ]`), and US-style month-first (`MM/DD/YYYY HH:MM:SS`) — while preserving all existing format behavior. The `TimestampFormat` enum, `CANDIDATE_FORMATS` ordering, `extract_timestamp`, and `detect_and_parse` are the primary change surfaces; the frontend is unaffected since it only observes `has_timestamp_format: bool`.

## Technical Context

**Language/Version**: Rust (stable, pinned via `rust-toolchain.toml`), TypeScript strict mode  
**Primary Dependencies**: `chrono 0.4`, `memmap2 0.9`, `regex 1.12`, Tauri v2, specta  
**Storage**: SQLite via rusqlite (persists `has_timestamp_format` per file entry)  
**Testing**: `cargo test` (Rust), Vitest (frontend — no frontend changes expected)  
**Target Platform**: Linux, macOS, Windows (Tauri desktop)  
**Project Type**: Desktop app (Tauri v2)  
**Performance Goals**: Must handle multi-GB log files; timestamp detection runs on a blocking thread over a 1000-line sample, parsing runs per-line  
**Constraints**: Single-format-per-file model; detection via 1000-line sample at ≥70% match ratio threshold  

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Type-Safe IPC & Shared Contracts | PASS | New `TimestampFormat` variants added to the `specta::Type`-derived enum; no new IPC commands. Frontend only sees `has_timestamp_format: bool` — no IPC contract change. |
| II. Security & Least Privilege | PASS | No new capabilities, permissions, or input surfaces. Timestamp parsing operates on already-opened mmap'd files. |
| III. Simplicity & Minimal Footprint | PASS | Each new format is a new variant + parser function ≤30 lines. No new dependencies. Regex used only for Apache mid-line search. |
| IV. Test-First Quality Gates | PASS | Each new format will have unit tests for parsing and detection. Existing tests are preserved as regression coverage. |
| V. Accessible, Native-Feeling Desktop UI | N/A | No UI changes. |
| VI. Performance for Large Log Volumes | PASS | Detection samples 1000 lines (unchanged). Per-line parsing adds constant-time branches. No allocation changes. |

No violations — Complexity Tracking table is empty.

## Project Structure

### Documentation (this feature)

```text
specs/021-extended-timestamp-parsing/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src-tauri/src/
├── state.rs                      # TimestampFormat enum (add 4 new variants)
├── logfile/
│   ├── timestamp.rs              # Core changes: new parsers, updated CANDIDATE_FORMATS
│   ├── offset.rs                 # Extended to detect offsets from Apache format
│   └── mod.rs                    # No change
├── commands/
│   └── files.rs                  # Pass file mtime to detect_and_parse for syslog year inference
└── ...

src-tauri/tests/
├── files_test.rs                 # Integration tests with sample log files
└── ...
```

**Structure Decision**: Pure backend (Rust) change within the existing `logfile/timestamp.rs` module and its callers. No new modules needed; new parsers are private functions in `timestamp.rs`. The `TimestampFormat` enum in `state.rs` gains four new variants.

## Complexity Tracking

> No violations — table is empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
