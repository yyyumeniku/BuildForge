import { useState } from "react";
import { 
  Plus, 
  Server, 
  Wifi, 
  WifiOff, 
  Trash2, 
  RefreshCw,
  Monitor,
  Apple,
  Terminal
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import { formatDistanceToNow } from "date-fns";

export function ServersView() {
  const { servers, addServer, removeServer, updateServerStatus } = useAppStore();
  const [showAddServer, setShowAddServer] = useState(false);
  const [newServer, setNewServer] = useState({
    name: "",
    address: "",
    port: 9876,
    os: "linux",
  });

  const handleAddServer = () => {
    if (!newServer.name.trim() || !newServer.address.trim()) return;
    
    addServer({
      name: newServer.name,
      address: newServer.address,
      port: newServer.port,
      os: newServer.os,
    });
    
    setShowAddServer(false);
    setNewServer({ name: "", address: "", port: 9876, os: "linux" });
  };

  const handleConnect = async (serverId: string, server: any) => {
    updateServerStatus(serverId, "connecting");
    
    // Simulate connection attempt
    // In real app, this would connect via WebSocket
    setTimeout(() => {
      // Randomly succeed or fail for demo
      const success = Math.random() > 0.3;
      updateServerStatus(serverId, success ? "online" : "offline");
    }, 2000);
  };

  const getOsIcon = (os: string) => {
    switch (os.toLowerCase()) {
      case "macos":
      case "darwin":
        return Apple;
      case "windows":
        return Monitor;
      default:
        return Terminal;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Build Servers</h1>
          <p className="text-slate-400">Manage your connected build servers</p>
        </div>
        <button
          onClick={() => setShowAddServer(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-white transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Server
        </button>
      </div>

      {/* Server Grid */}
      {servers.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-12 text-center">
          <Server className="w-16 h-16 mx-auto mb-4 text-slate-600" />
          <h3 className="text-lg font-medium text-white mb-2">No servers connected</h3>
          <p className="text-slate-400 mb-6">Add your first build server to start running builds</p>
          <button
            onClick={() => setShowAddServer(true)}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-white transition-colors"
          >
            Add Server
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers.map((server) => {
            const OsIcon = getOsIcon(server.os);
            return (
              <div
                key={server.id}
                className="bg-slate-800/50 rounded-xl border border-slate-700 p-6 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      server.status === "online" 
                        ? "bg-green-500/20 text-green-400" 
                        : server.status === "connecting"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-slate-700 text-slate-400"
                    }`}>
                      <OsIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-medium text-white">{server.name}</h3>
                      <p className="text-sm text-slate-400">{server.os}</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1.5 text-xs ${
                    server.status === "online" 
                      ? "text-green-400" 
                      : server.status === "connecting"
                      ? "text-yellow-400"
                      : "text-slate-500"
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${
                      server.status === "online" 
                        ? "bg-green-400" 
                        : server.status === "connecting"
                        ? "bg-yellow-400 animate-pulse"
                        : "bg-slate-500"
                    }`} />
                    {server.status}
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">Address:</span>
                    <span className="text-white">{server.address}:{server.port}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">Last seen:</span>
                    <span className="text-slate-300">
                      {formatDistanceToNow(new Date(server.lastSeen), { addSuffix: true })}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleConnect(server.id, server)}
                    disabled={server.status === "connecting"}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      server.status === "online"
                        ? "bg-slate-700 hover:bg-slate-600 text-white"
                        : server.status === "connecting"
                        ? "bg-yellow-600/20 text-yellow-400 cursor-not-allowed"
                        : "bg-green-600 hover:bg-green-500 text-white"
                    }`}
                  >
                    {server.status === "connecting" ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Connecting...
                      </>
                    ) : server.status === "online" ? (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Reconnect
                      </>
                    ) : (
                      <>
                        <Wifi className="w-4 h-4" />
                        Connect
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => removeServer(server.id)}
                    className="px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Server Dialog */}
      {showAddServer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Add Build Server</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Server Name</label>
                <input
                  type="text"
                  value={newServer.name}
                  onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                  placeholder="Linux Build Server"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">IP Address</label>
                <input
                  type="text"
                  value={newServer.address}
                  onChange={(e) => setNewServer({ ...newServer, address: e.target.value })}
                  placeholder="192.168.1.100"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Port</label>
                  <input
                    type="number"
                    value={newServer.port}
                    onChange={(e) => setNewServer({ ...newServer, port: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">OS</label>
                  <select
                    value={newServer.os}
                    onChange={(e) => setNewServer({ ...newServer, os: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="linux">Linux</option>
                    <option value="macos">macOS</option>
                    <option value="windows">Windows</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowAddServer(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddServer}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-white transition-colors"
                >
                  Add Server
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
