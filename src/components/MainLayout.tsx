import { useState } from "react";
import { Workflow, Server, Settings, Package, LogOut } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { Titlebar } from "./Titlebar";

// Tab content components
import { WorkflowsTab } from "./tabs/WorkflowsTab";
import { ServersTab } from "./tabs/ServersTab";
import { ReleasesTab } from "./tabs/ReleasesTab";
import { SettingsTab } from "./tabs/SettingsTab";

type TabId = "workflows" | "servers" | "releases" | "settings";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const tabs: Tab[] = [
  { id: "workflows", label: "Workflows", icon: <Workflow className="w-5 h-5" /> },
  { id: "servers", label: "Servers", icon: <Server className="w-5 h-5" /> },
  { id: "releases", label: "Repositories", icon: <Package className="w-5 h-5" /> },
  { id: "settings", label: "Settings", icon: <Settings className="w-5 h-5" /> },
];

export function MainLayout() {
  const [activeTab, setActiveTab] = useState<TabId>("workflows");
  const { user, logout } = useAppStore();

  const renderContent = () => {
    switch (activeTab) {
      case "workflows":
        return <WorkflowsTab />;
      case "servers":
        return <ServersTab />;
      case "releases":
        return <ReleasesTab />;
      case "settings":
        return <SettingsTab />;
      default:
        return <WorkflowsTab />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900">
      <Titlebar />
      <div className="flex-1 flex overflow-hidden">
        {/* Vertical Tabs - Left Side */}
        <div className="w-56 bg-slate-950 border-r border-slate-800 flex flex-col">
          {/* User Info */}
          <div className="p-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              {user?.avatar_url ? (
                <img 
                  src={user.avatar_url} 
                  alt={user.name} 
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                  <span className="text-slate-400 text-lg">{user?.name?.[0] || "?"}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.name || "User"}</p>
                <p className="text-xs text-slate-500 truncate">@{user?.login || "unknown"}</p>
              </div>
            </div>
          </div>

          {/* Tab List */}
          <nav className="flex-1 p-2 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded text-left ${
                  activeTab === tab.id
                    ? "bg-slate-800 text-green-400"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
                }`}
              >
                <span className={activeTab === tab.id ? "text-green-400" : ""}>{tab.icon}</span>
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Logout Button */}
          <div className="p-2 border-t border-slate-800">
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:bg-red-600/20 hover:text-red-400"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </div>

        {/* Content Area - Right Side */}
        <main className="flex-1 overflow-auto bg-slate-900/50">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
