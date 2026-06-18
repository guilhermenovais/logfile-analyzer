import { useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { McpSetupGate } from "@/app/McpSetupGate";
import { AboutDialog } from "@/components/AboutDialog";
import { MenuBar } from "@/components/MenuBar";
import { SettingsDialog } from "@/components/SettingsDialog";
import { UpdateDialog } from "@/components/UpdateDialog";
import { useUpdateChecker } from "@/hooks/useUpdateChecker";
import { useWorkspaceActions } from "@/hooks/useWorkspaceActions";
import { WorkspacePage } from "@/pages/WorkspacePage";
import "./App.css";

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const { handleNewWorkspace, handleOpenSavedWorkspaces, handleSave } =
    useWorkspaceActions();
  const updateChecker = useUpdateChecker();

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
      <UpdateDialog
        status={updateChecker.status}
        update={updateChecker.update}
        downloadProgress={updateChecker.downloadProgress}
        errorType={updateChecker.errorType}
        onStartDownload={updateChecker.startDownload}
        onRestart={() => void relaunch()}
        onDismiss={updateChecker.dismiss}
      />
    </McpSetupGate>
  );
}

export default App;
