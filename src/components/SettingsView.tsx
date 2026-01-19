import { 
  Bell, 
  Moon, 
  Sun, 
  Github,
  Clock,
  Trash2,
  Download,
  Upload
} from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../store/appStore";

export function SettingsView() {
  const { user, logout, builds, projects, servers } = useAppStore();
  const [notifications, setNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const handleExportConfig = () => {
    const config = {
      projects,
      servers: servers.map(s => ({ ...s, status: "offline" })),
      exportedAt: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "buildforge-config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearHistory = () => {
    if (confirm("Are you sure you want to clear all build history?")) {
      // In real app, would clear builds from store
      console.log("Clearing history...");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400">Configure BuildForge preferences</p>
      </div>

      {/* Account Section */}
      <section className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Account</h2>
        {user && (
          <div className="flex items-center gap-4 mb-4">
            <img 
              src={user.avatar_url} 
              alt={user.name}
              className="w-16 h-16 rounded-full"
            />
            <div>
              <p className="text-lg font-medium text-white">{user.name}</p>
              <p className="text-slate-400">@{user.login}</p>
              {user.email && (
                <p className="text-sm text-slate-500">{user.email}</p>
              )}
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <a
            href="https://github.com/settings/tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
          >
            <Github className="w-4 h-4" />
            Manage Tokens
          </a>
          <button
            onClick={logout}
            className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>
      </section>

      {/* Notifications Section */}
      <section className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Notifications</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-white">Build Notifications</p>
                <p className="text-sm text-slate-400">Get notified when builds complete</p>
              </div>
            </div>
            <button
              onClick={() => setNotifications(!notifications)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                notifications ? "bg-green-600" : "bg-slate-600"
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  notifications ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-white">Sound Effects</p>
                <p className="text-sm text-slate-400">Play sound on build completion</p>
              </div>
            </div>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                soundEnabled ? "bg-green-600" : "bg-slate-600"
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  soundEnabled ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Data Section */}
      <section className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Data</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white">Export Configuration</p>
              <p className="text-sm text-slate-400">
                Download projects and server configs
              </p>
            </div>
            <button
              onClick={handleExportConfig}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-white">Build History</p>
              <p className="text-sm text-slate-400">
                {builds.length} builds recorded
              </p>
            </div>
            <button
              onClick={handleClearHistory}
              className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">About</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Version</span>
            <span className="text-white">1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Projects</span>
            <span className="text-white">{projects.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Servers</span>
            <span className="text-white">{servers.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Total Builds</span>
            <span className="text-white">{builds.length}</span>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-700">
          <a
            href="https://github.com/yyyumeniku/BuildForge"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-green-400 hover:text-green-300"
          >
            <Github className="w-4 h-4" />
            View on GitHub
          </a>
        </div>
      </section>
    </div>
  );
}
