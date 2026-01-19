import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { Sidebar } from "./Sidebar";
import { Dashboard } from "./Dashboard";
import { ProjectsView } from "./ProjectsView";
import { ServersView } from "./ServersView";
import { HistoryView } from "./HistoryView";
import { SettingsView } from "./SettingsView";
import { Titlebar } from "./Titlebar";

export function MainLayout() {
  const { currentView } = useAppStore();

  const renderView = () => {
    switch (currentView) {
      case "dashboard":
        return <Dashboard />;
      case "projects":
        return <ProjectsView />;
      case "servers":
        return <ServersView />;
      case "history":
        return <HistoryView />;
      case "settings":
        return <SettingsView />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="h-full flex flex-col">
      <Titlebar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-slate-900/50">
          {renderView()}
        </main>
      </div>
    </div>
  );
}
