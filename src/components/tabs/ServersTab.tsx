import { useEffect, useState } from "react";
import { Plus, Server as ServerIcon, Wifi, Trash2, RefreshCw, Search, Play, Square } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { invoke } from "@tauri-apps/api/tauri";

export function ServersTab() {
  const { servers, setServers } = useAppStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [localServerRunning, setLocalServerRunning] = useState(false);
  const [newServer, setNewServer] = useState({ name: "", address: "", port: "9999" });

  // Scan for servers on the network
  const scanForServers = async () => {
    setIsScanning(true);
    
    // In a real implementation, this would:
    // 1. Use mDNS/Bonjour to discover BuildForge servers
    // 2. Or scan common ports on the local network
    // For now, we simulate the scan
    await new Promise(r => setTimeout(r, 2000));
    
    // No default servers - only show actually discovered ones
    setIsScanning(false);
  };

  // Scan on mount
  useEffect(() => {
    scanForServers();
  }, []);

  const addServer = () => {
    if (!newServer.name || !newServer.address) return;
    const server = {
      id: Date.now().toString(),
      name: newServer.name,
      address: newServer.address,
      port: parseInt(newServer.port) || 9999,
      status: "offline" as const,
      os: "Unknown",
      lastSeen: new Date().toISOString(),
    };
    setServers([...servers, server]);
    setNewServer({ name: "", address: "", port: "9999" });
    setShowAddModal(false);
  };

  const removeServer = (id: string) => {
    setServers(servers.filter(s => s.id !== id));
  };

  const connectServer = async (id: string) => {
    setServers(servers.map(s => 
      s.id === id ? { ...s, status: "connecting" as const } : s
    ));
    
    // Try to connect to the server
    const server = servers.find(s => s.id === id);
    if (server) {
      try {
        const response = await fetch(`http://${server.address}:${server.port}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
          setServers(servers.map(s => 
            s.id === id ? { ...s, status: "online" as const } : s
          ));
        } else {
          setServers(servers.map(s => 
            s.id === id ? { ...s, status: "offline" as const } : s
          ));
        }
      } catch {
        setServers(servers.map(s => 
          s.id === id ? { ...s, status: "offline" as const } : s
        ));
      }
    }
  };

  const startLocalServer = async () => {
    try {
      await invoke("start_local_server");
      setLocalServerRunning(true);
      // Add localhost server to list if not already present
      const hasLocalhost = servers.some(s => s.address === "localhost" || s.address === "127.0.0.1");
      if (!hasLocalhost) {
        const localServer = {
          id: "localhost",
          name: "Local Server",
          address: "localhost",
          port: 9876,
          status: "online" as const,
          os: "Local",
          lastSeen: new Date().toISOString(),
        };
        setServers([...servers, localServer]);
      }
    } catch (error) {
      console.error("Failed to start local server:", error);
      alert("Failed to start local server. Make sure the server binary is available.");
    }
  };

  const stopLocalServer = async () => {
    try {
      await invoke("stop_local_server");
      setLocalServerRunning(false);
    } catch (error) {
      console.error("Failed to stop local server:", error);
    }
  };

  return (
    <div className="p-6">
      {/* Local Server Control */}
      <div className="mb-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <ServerIcon className="w-5 h-5 text-green-400" />
              Local Server
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              Run a BuildForge server on this machine
            </p>
          </div>
          <button
            onClick={localServerRunning ? stopLocalServer : startLocalServer}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium ${
              localServerRunning 
                ? "bg-red-600 hover:bg-red-500" 
                : "bg-green-600 hover:bg-green-500"
            }`}
          >
            {localServerRunning ? (
              <>
                <Square className="w-4 h-4" />
                Stop Server
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Start Server
              </>
            )}
          </button>
        </div>
        {localServerRunning && (
          <div className="mt-3 text-xs text-green-400 flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Server running on localhost:9876
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Build Servers</h2>
          <p className="text-slate-400 mt-1">Servers running BuildForge that can execute workflows</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={scanForServers}
            disabled={isScanning}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isScanning ? "animate-spin" : ""}`} />
            {isScanning ? "Scanning..." : "Scan Network"}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Manually
          </button>
        </div>
      </div>

      {/* Servers List */}
      <div className="grid gap-3">
        {servers.map((server) => (
          <div
            key={server.id}
            className="flex items-center gap-4 p-4 bg-slate-800 border border-slate-700 rounded-lg group"
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              server.status === "online" ? "bg-green-600/20" : 
              server.status === "connecting" ? "bg-yellow-600/20" : "bg-slate-700"
            }`}>
              <ServerIcon className={`w-5 h-5 ${
                server.status === "online" ? "text-green-400" :
                server.status === "connecting" ? "text-yellow-400" : "text-slate-400"
              }`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-white">{server.name}</p>
                <span className={`px-2 py-0.5 text-xs rounded ${
                  server.status === "online" ? "bg-green-500/20 text-green-400" :
                  server.status === "connecting" ? "bg-yellow-500/20 text-yellow-400" :
                  "bg-slate-600 text-slate-400"
                }`}>
                  {server.status}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                {server.address}:{server.port} • {server.os}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {server.status !== "online" && (
                <button
                  onClick={() => connectServer(server.id)}
                  disabled={server.status === "connecting"}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm text-white disabled:opacity-50"
                >
                  <Wifi className="w-4 h-4" />
                  Connect
                </button>
              )}
              <button
                onClick={() => removeServer(server.id)}
                className="p-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {/* Empty State */}
        {servers.length === 0 && !isScanning && (
          <div className="text-center py-16 text-slate-500">
            <Search className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No BuildForge servers found</p>
            <p className="text-sm mt-1">Start a BuildForge server on another machine, or add one manually</p>
          </div>
        )}

        {/* Scanning State */}
        {isScanning && servers.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <RefreshCw className="w-10 h-10 mx-auto mb-3 animate-spin opacity-50" />
            <p>Scanning for BuildForge servers...</p>
          </div>
        )}
      </div>

      {/* Add Server Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-white mb-4">Add Server</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Name</label>
                <input
                  type="text"
                  value={newServer.name}
                  onChange={(e) => setNewServer(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Build Server 1"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Address</label>
                <input
                  type="text"
                  value={newServer.address}
                  onChange={(e) => setNewServer(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="192.168.1.100"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Port</label>
                <input
                  type="text"
                  value={newServer.port}
                  onChange={(e) => setNewServer(prev => ({ ...prev, port: e.target.value }))}
                  placeholder="9999"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-slate-400 hover:text-white text-sm"
              >
                Cancel
              </button>
              <button
                onClick={addServer}
                disabled={!newServer.name || !newServer.address}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm font-medium disabled:opacity-50"
              >
                Add Server
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
