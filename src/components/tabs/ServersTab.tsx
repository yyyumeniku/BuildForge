import { useEffect, useState, useRef } from "react";
import { Plus, Server as ServerIcon, Wifi, Trash2, RefreshCw, Search, Play, Square, Terminal, Cpu, HardDrive, MemoryStick, Monitor, User, Clock, Package, Box, ChevronDown, ChevronUp } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { invoke } from "@tauri-apps/api/tauri";

// OS-specific ASCII art (like neofetch/fastfetch)
const OS_ASCII: Record<string, string> = {
  macos: `        .:'
    __ :'__
 .' \`__\`-'__\` \`.
:__________.-'
:_________:
 :_________\`-;
  \`.__.-.__.'`,
  linux: `      .--.
     |o_o |
     |:_/ |
    //   \\ \\
   (|     | )
  /'\\_   _/\`\\
  \\___)=(___ /`,
  windows: `████████████
████████████
████████████

████████████
████████████
████████████`,
  unknown: `    _____
   /     \\
  | () () |
   \\  ^  /
    |||||
    |||||`,
};

interface DockerContainer {
  id: string;
  name: string;
  os: "windows" | "linux";
  status: "running" | "stopped" | "creating";
  image: string;
}

interface ServerLog {
  timestamp: string;
  level: "info" | "error" | "success";
  message: string;
}

interface SystemInfo {
  hostname: string;
  os: string;
  os_version: string;
  arch: string;
  cpu: string;
  cpu_cores: number;
  memory_total_gb: number;
  memory_available_gb: number;
  disk_total_gb: number;
  disk_available_gb: number;
  uptime_hours: number;
  package_manager: string;
  shell: string;
  username: string;
}

