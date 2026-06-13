import { useState } from "react";
import { McpSetupGate } from "@/app/McpSetupGate";
import { AppToolbar } from "@/components/AppToolbar";
import { SettingsDialog } from "@/components/SettingsDialog";
import { WorkspacePage } from "@/pages/WorkspacePage";
import "./App.css";

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <McpSetupGate onOpenSettings={() => setSettingsOpen(true)}>
      <div className="flex h-screen flex-col">
        <AppToolbar onOpenSettings={() => setSettingsOpen(true)} />
        <div className="flex-1 overflow-hidden">
          <WorkspacePage />
        </div>
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </McpSetupGate>
  );
}

export default App;
