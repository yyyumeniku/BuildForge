import { useState, useEffect } from "react";
import { Save, User, Bell, FolderOpen, HardDrive, Folder, RefreshCw, Trash2, ExternalLink } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { invoke } from "@tauri-apps/api/tauri";

export function SettingsTab() {
  const { user, settings: appSettings, updateSettings } = useAppStore();
  const [settings, setSettings] = useState({
    defaultBranch: "main",
    autoUpdate: true,
    notifications: appSettings.notificationsEnabled,
    theme: appSettings.theme,
    buildTimeout: 30,
  });
  const [storagePath, setStoragePath] = useState<string | null>(appSettings.storagePath);
  const [defaultPath, setDefaultPath] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Get default app data directory
    invoke<string>("get_app_data_dir").then(setDefaultPath).catch(console.error);
  }, []);

  const handleSelectFolder = async () => {
    try {
      const folder = await invoke<string | null>("select_folder");
      if (folder) {
        setStoragePath(folder);
      }
    } catch (e) {
      console.error("Failed to select folder:", e);
    }
  };

  const handleResetToDefault = () => {
    setStoragePath(null);
  };

  const handleOpenFolder = async () => {
    try {
      const folderPath = storagePath || defaultPath;
      if (folderPath) {
        // Use shell command to open folder in file explorer
        // On macOS: "open", on Windows: "explorer", on Linux: "xdg-open"
        const openCommand = await invoke<string>("run_command", {
          command: "open",
          args: [folderPath],
          cwd: "/"
        });
        console.log("Folder opened:", openCommand);
      }
    } catch (e) {
      console.error("Failed to open folder:", e);
      alert("Failed to open folder: " + JSON.stringify(e));
    }
  };

  const handleDeleteAppData = async () => {
    const confirmed = confirm(
      "WARNING: This will permanently delete ALL BuildForge data including:\n\n" +
      "• Workflows\n" +
      "• Actions\n" +
      "• Settings\n" +
      "• History\n\n" +
      "This action CANNOT be undone. Are you sure?"
    );
    
    if (!confirmed) return;
    
    const doubleConfirm = confirm("Are you ABSOLUTELY sure? This will delete everything!");
    if (!doubleConfirm) return;
    
    try {
      setLoading(true);
      
      // Delete all data files
      const dataFiles = ["workflows.json", "actions.json", "repos.json", "settings.json"];
      for (const file of dataFiles) {
        try {
          await invoke("delete_app_data", { 
            filename: file,
            customPath: storagePath 
          });
        } catch (e) {
          // Ignore if file doesn't exist
        }
      }
      
      alert("All app data has been deleted. Please restart BuildForge.");
      // Optionally reload the app
      window.location.reload();
    } catch (e) {
      console.error("Failed to delete app data:", e);
      alert("Failed to delete some data files");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Update app settings in store
      updateSettings({
        storagePath,
        theme: settings.theme as "dark" | "light" | "system",
        notificationsEnabled: settings.notifications,
        autoSave: settings.autoUpdate,
      });
      
      // Also save to localStorage for quick access
      localStorage.setItem("buildforge-settings", JSON.stringify({
        ...settings,
        storagePath,
      }));
      
      alert("Settings saved! Storage path changes will take effect after restart.");
    } catch (e) {
      console.error("Failed to save settings:", e);
      alert("Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>

      {/* Account Section */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-slate-400" />
          <h3 className="text-lg font-medium text-white">Account</h3>
        </div>
        <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
          <div className="flex items-center gap-4">
            {user?.avatar_url && (
              <img src={user.avatar_url} alt={user.name} className="w-16 h-16 rounded-full" />
            )}
            <div>
              <p className="font-medium text-white">{user?.name || "Not logged in"}</p>
              <p className="text-sm text-slate-400">{user?.login ? `@${user.login}` : "Sign in to use GitHub features"}</p>
              <p className="text-xs text-slate-500 mt-1">{user?.email || ""}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Storage Location */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <HardDrive className="w-5 h-5 text-slate-400" />
          <h3 className="text-lg font-medium text-white">Data Storage</h3>
        </div>
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Choose where BuildForge stores workflows, actions, cloned repositories, and other data.
          </p>
          <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Folder className="w-4 h-4 text-slate-500" />
              <span className="text-xs text-slate-500 uppercase tracking-wide">Current Location</span>
            </div>
            <p className="text-white font-mono text-sm break-all mb-3">
              {storagePath || defaultPath || "Loading..."}
            </p>
            {storagePath && (
              <p className="text-xs text-amber-400 mb-3">
                WARNING: Using custom storage path
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleSelectFolder}
                className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-white text-sm transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                Choose Folder
              </button>
              {storagePath && (
                <button
                  onClick={handleResetToDefault}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-white text-sm transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reset to Default
                </button>
              )}
            </div>
            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-700">
              <button
                onClick={handleOpenFolder}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded text-blue-400 text-sm transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Open Data Folder
              </button>
              <button
                onClick={handleDeleteAppData}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 rounded text-red-400 text-sm transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete All Data
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Default: ~/Library/Application Support/com.buildforge.app/ (macOS)<br/>
            %APPDATA%\BuildForge (Windows) | ~/.config/buildforge (Linux)
          </p>
        </div>
      </div>

      {/* Build Settings */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <FolderOpen className="w-5 h-5 text-slate-400" />
          <h3 className="text-lg font-medium text-white">Build Settings</h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-2">Default Branch</label>
            <input
              type="text"
              value={settings.defaultBranch}
              onChange={(e) => setSettings((s) => ({ ...s, defaultBranch: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-2">Build Timeout (minutes)</label>
            <input
              type="number"
              value={settings.buildTimeout}
              onChange={(e) => setSettings((s) => ({ ...s, buildTimeout: parseInt(e.target.value) || 30 }))}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-5 h-5 text-slate-400" />
          <h3 className="text-lg font-medium text-white">Notifications</h3>
        </div>
        <div className="space-y-4">
          <label className="flex items-center justify-between p-4 bg-slate-800/50 border border-slate-700 rounded-lg cursor-pointer">
            <span className="text-white">Enable desktop notifications</span>
            <input
              type="checkbox"
              checked={settings.notifications}
              onChange={(e) => setSettings((s) => ({ ...s, notifications: e.target.checked }))}
              className="w-5 h-5 rounded bg-slate-700 border-slate-600 text-green-500 focus:ring-green-500"
            />
          </label>
          <label className="flex items-center justify-between p-4 bg-slate-800/50 border border-slate-700 rounded-lg cursor-pointer">
            <span className="text-white">Auto-save workflows</span>
            <input
              type="checkbox"
              checked={settings.autoUpdate}
              onChange={(e) => setSettings((s) => ({ ...s, autoUpdate: e.target.checked }))}
              className="w-5 h-5 rounded bg-slate-700 border-slate-600 text-green-500 focus:ring-green-500"
            />
          </label>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={loading}
        className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg text-white font-medium transition-colors"
      >
        <Save className="w-4 h-4" />
        {loading ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}
