import type { ReactNode } from "react";
import { Settings } from "lucide-react";

export interface AppToolbarProps {
  children?: ReactNode;
  onOpenSettings: () => void;
}

/**
 * Slim app-wide toolbar with a Settings entry point reachable from any view
 * (FR-012).
 */
export function AppToolbar({ children, onOpenSettings }: AppToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-2 border-b p-2">
      <div className="flex flex-1 items-center gap-2">{children}</div>
      <button
        type="button"
        aria-label="Settings"
        onClick={onOpenSettings}
        className="rounded p-1 hover:bg-accent"
      >
        <Settings size={16} />
      </button>
    </div>
  );
}