export function ServersTab() {
  const { servers, setServers } = useAppStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [localServerRunning, setLocalServerRunning] = useState(true); // Auto-start enabled
  const [newServer, setNewServer] = useState({ name: "", address: "", port: "9999", targetOS: "any" as "windows" | "macos" | "linux" | "any" });
  const [serverLogs, setServerLogs] = useState<ServerLog[]>([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loadingSystemInfo, setLoadingSystemInfo] = useState(true);
  const [dockerContainers, setDockerContainers] = useState<DockerContainer[]>([]);
  const [dockerEnabled, setDockerEnabled] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>("localhost");
  const [creatingContainer, setCreatingContainer] = useState<string | null>(null);
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
    loadSystemInfo();
    checkDockerAvailable();
    
    // Start health check interval
    healthCheckInterval.current = setInterval(checkAllServersHealth, 10000); // Every 10 seconds
    
    return () => {
      if (healthCheckInterval.current) {
        clearInterval(healthCheckInterval.current);
      }
    };
  }, []);

  const loadSystemInfo = async () => {
    setLoadingSystemInfo(true);
    try {
      const info = await invoke<SystemInfo>("get_system_info");
      setSystemInfo(info);
      addLog("info", `System: ${info.os} ${info.os_version} (${info.arch})`);
    } catch (error) {
      console.error("Failed to load system info:", error);
      addLog("error", "Failed to load system information");
    } finally {
      setLoadingSystemInfo(false);
    }
  };

  // Check if Docker is available
  const checkDockerAvailable = async () => {
    try {
      const result = await invoke<string>("run_command", { 
        command: "docker", 
        args: ["--version"],
        cwd: "/"
      });
      if (result) {
        setDockerEnabled(true);
        addLog("info", "Docker detected: " + result.trim());
        loadDockerContainers();
      }
    } catch {
      setDockerEnabled(false);
    }
  };

  // Load existing Docker containers
  const loadDockerContainers = async () => {
    try {
      const result = await invoke<string>("run_command", {
        command: "docker",
        args: ["ps", "-a", "--filter", "label=buildforge", "--format", "{{.ID}}|{{.Names}}|{{.Status}}|{{.Image}}"],
        cwd: "/"
      });
      
      const containers: DockerContainer[] = result.split("\n")
        .filter(line => line.trim())
        .map(line => {
          const [id, name, status, image] = line.split("|");
          const isLinux = image?.includes("linux") || image?.includes("ubuntu") || image?.includes("debian") || image?.includes("alpine");
          return {
            id,
            name,
            os: isLinux ? "linux" as const : "windows" as const,
            status: status?.toLowerCase().includes("up") ? "running" as const : "stopped" as const,
            image
          };
        });
      
      setDockerContainers(containers);
    } catch {
      // Docker might not have any BuildForge containers yet
    }
  };

  // Create a Docker container for cross-platform builds
  const createDockerContainer = async (os: "windows" | "linux") => {
    setCreatingContainer(os);
    addLog("info", `Creating ${os} Docker container for cross-platform builds...`);
    
    try {
      const image = os === "linux" 
        ? "ubuntu:22.04" 
        : "mcr.microsoft.com/windows/servercore:ltsc2022";
      
      const containerName = `buildforge-${os}-builder`;
      
      // Pull the image first
      addLog("info", `Pulling ${image}...`);
      await invoke<string>("run_command", {
        command: "docker",
        args: ["pull", image],
        cwd: "/"
      });
      
      // Create and start the container
      addLog("info", `Creating container ${containerName}...`);
      await invoke<string>("run_command", {
        command: "docker",
        args: [
          "run", "-d",
          "--name", containerName,
          "--label", "buildforge",
          "-v", "/tmp/buildforge:/workspace",
          image,
          os === "linux" ? "tail" : "ping",
          os === "linux" ? "-f" : "-t",
          os === "linux" ? "/dev/null" : "localhost"
        ],
        cwd: "/"
      });
      
      addLog("success", `${os} Docker container created successfully!`);
      loadDockerContainers();
    } catch (error: any) {
      addLog("error", `Failed to create ${os} container: ${error}`);
    } finally {
      setCreatingContainer(null);
    }
  };

  // Delete a Docker container
  const deleteDockerContainer = async (containerId: string, containerName: string) => {
    addLog("info", `Removing container ${containerName}...`);
    try {
      await invoke<string>("run_command", {
        command: "docker",
        args: ["rm", "-f", containerId],
        cwd: "/"
      });
      addLog("success", `Container ${containerName} removed`);
      loadDockerContainers();
    } catch (error: any) {
      addLog("error", `Failed to remove container: ${error}`);
    }
  };

  // Get OS type for ASCII art
  const getOSType = (): string => {
    if (!systemInfo) return "unknown";
    const os = systemInfo.os.toLowerCase();
    if (os.includes("macos") || os.includes("darwin")) return "macos";
    if (os.includes("windows")) return "windows";
    if (os.includes("linux") || os.includes("ubuntu") || os.includes("debian") || os.includes("fedora")) return "linux";
    return "unknown";
  };

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
      targetOS: newServer.targetOS,
      lastSeen: new Date().toISOString(),
    };
    setServers([...servers, server]);
    setNewServer({ name: "", address: "", port: "9999", targetOS: "any" });
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
      
      // Detect current OS
      const currentOS = systemInfo?.os.toLowerCase().includes("macos") ? "macos" as const
        : systemInfo?.os.toLowerCase().includes("windows") ? "windows" as const
        : "linux" as const;
      
      // Add/update localhost server in list
      const hasLocalhost = servers.some(s => s.id === "localhost");
      if (!hasLocalhost) {
        const localServer = {
          id: "localhost",
          name: "Local Server",
          address: "localhost",
          port: 9876,
          status: "online" as const,
          os: systemInfo?.os || "Local",
          targetOS: currentOS,
          lastSeen: new Date().toISOString(),
        };
        setServers([localServer, ...servers]);
      } else {
        setServers(servers.map(s => 
          s.id === "localhost" ? { ...s, status: "online" as const, os: systemInfo?.os || s.os, targetOS: currentOS } : s
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
        {/* Local Server Card with System Specs */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">Local Server</h2>
            <button
              onClick={localServerRunning ? stopLocalServer : startLocalServer}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
                localServerRunning 
                  ? "bg-red-600 hover:bg-red-500 text-white" 
                  : "bg-green-600 hover:bg-green-500 text-white"
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
          
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            {/* Server Header - Clickable */}
            <button
              onClick={() => setExpandedServer(expandedServer === "localhost" ? null : "localhost")}
              className="w-full flex items-center gap-4 p-4 hover:bg-slate-700/50"
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                localServerRunning ? "bg-green-600/20" : "bg-slate-700"
              }`}>
                <ServerIcon className={`w-5 h-5 ${
                  localServerRunning ? "text-green-400" : "text-slate-400"
                }`} />
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-white">Local Server</p>
                  <span className={`px-2 py-0.5 text-xs rounded ${
                    localServerRunning ? "bg-green-500/20 text-green-400" : "bg-slate-600 text-slate-400"
                  }`}>
                    {localServerRunning ? "online" : "offline"}
                  </span>
                  <span className="px-2 py-0.5 text-xs rounded bg-purple-500/20 text-purple-400">
                    {getOSType()}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-0.5">localhost:9876</p>
              </div>
              {expandedServer === "localhost" ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              )}
            </button>
            
            {/* Expanded System Specs */}
            {expandedServer === "localhost" && (
              <div className="border-t border-slate-700 p-4 bg-slate-900/50">
                <div className="flex items-start gap-6 font-mono">
                  {/* OS-specific ASCII Art */}
                  <pre className={`text-xs leading-tight whitespace-pre hidden lg:block ${
                    getOSType() === "macos" ? "text-white" :
                    getOSType() === "linux" ? "text-yellow-400" :
                    getOSType() === "windows" ? "text-blue-400" :
                    "text-slate-400"
                  }`}>
                    {OS_ASCII[getOSType()] || OS_ASCII.unknown}
                  </pre>
                  
                  {/* System Info */}
                  {loadingSystemInfo ? (
                    <div className="flex-1 text-slate-500 text-sm">Loading system information...</div>
                  ) : systemInfo ? (
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-cyan-400" />
                        <span className="text-cyan-400 font-semibold">{systemInfo.username}@{systemInfo.hostname}</span>
                      </div>
                      <div className="text-slate-600 md:col-span-2">{"─".repeat(35)}</div>
                      
                      <div className="flex items-center gap-2">
                        <Monitor className="w-4 h-4 text-blue-400" />
                        <span className="text-blue-400">OS:</span>
                        <span className="text-white">{systemInfo.os} {systemInfo.os_version}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-purple-400" />
                        <span className="text-purple-400">CPU:</span>
                        <span className="text-white">{systemInfo.cpu_cores} cores</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <MemoryStick className="w-4 h-4 text-yellow-400" />
                        <span className="text-yellow-400">RAM:</span>
                        <span className="text-white">
                          {systemInfo.memory_available_gb.toFixed(1)} / {systemInfo.memory_total_gb.toFixed(1)} GB
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-orange-400" />
                        <span className="text-orange-400">Disk:</span>
                        <span className="text-white">
                          {systemInfo.disk_available_gb.toFixed(1)} / {systemInfo.disk_total_gb.toFixed(1)} GB
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-pink-400" />
                        <span className="text-pink-400">Uptime:</span>
                        <span className="text-white">
                          {systemInfo.uptime_hours >= 24 
                            ? `${Math.floor(systemInfo.uptime_hours / 24)}d ${Math.floor(systemInfo.uptime_hours % 24)}h`
                            : `${systemInfo.uptime_hours.toFixed(1)}h`
                          }
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-red-400" />
                        <span className="text-red-400">Pkg:</span>
                        <span className="text-white">{systemInfo.package_manager}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 text-red-400 text-sm">Failed to load system information</div>
                  )}
                </div>
                
                {/* Docker Support Section */}
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Box className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-medium text-white">Docker Cross-Platform Builds</span>
                      {dockerEnabled ? (
                        <span className="px-2 py-0.5 text-xs rounded bg-green-500/20 text-green-400">Available</span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs rounded bg-red-500/20 text-red-400">Not Installed</span>
                      )}
                    </div>
                  </div>
                  
                  {dockerEnabled ? (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-400">
                        Create Docker containers to build for other platforms. BuildForge will automatically use these when building for a target OS you don't have a native server for.
                      </p>
                      
                      {/* Existing containers */}
                      {dockerContainers.length > 0 && (
                        <div className="space-y-2">
                          {dockerContainers.map(container => (
                            <div key={container.id} className="flex items-center justify-between p-2 bg-slate-800 rounded-lg">
                              <div className="flex items-center gap-2">
                                <Box className={`w-4 h-4 ${container.status === "running" ? "text-green-400" : "text-slate-400"}`} />
                                <span className="text-sm text-white">{container.name}</span>
                                <span className={`px-1.5 py-0.5 text-xs rounded ${
                                  container.os === "linux" ? "bg-orange-500/20 text-orange-400" : "bg-blue-500/20 text-blue-400"
                                }`}>
                                  {container.os}
                                </span>
                                <span className={`px-1.5 py-0.5 text-xs rounded ${
                                  container.status === "running" ? "bg-green-500/20 text-green-400" : "bg-slate-600 text-slate-400"
                                }`}>
                                  {container.status}
                                </span>
                              </div>
                              <button
                                onClick={() => deleteDockerContainer(container.id, container.name)}
                                className="p-1.5 text-slate-500 hover:text-red-400"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Create new container buttons */}
                      <div className="flex gap-2">
                        {!dockerContainers.find(c => c.os === "linux") && (
                          <button
                            onClick={() => createDockerContainer("linux")}
                            disabled={creatingContainer !== null}
                            className="flex items-center gap-2 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                          >
                            {creatingContainer === "linux" ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Plus className="w-3 h-3" />
                            )}
                            Add Linux Container
                          </button>
                        )}
                        {!dockerContainers.find(c => c.os === "windows") && getOSType() !== "linux" && (
                          <button
                            onClick={() => createDockerContainer("windows")}
                            disabled={creatingContainer !== null}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                          >
                            {creatingContainer === "windows" ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Plus className="w-3 h-3" />
                            )}
                            Add Windows Container
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Install Docker to enable cross-platform builds without additional servers.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* External Servers Section */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">External Servers</h2>
            <p className="text-slate-400 mt-1">Remote servers that can execute workflows</p>
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
                  {/* Target OS Badge */}
                  <span className={`px-2 py-0.5 text-xs rounded ${
                    server.targetOS === "windows" ? "bg-blue-500/20 text-blue-400" :
                    server.targetOS === "macos" ? "bg-purple-500/20 text-purple-400" :
                    server.targetOS === "linux" ? "bg-orange-500/20 text-orange-400" :
                    "bg-slate-600 text-slate-400"
                  }`}>
                    {server.targetOS === "windows" ? "Windows" :
                     server.targetOS === "macos" ? "macOS" :
                     server.targetOS === "linux" ? "Linux" : "Any OS"}
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
              <div className="grid grid-cols-2 gap-4">
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
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Target OS</label>
                  <select
                    value={newServer.targetOS}
                    onChange={(e) => setNewServer(prev => ({ ...prev, targetOS: e.target.value as "windows" | "macos" | "linux" | "any" }))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="any">Any OS</option>
                    <option value="windows">Windows</option>
                    <option value="macos">macOS</option>
                    <option value="linux">Linux</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Target OS determines which platform builds this server handles. Set to "Any OS" for general-purpose servers.
              </p>
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
