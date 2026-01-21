import { useEffect, useState, useRef, useMemo } from "react";
import { Plus, Server as ServerIcon, Wifi, Trash2, RefreshCw, Search, Play, Square, Terminal, Box, Download, Settings, X, Gauge } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { invoke } from "@tauri-apps/api/tauri";

// Fastfetch ASCII art - exact from fastfetch source
const OS_ASCII: Record<string, string[]> = {
  macos: [
    "                    'c.          ",
    "                 ,xNMM.          ",
    "               .OMMMMo           ",
    "               OMMM0,            ",
    "     .;loddo:' loolloddol;.      ",
    "   cKMMMMMMMMMMNWMMMMMMMMMM0:    ",
    " .KMMMMMMMMMMMMMMMMMMMMMMMWd.    ",
    " XMMMMMMMMMMMMMMMMMMMMMMMX.      ",
    ";MMMMMMMMMMMMMMMMMMMMMMMM:       ",
    ":MMMMMMMMMMMMMMMMMMMMMMMM:       ",
    ".MMMMMMMMMMMMMMMMMMMMMMMMX.      ",
    " kMMMMMMMMMMMMMMMMMMMMMMMMMWd.   ",
    " .XMMMMMMMMMMMMMMMMMMMMMMMMMMk   ",
    "  .XMMMMMMMMMMMMMMMMMMMMMMMMK.   ",
    "    kMMMMMMMMMMMMMMMMMMMMMMd     ",
    "     ;KMMMMMMMWXXWMMMMMMMk.      ",
    "       .cooc,.    .,coo:.        ",
  ],
  linux: [
    "        #####           ",
    "       #######          ",
    "       ##O#O##          ",
    "       #######          ",
    "     ###########        ",
    "    #############       ",
    "   ###############      ",
    "   ################     ",
    "  #################     ",
    "#####################   ",
    "#####################   ",
    "  #################     ",
  ],
  windows: [
    "         ,.=:!!t3Z3z.,              ",
    "        :tt:::tt333EE3             ",
    "        Et:::ztt33EEEL @Ee.,      ",
    "       ;tt:::tt333EE7 ;EEEEEEttttt ",
    "      :Et:::zt333EEQ. $EEEEEttttt  ",
    "      it::::tt333EEF @EEEEEEttttt  ",
    "     ;3=*^```\"*4EEV :EEEEEEttttt   ",
    "     ,.=::::!t=., ` @EEEEEEtttz^   ",
    "    ;::::::::zt33)   \"4EEEtttji    ",
    "   :t::::::::tt33.:Z3z..  \"\" ,..g. ",
    "   i::::::::zt33F AEEEtttt::::ztF  ",
    "  ;:::::::::t33V ;EEEttttt::::t3   ",
    "  E::::::::zt33L @EEEtttt::::z3F   ",
  ],
  unknown: [
    "    _______   ",
    "   /       \\  ",
    "  |  ?   ? | ",
    "  |    ^   | ",
    "  |  \\___/ | ",
    "   \\_______/ ",
  ],
};

interface DockerContainer {
  id: string;
  name: string;
  os: "windows" | "linux" | "macos";
  status: "running" | "stopped" | "creating";
  image: string;
}

interface ServerLog {
  timestamp: string;
  level: "info" | "error" | "success" | "warn";
  message: string;
}

interface SystemInfo {
  hostname: string;
  os: string;
  os_version: string;
  arch: string;
  cpu: string;
  cpu_cores: number;
  cpu_usage_percent: number;
  memory_total_gb: number;
  memory_used_gb: number;
  disk_total_gb: number;
  disk_used_gb: number;
  uptime_hours: number;
  package_manager: string;
  shell: string;
  username: string;
  gpu: string;
  kernel: string;
}

