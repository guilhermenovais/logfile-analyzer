import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export interface MenuBarProps {
  /** Starts a new draft workspace, prompting to save first if dirty (FR-002/FR-003). */
  onNewWorkspace: () => void;
  /** Opens the saved-workspaces browser, prompting to save first if dirty (FR-002/FR-004). */
  onOpenSavedWorkspaces: () => void;
  /** Saves the current workspace, prompting for an alias if unnamed (FR-002/FR-005). */
  onSaveWorkspace: () => void;
  /** Opens the settings dialog directly (FR-006). */
  onOpenSettings: () => void;
  /** Opens the About dialog (FR-008/FR-009). */
  onOpenAbout: () => void;
}

const triggerClassName =
  "rounded px-2 py-1 text-sm hover:bg-accent focus-visible:bg-accent outline-none";

const contentClassName =
  "min-w-32 rounded border bg-background p-1 text-sm shadow-lg";

const itemClassName =
  "block w-full cursor-default rounded px-2 py-1 text-left outline-none hover:bg-accent focus:bg-accent";

/**
 * Top-level app menu bar: **Workspace** (New/Open/Save), **Options** (opens
 * settings directly, no sub-items), and **Help** (About) (FR-001-FR-009).
 */
export function MenuBar({
  onNewWorkspace,
  onOpenSavedWorkspaces,
  onSaveWorkspace,
  onOpenSettings,
  onOpenAbout,
}: MenuBarProps) {
  return (
    <nav className="flex items-center gap-1 border-b p-1">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className={triggerClassName}>
          Workspace
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={contentClassName} align="start">
            <DropdownMenu.Item className={itemClassName} onSelect={onNewWorkspace}>
              New
            </DropdownMenu.Item>
            <DropdownMenu.Item className={itemClassName} onSelect={onOpenSavedWorkspaces}>
              Open
            </DropdownMenu.Item>
            <DropdownMenu.Item className={itemClassName} onSelect={onSaveWorkspace}>
              Save
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <button type="button" className={triggerClassName} onClick={onOpenSettings}>
        Options
      </button>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger className={triggerClassName}>
          Help
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={contentClassName} align="start">
            <DropdownMenu.Item className={itemClassName} onSelect={onOpenAbout}>
              About
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </nav>
  );
}
