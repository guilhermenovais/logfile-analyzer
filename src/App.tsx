import { useState } from "react";
import { McpSetupGate } from "@/app/McpSetupGate";
import { AboutDialog } from "@/components/AboutDialog";
import { MenuBar } from "@/components/MenuBar";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useWorkspaceActions } from "@/hooks/useWorkspaceActions";
import { WorkspacePage } from "@/pages/WorkspacePage";
import "./App.css";

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const { handleNewWorkspace, handleOpenSavedWorkspaces, handleSave } =
    useWorkspaceActions();

  return (
    <McpSetupGate onOpenSettings={() => setSettingsOpen(true)}>
      <div className="flex h-screen flex-col">
        <MenuBar
          onNewWorkspace={handleNewWorkspace}
          onOpenSavedWorkspaces={handleOpenSavedWorkspaces}
          onSaveWorkspace={handleSave}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenAbout={() => setAboutOpen(true)}
        />
        <div className="flex-1 overflow-hidden">
          <WorkspacePage />
        </div>
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </McpSetupGate>
  );
}

export default App;
