import { useEffect, useState, useRef } from "react";
import { Plus, Server as ServerIcon, Wifi, Trash2, RefreshCw, Search, Play, Square, Terminal, AlertCircle, CheckCircle } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { invoke } from "@tauri-apps/api/tauri";

interface ServerLog {
  timestamp: string;
  level: "info" | "error" | "success";
  message: string;
}

export function ServersTab() {
  const { servers, setServers } = useAppStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [localServerRunning, setLocalServerRunning] = useState(true); // Auto-start enabled
  const [newServer, setNewServer] = useState({ name: "", address: "", port: "9999" });
  const [serverLogs, setServerLogs] = useState<ServerLog[]>([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const healthCheckInterval = useRef<NodeJS.Timeout | null>(null);

  const addLog = (level: "info" | "error" | "success", message: string) => {
    setServerLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      level,
      message
    }]);
  };

  // Auto-start local server on mount
  useEffect(() => {
    addLog("info", "Initializing BuildForge client...");
    startLocalServer();
    
    // Start health check interval
    healthCheckInterval.current = setInterval(checkAllServersHealth, 10000); // Every 10 seconds
    
    return () => {
      if (healthCheckInterval.current) {
        clearInterval(healthCheckInterval.current);
      }
    };
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [serverLogs]);

  const checkServerHealth = async (server: typeof servers[0]): Promise<boolean> => {
    try {
      const response = await fetch(`http://${server.address}:${server.port}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  const checkAllServersHealth = async () => {
    const updatedServers = await Promise.all(
      servers.map(async (server) => {
        const isOnline = await checkServerHealth(server);
        return {
          ...server,
          status: isOnline ? "online" as const : "offline" as const,
          lastSeen: isOnline ? new Date().toISOString() : server.lastSeen
        };
      })
    );
    setServers(updatedServers);
    
    // Check for external server failures
    const externalServers = updatedServers.filter(s => s.id !== "localhost");
    const hasOnlineExternal = externalServers.some(s => s.status === "online");
    const hasOfflineExternal = externalServers.some(s => s.status === "offline" && s.id === selectedServerId);
    
    if (hasOfflineExternal && !hasOnlineExternal && !localServerRunning) {
      addLog("error", "External server not working as expected. Switching to local server...");
      await startLocalServer();
    }
  };

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

  const startLocalServer = async () => {
    addLog("info", "Starting local server...");
    try {
      await invoke("start_local_server");
      setLocalServerRunning(true);
      addLog("success", "Local server started successfully on port 9876");
      
      // Add/update localhost server in list
      const hasLocalhost = servers.some(s => s.id === "localhost");
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
        setServers([localServer, ...servers]);
      } else {
        setServers(servers.map(s => 
          s.id === "localhost" ? { ...s, status: "online" as const } : s
        ));
      }
    } catch (error: any) {
      addLog("error", `Failed to start local server: ${error}`);
      console.error("Failed to start local server:", error);
    }
  };

  const stopLocalServer = async () => {
    addLog("info", "Stopping local server...");
    try {
      await invoke("stop_local_server");
      setLocalServerRunning(false);
      addLog("success", "Local server stopped");
      setServers(servers.map(s => 
        s.id === "localhost" ? { ...s, status: "offline" as const } : s
      ));
    } catch (error: any) {
      addLog("error", `Failed to stop local server: ${error}`);
      console.error("Failed to stop local server:", error);
    }
  };

  const connectToExternalServer = async (server: typeof servers[0]) => {
    addLog("info", `Connecting to external server: ${server.name} (${server.address}:${server.port})`);
    
    const isOnline = await checkServerHealth(server);
    
    if (isOnline) {
      addLog("success", `Connected to ${server.name}`);
      setSelectedServerId(server.id);
      
      // Stop local server when connecting to external
      if (localServerRunning) {
        addLog("info", "Stopping local server to use external server...");
        await stopLocalServer();
      }
    } else {
      addLog("error", `Failed to connect to ${server.name}. Server is offline.`);
      addLog("info", "Falling back to local server...");
      if (!localServerRunning) {
        await startLocalServer();
      }
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Server Terminal/Logs */}
      <div className="flex-none border-b border-slate-700 bg-slate-900/50">
        <button
          onClick={() => setShowTerminal(!showTerminal)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50"
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-green-400" />
            <span className="text-sm font-medium text-white">Server Console</span>
            <span className="text-xs text-slate-500">({serverLogs.length} logs)</span>
          </div>
          <span className="text-xs text-slate-400">{showTerminal ? "Hide" : "Show"}</span>
        </button>
        
        {showTerminal && (
          <div className="bg-slate-950 border-t border-slate-800 p-3 max-h-64 overflow-auto font-mono text-xs">
            {serverLogs.map((log, idx) => (
              <div key={idx} className={`mb-1 ${
                log.level === "error" ? "text-red-400" :
                log.level === "success" ? "text-green-400" :
                "text-slate-400"
              }`}>
                <span className="text-slate-600">[{new Date(log.timestamp).toLocaleTimeString()}]</span> {log.message}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* Server Status Banner */}
        <div className={`mb-6 p-4 rounded-xl border ${
          localServerRunning 
            ? "bg-green-600/10 border-green-500/30" 
            : "bg-yellow-600/10 border-yellow-500/30"
        }`}>
          <div className="flex items-center gap-3">
            {localServerRunning ? (
              <CheckCircle className="w-5 h-5 text-green-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-yellow-400" />
            )}
            <div className="flex-1">
              <p className={`font-medium ${localServerRunning ? "text-green-400" : "text-yellow-400"}`}>
                {localServerRunning ? "Local Server Running" : "No Active Server"}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {localServerRunning 
                  ? "Builds will execute on this machine (localhost:9876)" 
                  : "Start local server or connect to an external server"}
              </p>
            </div>
            <button
              onClick={localServerRunning ? stopLocalServer : startLocalServer}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
                localServerRunning 
                  ? "bg-red-600 hover:bg-red-500 text-white" 
                  : "bg-green-600 hover:bg-green-500 text-white"
              }`}
            >
              {localServerRunning ? (
                <>
                  <Square className="w-3 h-3" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" />
                  Start
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Build Servers</h2>
            <p className="text-slate-400 mt-1">External servers that can execute workflows</p>
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
              Add Server
            </button>
          </div>
        </div>

        {/* Servers List */}
        <div className="grid gap-3">
          {servers.filter(s => s.id !== "localhost").map((server) => (
            <div
              key={server.id}
              className="flex items-center gap-4 p-4 bg-slate-800 border border-slate-700 rounded-lg group hover:border-slate-600"
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                server.status === "online" ? "bg-green-600/20" : "bg-slate-700"
              }`}>
                <ServerIcon className={`w-5 h-5 ${
                  server.status === "online" ? "text-green-400" : "text-slate-400"
                }`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-white">{server.name}</p>
                  <span className={`px-2 py-0.5 text-xs rounded ${
                    server.status === "online" ? "bg-green-500/20 text-green-400" :
                    "bg-slate-600 text-slate-400"
                  }`}>
                    {server.status}
                  </span>
                  {server.id === selectedServerId && (
                    <span className="px-2 py-0.5 text-xs rounded bg-blue-500/20 text-blue-400">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500 mt-0.5">
                  {server.address}:{server.port} • {server.os}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => connectToExternalServer(server)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm text-white"
                >
                  <Wifi className="w-4 h-4" />
                  {server.id === selectedServerId ? "Reconnect" : "Use Server"}
                </button>
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
          {servers.filter(s => s.id !== "localhost").length === 0 && !isScanning && (
            <div className="text-center py-16 text-slate-500">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No external servers found</p>
              <p className="text-sm mt-1">Scan network or add a server manually to use remote builds</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Server Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-white mb-4">Add External Server</h3>
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