export function ServersTab() {
  const { servers, setServers } = useAppStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
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
  const [creatingContainer, setCreatingContainer] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const healthCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const systemInfoInterval = useRef<NodeJS.Timeout | null>(null);

  const addLog = (level: "info" | "error" | "success" | "warn", message: string) => {
    setServerLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      level,
      message
    }]);
  };

  // Get OS type for ASCII art (must be defined before useMemo)
  const getOSType = (): string => {
    if (!systemInfo) return "unknown";
    const os = systemInfo.os.toLowerCase();
    if (os.includes("macos") || os.includes("darwin")) return "macos";
    if (os.includes("windows")) return "windows";
    if (os.includes("linux") || os.includes("ubuntu") || os.includes("debian") || os.includes("fedora")) return "linux";
    return "unknown";
  };

  // Auto-start local server on mount
  useEffect(() => {
    addLog("info", "Initializing BuildForge client...");
    startLocalServer();
    loadSystemInfo(true);
    checkDockerAvailable();
    
    // Start health check interval
    healthCheckInterval.current = setInterval(checkAllServersHealth, 10000); // Every 10 seconds
    
    // Refresh system info every 5 seconds for live CPU/RAM updates
    systemInfoInterval.current = setInterval(() => loadSystemInfo(false), 5000);
    
    return () => {
      if (healthCheckInterval.current) {
        clearInterval(healthCheckInterval.current);
      }
      if (systemInfoInterval.current) {
        clearInterval(systemInfoInterval.current);
      }
    };
  }, []);

  const loadSystemInfo = async (logInfo = false) => {
    try {
      const info = await invoke<SystemInfo>("get_system_info");
      // Always update to get latest values, but React will handle re-render optimization
      setSystemInfo(info);
      if (logInfo) {
        addLog("info", `System: ${info.os} ${info.os_version} (${info.arch})`);
      }
    } catch (error) {
      console.error("Failed to load system info:", error);
      if (logInfo) {
        addLog("error", "Failed to load system information");
      }
    } finally {
      if (!systemInfo) setLoadingSystemInfo(false);
    }
  };
  
  // Memoize ASCII art to prevent re-renders
  const asciiArt = useMemo(() => {
    if (!systemInfo) return "";
    return (OS_ASCII[getOSType()] || []).join('\n');
  }, [systemInfo?.os]);
  
  // Memoize OS color
  const osColor = useMemo(() => {
    const osType = getOSType();
    if (osType === "macos") return "text-cyan-400";
    if (osType === "linux") return "text-yellow-400";
    if (osType === "windows") return "text-blue-400";
    return "text-slate-400";
  }, [systemInfo?.os]);

  // Check if Docker is available
  const checkDockerAvailable = async () => {
    try {
      // First check if Docker command exists
      const versionResult = await invoke<string>("run_command", { 
        command: "docker", 
        args: ["--version"],
        cwd: "/"
      });
      
      if (!versionResult) {
        setDockerEnabled(false);
        return;
      }
      
      addLog("info", "Docker detected: " + versionResult.trim());
      
      // Now check if Docker daemon is actually running
      try {
        await invoke<string>("run_command", { 
          command: "docker", 
          args: ["ps"],
          cwd: "/"
        });
        setDockerEnabled(true);
        addLog("success", "Docker is running and ready");
        loadDockerContainers();
      } catch {
        setDockerEnabled(false);
        addLog("warn", "Docker is installed but not running. Please start Docker Desktop.");
      }
    } catch {
      setDockerEnabled(false);
      addLog("warn", "Docker is not installed. Install from docker.com");
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
          let os: "windows" | "linux" | "macos" = "linux";
          
          if (image?.includes("wine") || image?.includes("windows") || name?.includes("windows")) {
            os = "windows";
          } else if (image?.includes("macos") || image?.includes("osx") || name?.includes("macos")) {
            os = "macos";
          }
          
          return {
            id,
            name,
            os,
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
  const createDockerContainer = async (os: "windows" | "linux" | "macos") => {
    setCreatingContainer(os);
    addLog("info", `Creating ${os} Docker container for cross-platform builds...`);
    
    try {
      let image: string;
      let platform: string | undefined;
      let setupCommands: string[];
      
      if (os === "windows") {
        // ARM64-optimized Wine container (much smaller and faster on Apple Silicon)
        image = "scottyhardy/docker-wine:latest";
        platform = "linux/arm64"; // Use ARM64 for Apple Silicon
        setupCommands = [
          "dpkg --add-architecture i386",
          "apt-get update && apt-get install -y --no-install-recommends curl ca-certificates git build-essential",
          "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
          "apt-get install -y --no-install-recommends nodejs",
          "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal",
          "apt-get clean && rm -rf /var/lib/apt/lists/*"
        ];
      } else if (os === "linux") {
        // ARM64-optimized Alpine Linux (10x smaller than Ubuntu)
        image = "node:20-alpine";
        platform = "linux/arm64";
        setupCommands = [
          "apk add --no-cache curl git build-base openssl-dev pkgconfig gtk+3.0-dev webkit2gtk-dev librsvg-dev patchelf",
          "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal",
          "rm -rf /var/cache/apk/*"
        ];
      } else {
        // ARM64-optimized OSXCross (minimal Alpine base)
        image = "messense/cargo-zigbuild:latest";
        platform = "linux/arm64";
        setupCommands = [
          "apk add --no-cache nodejs npm git",
          "rm -rf /var/cache/apk/*"
        ];
      }
      
      const containerName = `buildforge-${os}-builder`;
      
      // Pull the image with platform specification
      addLog("info", `Pulling ${image} for ${platform}...`);
      const pullArgs = ["pull"];
      if (platform) pullArgs.push("--platform", platform);
      pullArgs.push(image);
      
      await invoke<string>("run_command", {
        command: "docker",
        args: pullArgs,
        cwd: "/"
      });
      
      // Create and start the container with volume mount (no copying needed!)
      addLog("info", `Creating container ${containerName} with persistent volume...`);
      const runArgs = [
        "run", "-d",
        "--name", containerName,
        "--label", "buildforge",
        "-v", "/tmp/buildforge:/workspace", // Shared volume for zero-copy builds
        "--tmpfs", "/tmp:exec", // Fast tmpfs for build artifacts
      ];
      if (platform) runArgs.push("--platform", platform);
      runArgs.push(image, "tail", "-f", "/dev/null");
      
      await invoke<string>("run_command", {
        command: "docker",
        args: runArgs,
        cwd: "/"
      });
      
      addLog("success", `Container created! Installing minimal build dependencies...`);
      
      // Install all build tools
      for (const cmd of setupCommands) {
        addLog("info", `Running: ${cmd.substring(0, 60)}...`);
        try {
          await invoke<string>("run_command", {
            command: "docker",
            args: ["exec", containerName, "sh", "-c", cmd],
            cwd: "/"
          });
        } catch (e: any) {
          addLog("warn", `Setup command failed (may be normal): ${e.toString().substring(0, 100)}`);
        }
      }
      
      addLog("success", `${os} Docker container ready! (optimized for ARM64)`);
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
    } catch (error: unknown) {
      addLog("error", `Failed to remove container: ${error}`);
    }
  };

  // Install Docker based on OS package manager
  const [installingDocker, setInstallingDocker] = useState(false);
  
  const installDocker = async () => {
    if (!systemInfo) return;
    
    setInstallingDocker(true);
    addLog("info", `Installing Docker using ${systemInfo.package_manager}...`);
    
    try {
      const pkgManager = systemInfo.package_manager.toLowerCase();
      let installCmd: { command: string; args: string[] };
      
      if (pkgManager.includes("brew") || pkgManager === "homebrew") {
        // macOS with Homebrew
        installCmd = { command: "brew", args: ["install", "--cask", "docker"] };
        addLog("info", "Using Homebrew to install Docker Desktop...");
      } else if (pkgManager.includes("apt")) {
        // Debian/Ubuntu
        installCmd = { command: "bash", args: ["-c", "curl -fsSL https://get.docker.com | sh"] };
        addLog("info", "Using apt (get.docker.com) to install Docker...");
      } else if (pkgManager.includes("dnf") || pkgManager.includes("yum")) {
        // Fedora/RHEL
        installCmd = { command: "bash", args: ["-c", "curl -fsSL https://get.docker.com | sh"] };
        addLog("info", "Using dnf/yum (get.docker.com) to install Docker...");
      } else if (pkgManager.includes("pacman")) {
        // Arch Linux
        installCmd = { command: "pacman", args: ["-S", "--noconfirm", "docker"] };
        addLog("info", "Using pacman to install Docker...");
      } else if (pkgManager.includes("choco") || pkgManager.includes("winget")) {
        // Windows
        installCmd = { command: "winget", args: ["install", "-e", "--id", "Docker.DockerDesktop"] };
        addLog("info", "Using winget to install Docker Desktop...");
      } else {
        addLog("error", `Unsupported package manager: ${systemInfo.package_manager}. Please install Docker manually.`);
        setInstallingDocker(false);
        return;
      }
      
      await invoke<string>("run_command", {
        command: installCmd.command,
        args: installCmd.args,
        cwd: "/"
      });
      
      addLog("success", "Docker installation completed!");
      
      // Open Docker Desktop on macOS
      if (systemInfo.os.toLowerCase().includes("macos") || systemInfo.os.toLowerCase().includes("darwin")) {
        addLog("info", "Opening Docker Desktop...");
        try {
          await invoke<string>("run_command", {
            command: "open",
            args: ["-a", "Docker"],
            cwd: "/"
          });
          addLog("success", "Docker Desktop is starting...");
        } catch (openError: any) {
          addLog("warn", `Could not auto-open Docker: ${openError}. Please open it manually.`);
        }
      }
      
      // Poll for Docker availability (it takes time to start)
      addLog("info", "Waiting for Docker to be ready...");
      let attempts = 0;
      const maxAttempts = 40; // 40 seconds
      const checkInterval = setInterval(async () => {
        attempts++;
        try {
          const dockerCheck = await invoke<string>("run_command", { 
            command: "docker", 
            args: ["--version"],
            cwd: "/"
          });
          if (dockerCheck) {
            clearInterval(checkInterval);
            setDockerEnabled(true);
            addLog("success", "Docker is now ready!");
            addLog("info", dockerCheck.trim());
            await loadDockerContainers();
          }
        } catch {
          if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            addLog("warn", "Docker is taking longer than expected. Please check Docker Desktop manually.");
            // Still re-check
            setTimeout(() => checkDockerAvailable(), 5000);
          }
        }
      }, 1000);
    } catch (error: unknown) {
      addLog("error", `Failed to install Docker: ${error}`);
      addLog("info", "Please install Docker manually from https://docker.com");
    } finally {
      setInstallingDocker(false);
    }
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
        {/* Local Server Card - Compact with fastfetch-style display */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">Local Server</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowConfigModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium text-white"
              >
                <Settings className="w-4 h-4" />
                Config
              </button>
              {dockerEnabled ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-900/30 border border-green-600 rounded-lg">
                  <Box className="w-4 h-4 text-green-400" />
                  <span className="text-green-400 text-sm font-medium">Docker Running</span>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    addLog("info", "Opening Docker Desktop...");
                    try {
                      await invoke<string>("run_command", {
                        command: "open",
                        args: ["-a", "Docker"],
                        cwd: "/"
                      });
                      addLog("success", "Docker Desktop opened. Waiting for it to start...");
                      setTimeout(() => checkDockerAvailable(), 3000);
                    } catch (e: any) {
                      addLog("error", `Failed to open Docker: ${e}`);
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-red-900/30 border border-red-600 rounded-lg text-sm font-medium text-red-400 hover:bg-red-900/50"
                  title="Click to open Docker Desktop"
                >
                  <Box className="w-4 h-4" />
                  Docker Not Running - Click to Open
                </button>
              )}
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
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Start
                  </>
                )}
              </button>
            </div>
          </div>
          
          {/* Fastfetch-style System Info Card */}
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 font-mono text-sm">
            <div className="flex gap-6">
              {/* ASCII Art */}
              <pre className={`hidden md:block text-xs leading-tight flex-shrink-0 m-0 ${osColor}`}>
                {asciiArt}
              </pre>
              
              {/* System Info - Fastfetch style */}
              {loadingSystemInfo ? (
                <div className="flex-1 flex items-center justify-center text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                  Loading system info...
                </div>
              ) : systemInfo ? (
                <div className="flex-1 space-y-0.5">
                  {/* Header */}
                  <div className="text-cyan-400 font-bold">{systemInfo.username}@{systemInfo.hostname}</div>
                  <div className="text-slate-600">{"─".repeat(Math.min(40, (systemInfo.username + systemInfo.hostname).length + 1))}</div>
                  
                  {/* Info rows */}
                  <div><span className="text-cyan-400">OS</span><span className="text-white">: {systemInfo.os} {systemInfo.os_version} {systemInfo.arch}</span></div>
                  <div><span className="text-cyan-400">Kernel</span><span className="text-white">: {systemInfo.kernel}</span></div>
                  <div><span className="text-cyan-400">Shell</span><span className="text-white">: {systemInfo.shell}</span></div>
                  <div><span className="text-cyan-400">CPU</span><span className="text-white">: {systemInfo.cpu} ({systemInfo.cpu_cores} cores)</span></div>
                  <div className="flex items-center">
                    <span className="text-cyan-400">CPU Usage</span>
                    <span className="text-white">: </span>
                    <div className="flex-1 max-w-32 h-3 bg-slate-700 rounded ml-1 overflow-hidden">
                      <div 
                        className={`h-full transition-all ${
                          systemInfo.cpu_usage_percent > 80 ? 'bg-red-500' :
                          systemInfo.cpu_usage_percent > 50 ? 'bg-yellow-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(100, systemInfo.cpu_usage_percent)}%` }}
                      />
                    </div>
                    <span className="text-white ml-2">{systemInfo.cpu_usage_percent.toFixed(0)}%</span>
                  </div>
                  <div><span className="text-cyan-400">GPU</span><span className="text-white">: {systemInfo.gpu}</span></div>
                  <div className="flex items-center">
                    <span className="text-cyan-400">Memory</span>
                    <span className="text-white">: </span>
                    <div className="flex-1 max-w-32 h-3 bg-slate-700 rounded ml-1 overflow-hidden">
                      <div 
                        className={`h-full transition-all ${
                          (systemInfo.memory_used_gb / systemInfo.memory_total_gb) > 0.8 ? 'bg-red-500' :
                          (systemInfo.memory_used_gb / systemInfo.memory_total_gb) > 0.5 ? 'bg-yellow-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${(systemInfo.memory_used_gb / systemInfo.memory_total_gb) * 100}%` }}
                      />
                    </div>
                    <span className="text-white ml-2">{systemInfo.memory_used_gb.toFixed(1)} / {systemInfo.memory_total_gb.toFixed(1)} GB ({((systemInfo.memory_used_gb / systemInfo.memory_total_gb) * 100).toFixed(0)}%)</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-cyan-400">Disk (/)</span>
                    <span className="text-white">: </span>
                    <div className="flex-1 max-w-32 h-3 bg-slate-700 rounded ml-1 overflow-hidden">
                      <div 
                        className={`h-full transition-all ${
                          (systemInfo.disk_used_gb / systemInfo.disk_total_gb) > 0.9 ? 'bg-red-500' :
                          (systemInfo.disk_used_gb / systemInfo.disk_total_gb) > 0.7 ? 'bg-yellow-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${(systemInfo.disk_used_gb / systemInfo.disk_total_gb) * 100}%` }}
                      />
                    </div>
                    <span className="text-white ml-2">{systemInfo.disk_used_gb.toFixed(0)} / {systemInfo.disk_total_gb.toFixed(0)} GB ({((systemInfo.disk_used_gb / systemInfo.disk_total_gb) * 100).toFixed(0)}%)</span>
                  </div>
                  <div><span className="text-cyan-400">Uptime</span><span className="text-white">: {
                    systemInfo.uptime_hours >= 24 
                      ? `${Math.floor(systemInfo.uptime_hours / 24)} days, ${Math.floor(systemInfo.uptime_hours % 24)} hours`
                      : `${Math.floor(systemInfo.uptime_hours)} hours, ${Math.floor((systemInfo.uptime_hours % 1) * 60)} mins`
                  }</span></div>
                  <div><span className="text-cyan-400">Packages</span><span className="text-white">: {systemInfo.package_manager}</span></div>
                  
                  {/* Color palette like fastfetch */}
                  <div className="flex gap-1 mt-2">
                    {['bg-black', 'bg-red-600', 'bg-green-600', 'bg-yellow-600', 'bg-blue-600', 'bg-purple-600', 'bg-cyan-600', 'bg-white'].map((color, i) => (
                      <div key={i} className={`w-4 h-4 rounded-sm ${color}`} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex-1 text-red-400">Failed to load system information</div>
              )}
            </div>
            
            {/* Server Status Bar */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${localServerRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                  <span className="text-slate-400">localhost:9876</span>
                </div>
                <div className="flex items-center gap-2">
                  <Box className={`w-4 h-4 ${dockerEnabled ? 'text-blue-400' : 'text-slate-600'}`} />
                  <span className="text-slate-400">
                    Docker: {dockerEnabled ? `${dockerContainers.length} containers` : 'disabled'}
                  </span>
                  {!dockerEnabled && (
                    <button
                      onClick={() => setShowConfigModal(true)}
                      className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-500 rounded text-white"
                    >
                      Enable
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">OS:</span>
                <span className="px-2 py-0.5 text-xs rounded bg-purple-500/20 text-purple-400">{getOSType()}</span>
              </div>
            </div>
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

      {/* Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Local Server Configuration</h3>
              <button
                onClick={() => setShowConfigModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Docker Section */}
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Box className="w-5 h-5 text-blue-400" />
                Docker Containers
              </h4>
              
              {dockerEnabled ? (
                <div className="space-y-4">
                  {/* Docker Status */}
                  <div className="flex items-center gap-2 text-sm text-green-400">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Docker is running
                  </div>
                  
                  {/* Existing Containers */}
                  {dockerContainers.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm text-slate-400">Existing Containers</p>
                      {dockerContainers.map((container) => (
                        <div
                          key={container.id}
                          className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-slate-700"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded flex items-center justify-center ${
                              container.os === "linux" ? "bg-orange-500/20" : "bg-blue-500/20"
                            }`}>
                              <ServerIcon className={`w-4 h-4 ${
                                container.os === "linux" ? "text-orange-400" : "text-blue-400"
                              }`} />
                            </div>
                            <div>
                              <p className="text-white text-sm font-medium">{container.name}</p>
                              <p className="text-xs text-slate-500">{container.os} • {container.status}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-xs rounded ${
                              container.status === "running" ? "bg-green-500/20 text-green-400" : "bg-slate-600 text-slate-400"
                            }`}>
                              {container.status}
                            </span>
                            <button
                              onClick={() => deleteDockerContainer(container.id, container.name)}
                              className="p-1.5 text-slate-500 hover:text-red-400 rounded hover:bg-slate-700"
                              title="Remove container"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Create Container Buttons */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {!dockerContainers.find(c => c.os === "linux") && (
                        <button
                          onClick={() => createDockerContainer("linux")}
                          disabled={creatingContainer !== null}
                          className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        >
                          {creatingContainer === "linux" ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Plus className="w-4 h-4" />
                          )}
                          Add Linux Container
                        </button>
                      )}
                      {!dockerContainers.find(c => c.os === "windows") && (
                        <button
                          onClick={() => createDockerContainer("windows")}
                          disabled={creatingContainer !== null}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        >
                          {creatingContainer === "windows" ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Plus className="w-4 h-4" />
                          )}
                          Add Windows Container
                        </button>
                      )}
                      {!dockerContainers.find(c => c.os === "macos") && (
                        <button
                          onClick={() => createDockerContainer("macos")}
                          disabled={creatingContainer !== null}
                          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        >
                          {creatingContainer === "macos" ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Plus className="w-4 h-4" />
                          )}
                          Add macOS Container
                        </button>
                      )}
                    </div>
                    <div className="p-3 bg-slate-800 rounded border border-slate-700">
                      <p className="text-xs text-slate-400 mb-2">
                        <strong className="text-slate-300">Cross-Platform Building:</strong>
                      </p>
                      <ul className="text-xs text-slate-500 space-y-1 ml-4 list-disc">
                        <li>Linux: Docker container with full build environment</li>
                        <li>Windows: Wine-based container with Windows build tools</li>
                        <li>macOS: OSXCross container for macOS cross-compilation</li>
                        <li>Auto-installs dependencies when needed</li>
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 p-4 bg-slate-900 rounded-lg border border-slate-700">
                  <p className="text-sm text-slate-400">
                    Docker is not installed. Install Docker to enable cross-platform builds without additional servers.
                  </p>
                  <button
                    onClick={installDocker}
                    disabled={installingDocker || !systemInfo}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  >
                    {installingDocker ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    {installingDocker ? "Installing..." : `Install Docker (${systemInfo?.package_manager || "detect..."})`}
                  </button>
                  <p className="text-xs text-slate-600">
                    Or install manually from <a href="https://docker.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">docker.com</a>
                  </p>
                </div>
              )}
            </div>

            {/* System Info Section */}
            {systemInfo && (
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-green-400" />
                  System Information
                </h4>
                <div className="grid grid-cols-2 gap-4 p-4 bg-slate-900 rounded-lg border border-slate-700">
                  <div>
                    <p className="text-xs text-slate-500">Hostname</p>
                    <p className="text-white font-mono">{systemInfo.hostname}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">OS</p>
                    <p className="text-white font-mono">{systemInfo.os} {systemInfo.os_version}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">CPU</p>
                    <p className="text-white font-mono">{systemInfo.cpu} ({systemInfo.cpu_cores} cores)</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Architecture</p>
                    <p className="text-white font-mono">{systemInfo.arch}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">GPU</p>
                    <p className="text-white font-mono">{systemInfo.gpu || "Unknown"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Kernel</p>
                    <p className="text-white font-mono">{systemInfo.kernel || "Unknown"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Memory</p>
                    <p className="text-white font-mono">{systemInfo.memory_used_gb.toFixed(1)} / {systemInfo.memory_total_gb.toFixed(1)} GB</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Disk</p>
                    <p className="text-white font-mono">{systemInfo.disk_used_gb.toFixed(1)} / {systemInfo.disk_total_gb.toFixed(1)} GB</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Shell</p>
                    <p className="text-white font-mono">{systemInfo.shell}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Package Manager</p>
                    <p className="text-white font-mono">{systemInfo.package_manager || "Unknown"}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
