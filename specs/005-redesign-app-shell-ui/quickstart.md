# Quickstart: Redesign App Shell UI

## Develop

```bash
pnpm install
pnpm tauri dev
```

## Try the redesigned shell (manual)

1. **US1 — Menu bar (P1)**:
   - Look at the top bar: it shows exactly three entries — **Workspace**,
     **Options**, **Help** — and no gear/cog icon anywhere (FR-001/FR-007/SC-002).
   - Open **Workspace** → confirm **New**, **Open**, **Save** are listed
     (FR-002).
     - **New** with no unsaved changes → creates a fresh empty workspace
       immediately. With unsaved changes → shows the existing save/discard
       prompt first (FR-003).
     - **Open** → shows the saved-workspaces browser (same as the old
       "Saved" control) (FR-004).
     - **Save** on an unnamed workspace → shows the existing save-naming
       prompt. Save on an already-named workspace (e.g. after a rename, or a
       previously-saved workspace) → saves immediately under its current name,
       no prompt (FR-005/acceptance scenario 5).
   - Open **Options** → the settings dialog opens directly, with no submenu
     (FR-006).
   - Open **Help** → confirm **About** is listed; selecting it opens a dialog
     showing the app's current version (FR-008/FR-009/SC-004).

2. **US2 — Workspace sidebar (P2)**:
   - With a workspace open, confirm its name appears at the top of the
     sidebar (FR-010).
   - Click the name → it becomes an editable text field. Type a new name and
     press Enter (or click away) → the new name is saved and immediately
     reflected in the sidebar, the saved-workspaces list (if this workspace
     is saved), and the window title if applicable (FR-011/FR-012/SC-003).
   - Click the name, type a new value, press **Escape** → the original name
     is restored, nothing is saved (acceptance scenario 4).
   - Try renaming to an empty/whitespace-only value → rejected, previous name
     kept (FR-013/Edge Cases).
   - Below the name, confirm an **Add file** button is visible and opens the
     existing add-file dialog (FR-014).
   - Below that, confirm the file list has improved spacing/alignment while
     still showing each file's alias, availability warning (⚠ for files moved
     /deleted), indexing-in-progress indicator, and remove (×) action
     (FR-015).
   - Remove all files from the workspace → confirm an empty-state message
     appears in the list area (FR-016).

3. **US3 — Search row heights (P3)**:
   - Open a file and look at the search row: the type select
     (Logical/Regex), the query input, the **Search** button, and the history
     (clock) icon should all render at the same height and be vertically
     aligned (FR-017/acceptance scenarios 1-2).
   - Resize the window to narrow, medium, and wide — confirm the controls
     keep the same shared height and alignment at each width
     (acceptance scenario 3/SC-005).

## Quality gates (Principle IV)

```bash
# Frontend
pnpm exec tsc --noEmit
pnpm exec eslint .
pnpm test

# Backend (from src-tauri/)
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```
