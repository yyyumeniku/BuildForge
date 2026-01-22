import { useRef, useState, useCallback, useEffect } from "react";
import React from "react";
import { Plus, Play, Trash2, GitBranch, Package, TestTube, Upload, GitCommit, Download, X, StopCircle, ChevronDown, Loader2, GitBranchPlus, Zap, Terminal, Clock, Link, FileDown } from "lucide-react";
import { useAppStore, type WorkflowNode, type WorkflowConnection, type LocalRepo, type BuildSystem, type RunLogEntry } from "../../store/appStore";
import { invoke } from "@tauri-apps/api/tauri";
import { timerScheduler } from "../../lib/timerScheduler";

// Node type definitions with full info
const NODE_TYPES = [
  { 
    id: "timer", 
    name: "Timer Trigger", 
    icon: Clock, 
    color: "#06b6d4",
    description: "Schedule automatic workflow execution",
    inputs: [],
    outputs: ["trigger"]
  },
  { 
    id: "clone", 
    name: "Clone Repository", 
    icon: Download, 
    color: "#3b82f6",
    description: "Clone from GitHub to local/server",
    inputs: ["trigger"],
    outputs: ["repo"]
  },
  { 
    id: "pull", 
    name: "Pull Updates", 
    icon: Download, 
    color: "#0ea5e9",
    description: "Fetch and sync local repo with remote",
    inputs: ["repo"],
    outputs: ["repo"]
  },
  { 
    id: "sync_push", 
    name: "Sync & Push", 
    icon: Upload, 
    color: "#3b82f6",
    description: "Pull remote changes, then push local commits",
    inputs: ["repo"],
    outputs: ["repo"]
  },
  { 
    id: "push", 
    name: "Push", 
    icon: Upload, 
    color: "#6366f1",
    description: "Push local commits to remote",
    inputs: ["repo"],
    outputs: ["repo"]
  },
  { 
    id: "checkout", 
    name: "Checkout Branch", 
    icon: GitBranch, 
    color: "#06b6d4",
    description: "Switch to a specific branch or tag",
    inputs: ["repo"],
    outputs: ["repo"]
  },
  { 
    id: "build", 
    name: "Build Project", 
    icon: Package, 
    color: "#10b981",
    description: "Run build locally (npm, cargo, wails, etc.)",
    inputs: ["repo"],
    outputs: ["artifacts"]
  },
  { 
    id: "test", 
    name: "Run Tests", 
    icon: TestTube, 
    color: "#f59e0b",
    description: "Execute test suite locally",
    inputs: ["repo"],
    outputs: ["results"]
  },
  { 
    id: "action", 
    name: "Run Action", 
    icon: Zap, 
    color: "#a855f7",
    description: "Execute a local action script",
    inputs: ["repo"],
    outputs: ["result"]
  },
  { 
    id: "commit", 
    name: "Commit Changes", 
    icon: GitCommit, 
    color: "#ec4899",
    description: "Stage and commit changes to the repository",
    inputs: ["repo"],
    outputs: ["repo"]
  },
  { 
    id: "command", 
    name: "Run Command", 
    icon: Terminal, 
    color: "#f97316",
    description: "Execute custom shell command (auto-install if missing)",
    inputs: ["repo"],
    outputs: ["result"]
  },
  { 
    id: "deploy", 
    name: "Create Release", 
    icon: Upload, 
    color: "#8b5cf6",
    description: "Create GitHub release with local build artifacts",
    inputs: ["artifacts"],
    outputs: []
  },
  { 
    id: "link", 
    name: "Link / URL", 
    icon: Link, 
    color: "#3b82f6",
    description: "Send a URL to connected nodes",
    inputs: [],
    outputs: ["url"]
  },
  { 
    id: "download", 
    name: "Download File", 
    icon: FileDown, 
    color: "#10b981",
    description: "Download a file from URL to local path",
    inputs: ["url"],
    outputs: ["filePath"]
  },
];

// Build system detection patterns
const BUILD_SYSTEMS: { system: BuildSystem; files: string[]; buildCmd: string; testCmd: string }[] = [
  { system: "wails", files: ["wails.json"], buildCmd: "wails build", testCmd: "go test ./..." },
  { system: "tauri", files: ["src-tauri/Cargo.toml"], buildCmd: "npm run tauri build -- --debug", testCmd: "cargo test" },
  { system: "electron", files: ["package.json"], buildCmd: "npm run build", testCmd: "npm test" },
  { system: "npm", files: ["package.json", "package-lock.json"], buildCmd: "npm run build", testCmd: "npm test" },
  { system: "yarn", files: ["yarn.lock"], buildCmd: "yarn build", testCmd: "yarn test" },
  { system: "pnpm", files: ["pnpm-lock.yaml"], buildCmd: "pnpm build", testCmd: "pnpm test" },
  { system: "cargo", files: ["Cargo.toml"], buildCmd: "cargo build --release", testCmd: "cargo test" },
  { system: "go", files: ["go.mod"], buildCmd: "go build ./...", testCmd: "go test ./..." },
  { system: "gradle", files: ["build.gradle", "build.gradle.kts"], buildCmd: "./gradlew build", testCmd: "./gradlew test" },
  { system: "maven", files: ["pom.xml"], buildCmd: "mvn package", testCmd: "mvn test" },
  { system: "cmake", files: ["CMakeLists.txt"], buildCmd: "cmake --build .", testCmd: "ctest" },
  { system: "make", files: ["Makefile"], buildCmd: "make", testCmd: "make test" },
  { system: "python", files: ["setup.py", "pyproject.toml"], buildCmd: "pip install -e .", testCmd: "pytest" },
  { system: "dotnet", files: ["*.csproj", "*.fsproj"], buildCmd: "dotnet build", testCmd: "dotnet test" },
];

interface Position { x: number; y: number; }

// Terminal component for workflow runs
function WorkflowTerminal({ 
  logs, 
  isRunning, 
  onClose,
  onStop 
}: { 
  logs: RunLogEntry[]; 
  isRunning: boolean;
  onClose: () => void;
  onStop: () => void;
}) {
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const getLevelColor = (level: RunLogEntry["level"]) => {
    switch (level) {
      case "error": return "text-red-400";
      case "warn": return "text-yellow-400";
      case "success": return "text-green-400";
      case "command": return "text-cyan-400";
      default: return "text-slate-300";
    }
  };

  const getLevelPrefix = (level: RunLogEntry["level"]) => {
    switch (level) {
      case "error": return "[ERROR]";
      case "warn": return "[WARN]";
      case "success": return "[OK]";
      case "command": return "[CMD]";
      default: return "[INFO]";
    }
  };

  return (
    <div className="h-64 bg-slate-950 border-t border-slate-700 flex flex-col">
      <div className="h-8 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          {isRunning && <Loader2 className="w-3 h-3 animate-spin text-green-400" />}
          <span className="text-xs text-slate-400 font-medium">
            {isRunning ? "Running Workflow..." : "Workflow Output"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isRunning && (
            <button
              onClick={onStop}
              className="p-1 hover:bg-red-500/20 rounded text-red-400"
              title="Stop"
            >
              <StopCircle className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded text-slate-400"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div 
        ref={terminalRef}
        className="flex-1 overflow-auto p-3 font-mono text-sm"
      >
        {logs.map((log, i) => (
          <div key={i} className={`${getLevelColor(log.level)} flex gap-2`}>
            <span className="opacity-50 select-none">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <span className="select-none">{getLevelPrefix(log.level)}</span>
            <span className="flex-1">{log.message}</span>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="text-slate-500">No output yet. Press Run to start the workflow.</div>
        )}
      </div>
    </div>
  );
}

// Repo selector dropdown
function RepoSelector({ 
  selectedRepoId, 
  onSelect 
}: { 
  selectedRepoId: string | null;
  onSelect: (repoId: string | null) => void;
}) {
  const { repos } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const selectedRepo = repos.find(r => r.id === selectedRepoId);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-white text-sm min-w-[180px]"
      >
        <GitBranch className="w-4 h-4 text-slate-400" />
        <span className="flex-1 text-left truncate">
          {selectedRepo ? `${selectedRepo.owner}/${selectedRepo.repo}` : "Select Repository"}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>
      
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 w-64 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 py-1 max-h-64 overflow-auto" onWheel={(e) => e.stopPropagation()}>
            {repos.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500">
                No repositories added yet. Add one in the Releases tab.
              </div>
            ) : (
              repos.map(repo => (
                <button
                  key={repo.id}
                  onClick={() => {
                    onSelect(repo.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 hover:bg-slate-700 ${
                    selectedRepoId === repo.id ? "bg-slate-700" : ""
                  }`}
                >
                  <div className="text-sm text-white">
                    {repo.owner}/{repo.repo}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{repo.path}</div>
                  {repo.latestVersion && (
                    <div className="text-xs text-green-400 font-mono mt-0.5">
                      Latest: {repo.latestVersion}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function WorkflowsTab() {
  const { 
    servers, 
    repos,
    workflows,
    selectedWorkflowId,
    currentRun,
    accessToken,
    localActions,
    addWorkflow,
    updateWorkflow,
    removeWorkflow,
    selectWorkflow,
    renameWorkflow,
    startWorkflowRun,
    addRunLog,
    updateRun,
    endWorkflowRun,
    clearCurrentRun,
    updateRepo,
    saveHistory,
  } = useAppStore();
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [nodeContextMenu, setNodeContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [connecting, setConnecting] = useState<{ nodeId: string; isOutput: boolean; startPos: Position } | null>(null);
  const [mousePos, setMousePos] = useState<Position>({ x: 0, y: 0 });
  const [canvasOffset, setCanvasOffset] = useState<Position>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [showTerminal, setShowTerminal] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [showCreateBranch, setShowCreateBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Position>({ x: 0, y: 0 });
  const [rightClickStart, setRightClickStart] = useState<Position | null>(null);
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);
  const [editingWorkflowName, setEditingWorkflowName] = useState("");

  const workflow = workflows.find(w => w.id === selectedWorkflowId);
  const onlineServers = servers.filter(s => s.status === "online");
  const selectedRepo = workflow?.repoId ? repos.find(r => r.id === workflow.repoId) : null;

  // Reference to runWorkflow for timer callback
  const runWorkflowRef = React.useRef<(() => void) | null>(null);

  // Setup timer scheduler to trigger workflows
  useEffect(() => {
    // Set the callback for when timer triggers
    timerScheduler.setTriggerCallback((workflowId) => {
      console.log("Timer triggered workflow:", workflowId);
      const targetWorkflow = workflows.find(w => w.id === workflowId);
      if (targetWorkflow) {
        // Switch to this workflow and run it
        selectWorkflow(workflowId);
        // Small delay to ensure UI updates
        setTimeout(() => {
          if (runWorkflowRef.current) {
            runWorkflowRef.current();
          }
        }, 100);
      }
    });

    // Sync timer schedules with workflow nodes
    workflows.forEach(wf => {
      const timerNode = wf.nodes.find(n => n.type === "timer");
      if (timerNode && timerNode.config.enabled) {
        const timerConfig = {
          mode: (timerNode.config.timerMode || "interval") as "interval" | "daily" | "weekly" | "combined",
          intervalHours: timerNode.config.intervalHours,
          time: timerNode.config.dailyTime || timerNode.config.weeklyTime || timerNode.config.combinedTime,
          dayOfWeek: timerNode.config.weeklyDay || timerNode.config.combinedDay,
          enabled: true,
        };
        timerScheduler.addSchedule(wf.id, timerNode.id, timerConfig);
      } else if (timerNode) {
        // Remove schedule if timer is disabled
        timerScheduler.removeSchedule(`${wf.id}-${timerNode.id}`);
      }
    });

    return () => {
      // Cleanup: remove all schedules on unmount
      timerScheduler.clearAll();
    };
  }, [workflows, selectWorkflow]);

  // Center canvas on nodes when workflow changes
  useEffect(() => {
    if (workflow && workflow.nodes.length > 0 && canvasRef.current) {
      // Calculate bounds of all nodes
      const nodePositions = workflow.nodes.map(n => n.position);
      const minX = Math.min(...nodePositions.map(p => p.x));
      const maxX = Math.max(...nodePositions.map(p => p.x));
      const minY = Math.min(...nodePositions.map(p => p.y));
      const maxY = Math.max(...nodePositions.map(p => p.y));
      
      // Calculate center of nodes
      const centerX = (minX + maxX) / 2 + 100; // +100 for node half-width
      const centerY = (minY + maxY) / 2 + 40;  // +40 for node half-height
      
      // Calculate canvas center
      const canvasWidth = canvasRef.current.clientWidth;
      const canvasHeight = canvasRef.current.clientHeight;
      const canvasCenterX = canvasWidth / 2;
      const canvasCenterY = canvasHeight / 2;
      
      // Set offset to center nodes
      setCanvasOffset({
        x: canvasCenterX - centerX,
        y: canvasCenterY - centerY
      });
    }
  }, [selectedWorkflowId, workflow?.nodes.length]);

  // Fetch branches when repo changes
  useEffect(() => {
    if (selectedRepo?.owner && selectedRepo?.repo && accessToken) {
      fetchBranches(selectedRepo.owner, selectedRepo.repo);
    }
  }, [selectedRepo?.id, accessToken]);

  const fetchBranches = async (owner: string, repo: string) => {
    setLoadingBranches(true);
    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        const branchNames = data.map((b: { name: string }) => b.name);
        setBranches(branchNames);
        
        // Update repo with branches
        if (selectedRepo) {
          updateRepo(selectedRepo.id, { branches: branchNames });
        }
      }
    } catch (e) {
      console.error("Failed to fetch branches:", e);
    } finally {
      setLoadingBranches(false);
    }
  };

  const createBranch = async () => {
    if (!selectedRepo?.owner || !selectedRepo?.repo || !accessToken || !newBranchName.trim()) return;
    
    try {
      // Get the SHA of the default branch
      const refResponse = await fetch(
        `https://api.github.com/repos/${selectedRepo.owner}/${selectedRepo.repo}/git/ref/heads/${selectedRepo.defaultBranch || "main"}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );
      
      if (!refResponse.ok) throw new Error("Failed to get reference");
      
      const refData = await refResponse.json();
      const sha = refData.object.sha;
      
      // Create the new branch
      const createResponse = await fetch(
        `https://api.github.com/repos/${selectedRepo.owner}/${selectedRepo.repo}/git/refs`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ref: `refs/heads/${newBranchName.trim()}`,
            sha,
          }),
        }
      );
      
      if (createResponse.ok) {
        // Refresh branches
        await fetchBranches(selectedRepo.owner, selectedRepo.repo);
        setNewBranchName("");
        setShowCreateBranch(false);
      } else {
        const error = await createResponse.json();
        alert(`Failed to create branch: ${error.message}`);
      }
    } catch (e) {
      console.error("Failed to create branch:", e);
      alert("Failed to create branch");
    }
  };

  // Handle repo selection
  const handleRepoSelect = (repoId: string | null) => {
    if (!workflow) return;
    
    const repo = repos.find(r => r.id === repoId);
    updateWorkflow(workflow.id, { 
      repoId,
      name: repo ? `${repo.owner}/${repo.repo}` : "New Workflow",
      nextVersion: repo?.nextVersion || "0.1",
    });
  };

  // Handle right-click context menu (only if not dragging)
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    
    // Check if this was a drag or a click
    if (rightClickStart) {
      const distance = Math.sqrt(
        Math.pow(e.clientX - rightClickStart.x, 2) + 
        Math.pow(e.clientY - rightClickStart.y, 2)
      );
      
      // If mouse moved more than 5 pixels, it was a drag, not a click
      if (distance > 5) {
        setRightClickStart(null);
        return;
      }
    }
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setContextMenu({
        x: (e.clientX - rect.left - canvasOffset.x) / zoom,
        y: (e.clientY - rect.top - canvasOffset.y) / zoom,
      });
    }
    setRightClickStart(null);
  }, [canvasOffset, zoom, rightClickStart]);

  // Add node at context menu position
  const addNode = (type: string) => {
    if (!workflow || !contextMenu) return;
    
    const newNode: WorkflowNode = {
      id: `node_${Date.now()}`,
      type,
      position: { x: contextMenu.x, y: contextMenu.y },
      config: {},
    };

    // Set default config for different node types
    if (type === "deploy") {
      newNode.config.version = workflow.nextVersion;
      newNode.config.releaseName = `Release ${workflow.nextVersion}`;
    }
    
    if (type === "checkout") {
      newNode.config.branch = selectedRepo?.defaultBranch || "main";
    }
    
    if (type === "build" && selectedRepo?.detectedBuildSystem) {
      const buildInfo = BUILD_SYSTEMS.find(b => b.system === selectedRepo.detectedBuildSystem);
      if (buildInfo) {
        newNode.config.buildSystem = buildInfo.system;
        newNode.config.command = buildInfo.buildCmd;
      }
    }

    updateWorkflow(workflow.id, { 
      nodes: [...workflow.nodes, newNode] 
    });
    saveHistory(); // Save after adding node
    setContextMenu(null);
  };

  // Start dragging node
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    
    const node = workflow?.nodes.find(n => n.id === nodeId);
    if (!node) return;

    setDraggingNode(nodeId);
    setSelectedNode(nodeId);
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: (e.clientX - rect.left - canvasOffset.x) / zoom - node.position.x,
        y: (e.clientY - rect.top - canvasOffset.y) / zoom - node.position.y,
      });
    }
  };

  // Handle mouse move for dragging
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = (e.clientX - rect.left - canvasOffset.x) / zoom;
    const y = (e.clientY - rect.top - canvasOffset.y) / zoom;
    setMousePos({ x, y });
    
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setCanvasOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }
    
    if (draggingNode && workflow) {
      const newX = x - dragOffset.x;
      const newY = y - dragOffset.y;
      
      updateWorkflow(workflow.id, {
        nodes: workflow.nodes.map(n => 
          n.id === draggingNode 
            ? { ...n, position: { x: newX, y: newY } }
            : n
        ),
      });
    }
  }, [draggingNode, dragOffset, canvasOffset, zoom, workflow, updateWorkflow, isPanning, panStart]);

  // Handle mouse up
  const handleMouseUp = () => {
    if (draggingNode) {
      saveHistory(); // Save after moving node
    }
    setDraggingNode(null);
    setConnecting(null);
    setIsPanning(false);
    setRightClickStart(null);
  };

  // Delete selected node
  const deleteNode = (nodeId: string) => {
    if (!workflow) return;
    
    updateWorkflow(workflow.id, {
      nodes: workflow.nodes.filter(n => n.id !== nodeId),
      connections: workflow.connections.filter(c => c.from !== nodeId && c.to !== nodeId),
    });
    saveHistory(); // Save after deleting node
    setSelectedNode(null);
    setNodeContextMenu(null);
  };

  // Replace a node with a different type
  const replaceNode = (nodeId: string, newType: string) => {
    if (!workflow) return;
    
    const oldNode = workflow.nodes.find(n => n.id === nodeId);
    if (!oldNode) return;

    const newNode: WorkflowNode = {
      ...oldNode,
      type: newType,
      config: {}, // Reset config for new type
    };

    // Set default config for specific node types
    if (newType === "deploy") {
      newNode.config.version = workflow.nextVersion;
      newNode.config.releaseName = `Release ${workflow.nextVersion}`;
    }

    updateWorkflow(workflow.id, {
      nodes: workflow.nodes.map(n => n.id === nodeId ? newNode : n),
    });
    saveHistory();
    setNodeContextMenu(null);
  };

  // Delete a connection
  const deleteConnection = (connId: string) => {
    if (!workflow) return;
    
    updateWorkflow(workflow.id, {
      connections: workflow.connections.filter(c => c.id !== connId),
    });
  };

  // Start connection from port
  const startConnection = (nodeId: string, isOutput: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    const node = workflow?.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const startPos = {
      x: node.position.x + (isOutput ? 200 : 0),
      y: node.position.y + 40,
    };
    
    setConnecting({ nodeId, isOutput, startPos });
  };

  // Complete connection
  const completeConnection = (nodeId: string, isInput: boolean) => {
    if (!connecting || !workflow) return;
    if (connecting.isOutput && isInput && connecting.nodeId !== nodeId) {
      // Check if connection already exists
      const exists = workflow.connections.some(
        c => c.from === connecting.nodeId && c.to === nodeId
      );
      
      if (!exists) {
        const newConnection: WorkflowConnection = {
          id: `conn_${Date.now()}`,
          from: connecting.nodeId,
          to: nodeId,
        };
        updateWorkflow(workflow.id, {
          connections: [...workflow.connections, newConnection],
        });
        saveHistory(); // Save after creating connection
      }
    }
    setConnecting(null);
  };

  // Update node config
  const updateNodeConfig = (nodeId: string, key: string, value: unknown) => {
    if (!workflow) return;
    
    updateWorkflow(workflow.id, {
      nodes: workflow.nodes.map(n => 
        n.id === nodeId 
          ? { ...n, config: { ...n.config, [key]: value } }
          : n
      ),
    });
  };

  // Handle zoom - works with regular scroll, stays centered
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const delta = e.deltaY > 0 ? 0.95 : 1.05;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    setZoom(prevZoom => {
      const newZoom = Math.min(2, Math.max(0.25, prevZoom * delta));
      const zoomChange = newZoom / prevZoom;
      
      // Adjust offset to zoom toward mouse position
      setCanvasOffset(prev => ({
        x: mouseX - (mouseX - prev.x) * zoomChange,
        y: mouseY - (mouseY - prev.y) * zoomChange,
      }));
      
      return newZoom;
    });
  }, []);

  // Pan canvas with left mouse drag, right-click for context menu
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { // Left mouse for panning
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      setSelectedNode(null); // Deselect node when clicking canvas
      setNodeContextMenu(null); // Close node context menu
    } else if (e.button === 2) {
      // Right click saves position for context menu
      e.preventDefault();
      setRightClickStart({ x: e.clientX, y: e.clientY });
      setContextMenu(null);
      setNodeContextMenu(null);
    }
  };

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't delete node if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }
      
      // Undo/Redo (Cmd+Z / Cmd+Shift+Z on Mac, Ctrl+Z / Ctrl+Shift+Z on Windows)
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      
      if (modKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useAppStore.getState().undo();
        return;
      }
      
      if (modKey && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        useAppStore.getState().redo();
        return;
      }
      
      if ((e.key === "Delete" || e.key === "Backspace") && selectedNode) {
        e.preventDefault();
        deleteNode(selectedNode);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNode]);

  // Get node position for connection drawing
  const getNodeCenter = (nodeId: string, isOutput: boolean): Position => {
    const node = workflow?.nodes.find(n => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };
    return {
      x: node.position.x + (isOutput ? 200 : 0),
      y: node.position.y + 40,
    };
  };

  // Run the workflow
  const runWorkflow = async () => {
    if (!workflow || workflow.nodes.length === 0) {
      alert("Add some nodes to the workflow first!");
      return;
    }
    
    if (!selectedRepo) {
      alert("Please select a repository first!");
      return;
    }

    setShowTerminal(true);
    startWorkflowRun(workflow.id);
    saveHistory();
    
    addRunLog({ level: "info", message: "Starting workflow execution..." });
    addRunLog({ level: "info", message: `Repository: ${selectedRepo.owner}/${selectedRepo.repo}` });
    addRunLog({ level: "info", message: `Workflow: ${workflow.name}` });
    addRunLog({ level: "info", message: `Working directory: ${selectedRepo.path}` });
    
    try {
      // Sort nodes by connections (topological sort)
      const sortedNodes = topologicalSort(workflow.nodes, workflow.connections);
      const totalNodes = sortedNodes.length;
      
      for (let i = 0; i < sortedNodes.length; i++) {
        const node = sortedNodes[i];
        const nodeType = NODE_TYPES.find(t => t.id === node.type);
        const progress = Math.round(((i + 1) / totalNodes) * 100);
        
        updateRun({ currentNodeId: node.id, progress });
        addRunLog({ level: "info", message: `Executing: ${nodeType?.name || node.type}` });
        
        // Execute actual commands via Tauri
        try {
          switch (node.type) {
            case "clone":
              // Clone repository to a temp build directory
              const tempBuildDir = `/tmp/buildforge-${selectedRepo.repo}-${Date.now()}`;
              addRunLog({ level: "command", message: `git clone https://github.com/${selectedRepo.owner}/${selectedRepo.repo}.git ${tempBuildDir}` });
              
              try {
                await invoke<string>("run_command", { 
                  command: "git",
                  args: ["clone", `https://github.com/${selectedRepo.owner}/${selectedRepo.repo}.git`, tempBuildDir],
                  cwd: "/tmp"
                });
                addRunLog({ level: "success", message: `Cloned to ${tempBuildDir}` });
                
                // Store the build directory for subsequent nodes
                updateNodeConfig(node.id, "buildDir", tempBuildDir);
              } catch (e: any) {
                const cloneError = typeof e === 'string' ? e : JSON.stringify(e);
                addRunLog({ level: "error", message: `Clone failed: ${cloneError}` });
                throw new Error(`Clone failed: ${cloneError}`);
              }
              break;
              
            case "pull":
              // Fetch latest changes from remote
              addRunLog({ level: "command", message: `git fetch origin ${selectedRepo.defaultBranch}` });
              await invoke<string>("run_command", { 
                command: "git",
                args: ["fetch", "origin", selectedRepo.defaultBranch],
                cwd: selectedRepo.path
              });
              
              // Reset to match remote exactly (clean state for building)
              addRunLog({ level: "command", message: `git reset --hard origin/${selectedRepo.defaultBranch}` });
              await invoke<string>("run_command", { 
                command: "git",
                args: ["reset", "--hard", `origin/${selectedRepo.defaultBranch}`],
                cwd: selectedRepo.path
              });
              addRunLog({ level: "success", message: "Repository synced with remote" });
              break;
              
            case "sync_push":
              // Pull any remote changes first (with rebase to keep linear history)
              addRunLog({ level: "info", message: `Syncing with remote repository...` });
              addRunLog({ level: "command", message: `git pull --rebase origin ${selectedRepo.defaultBranch}` });
              try {
                const pullResult = await invoke<string>("run_command", { 
                  command: "git",
                  args: ["pull", "--rebase", "origin", selectedRepo.defaultBranch],
                  cwd: selectedRepo.path
                });
                addRunLog({ level: "success", message: pullResult || "Synced with remote" });
              } catch (e: any) {
                const pullError = typeof e === 'string' ? e : JSON.stringify(e);
                // If already up to date, that's fine
                if (pullError.includes("Already up to date") || pullError.includes("up-to-date")) {
                  addRunLog({ level: "info", message: "Already up to date" });
                } else if (pullError.includes("CONFLICT") || pullError.includes("conflict")) {
                  addRunLog({ level: "error", message: "Merge conflict detected. Resolve conflicts manually." });
                  throw new Error("Merge conflict detected");
                } else {
                  addRunLog({ level: "warn", message: `Pull failed: ${pullError}` });
                  // Continue anyway, the push will fail if there's an issue
                }
              }
              
              // Push local commits with retry logic
              addRunLog({ level: "command", message: `git push origin ${selectedRepo.defaultBranch}` });
              try {
                await invoke<string>("run_command", { 
                  command: "git",
                  args: ["push", "origin", selectedRepo.defaultBranch],
                  cwd: selectedRepo.path
                });
                addRunLog({ level: "success", message: "Pushed to GitHub" });
              } catch (pushError: any) {
                const pushErrorStr = typeof pushError === 'string' ? pushError : JSON.stringify(pushError);
                
                if (pushErrorStr.includes("non-fast-forward") || pushErrorStr.includes("rejected")) {
                  addRunLog({ level: "warn", message: "Push rejected, using force push with lease..." });
                  
                  // Use --force-with-lease which is a safe force push
                  // It only force pushes if no one else has pushed to the branch
                  try {
                    await invoke<string>("run_command", { 
                      command: "git",
                      args: ["push", "--force-with-lease", "origin", selectedRepo.defaultBranch],
                      cwd: selectedRepo.path
                    });
                    addRunLog({ level: "success", message: "Pushed to GitHub (force with lease)" });
                  } catch (forceError: any) {
                    const forceStr = typeof forceError === 'string' ? forceError : JSON.stringify(forceError);
                    addRunLog({ level: "error", message: `Force push failed: ${forceStr}` });
                    throw new Error(`Push failed: ${forceStr}`);
                  }
                } else {
                  addRunLog({ level: "error", message: `Push failed: ${pushErrorStr}` });
                  throw new Error(`Push failed: ${pushErrorStr}`);
                }
              }
              break;

            case "push":
              addRunLog({ level: "info", message: `Checking for commits to push...` });
              addRunLog({ level: "command", message: `git push origin ${selectedRepo.defaultBranch}` });
              
              let pushSucceeded = false;
              try {
                const pushResult = await invoke<string>("run_command", { 
                  command: "git",
                  args: ["push", "origin", selectedRepo.defaultBranch],
                  cwd: selectedRepo.path
                });
                addRunLog({ level: "success", message: pushResult || "Pushed to GitHub" });
                pushSucceeded = true;
              } catch (e: any) {
                const errorStr = typeof e === 'string' ? e : JSON.stringify(e);
                
                // Check if it's a non-fast-forward error
                if (errorStr.includes("non-fast-forward") || errorStr.includes("rejected")) {
                  addRunLog({ level: "warn", message: "Push rejected, pulling changes first..." });
                  
                  // Try to pull and rebase
                  try {
                    await invoke<string>("run_command", { 
                      command: "git",
                      args: ["pull", "--rebase", "origin", selectedRepo.defaultBranch],
                      cwd: selectedRepo.path
                    });
                    addRunLog({ level: "info", message: "Pulled remote changes, retrying push..." });
                    
                    // Retry push
                    await invoke<string>("run_command", { 
                      command: "git",
                      args: ["push", "origin", selectedRepo.defaultBranch],
                      cwd: selectedRepo.path
                    });
                    addRunLog({ level: "success", message: "Pushed to GitHub successfully" });
                    pushSucceeded = true;
                  } catch (retryError: any) {
                    const retryErrorStr = typeof retryError === 'string' ? retryError : JSON.stringify(retryError);
                    addRunLog({ level: "error", message: `Push failed after pull: ${retryErrorStr}` });
                    throw new Error(`Push failed: ${retryErrorStr}`);
                  }
                } else {
                  addRunLog({ level: "error", message: `Push failed: ${errorStr}` });
                  throw new Error(`Push failed: ${errorStr}`);
                }
              }
              
              if (!pushSucceeded) {
                throw new Error("Push failed");
              }
              break;
              
            case "checkout":
              const branch = node.config.branch || "main";
              addRunLog({ level: "command", message: `git checkout ${branch}` });
              
              try {
                // First try to checkout the branch
                const checkoutResult = await invoke<string>("run_command", { 
                  command: "git",
                  args: ["checkout", branch],
                  cwd: selectedRepo.path
                });
                addRunLog({ level: "success", message: checkoutResult || `Switched to branch: ${branch}` });
              } catch (e: any) {
                const errorStr = typeof e === 'string' ? e : JSON.stringify(e);
                
                // If branch doesn't exist locally, try to fetch and checkout
                if (errorStr.includes("did not match") || errorStr.includes("pathspec")) {
                  addRunLog({ level: "info", message: `Branch ${branch} not found locally, fetching...` });
                  
                  try {
                    // Fetch from remote
                    await invoke<string>("run_command", { 
                      command: "git",
                      args: ["fetch", "origin"],
                      cwd: selectedRepo.path
                    });
                    
                    // Checkout with -b to create and track remote branch
                    const remoteCheckoutResult = await invoke<string>("run_command", { 
                      command: "git",
                      args: ["checkout", "-b", branch, `origin/${branch}`],
                      cwd: selectedRepo.path
                    });
                    addRunLog({ level: "success", message: remoteCheckoutResult || `Switched to branch: ${branch}` });
                  } catch (remoteError: any) {
                    addRunLog({ level: "error", message: `Failed to checkout branch: ${remoteError}` });
                    throw new Error(`Failed to checkout branch ${branch}`);
                  }
                } else {
                  addRunLog({ level: "error", message: `Checkout failed: ${errorStr}` });
                  throw new Error(`Checkout failed: ${errorStr}`);
                }
              }
              break;
              
            case "build":
              addRunLog({ level: "info", message: "=== BUILD NODE START ===" });
              const buildCmd = node.config.command || detectBuildCommand(selectedRepo);
              const targetOS = node.config.targetOS || "local";
              
              // Debug logging
              addRunLog({ level: "info", message: `Repository path: ${selectedRepo.path}` });
              addRunLog({ level: "info", message: `Detected build system: ${selectedRepo.detectedBuildSystem || 'NONE'}` });
              addRunLog({ level: "info", message: `Build command: ${buildCmd}` });
              addRunLog({ level: "info", message: `Target platform: ${targetOS}` });
              
              if (!buildCmd || buildCmd.trim() === "") {
                addRunLog({ level: "error", message: "No build command could be determined!" });
                addRunLog({ level: "error", message: "Please specify a custom build command in the node properties." });
                throw new Error("No build command detected. Make sure the repository has a valid build system.");
              }
              
              // Find the build directory - check if a clone node ran before and has a buildDir
              const cloneNode = sortedNodes.find(n => n.type === "clone" && n.config.buildDir);
              const buildDirectory = cloneNode?.config.buildDir || selectedRepo.path;
              
              // Determine where to run the build based on target OS
              const runBuildOnPlatform = async (platform: string, cmd: string, args: string[], cwd: string) => {
                // Check if we need to route to a different server or Docker
                if (platform !== "local") {
                  // Check for a matching server
                  const matchingServer = servers.find(s => 
                    s.status === "online" && 
                    (s.targetOS === platform || s.targetOS === "any")
                  );
                  
                  if (matchingServer && matchingServer.id !== "localhost") {
                    addRunLog({ level: "info", message: `Routing build to server: ${matchingServer.name} (${matchingServer.targetOS})` });
                    // In real implementation, would send build over WebSocket to remote server
                    addRunLog({ level: "warn", message: "Remote server builds not yet implemented, checking Docker..." });
                  }
                  
                  // Check for Docker container
                  try {
                    // Use unified container for all platforms
                    const containerName = "buildforge-builder";
                    addRunLog({ level: "info", message: `Checking for Docker container: ${containerName}` });
                    
                    // Check if container exists and is running
                    const containerCheck = await invoke<string>("run_command", {
                      command: "docker",
                      args: ["ps", "-a", "--filter", `name=${containerName}`, "--format", "{{.Status}}"],
                      cwd: "/"
                    });
                    
                    if (containerCheck && containerCheck.trim()) {
                      addRunLog({ level: "info", message: `Found Docker container: ${containerCheck.trim()}` });
                      
                      // Start container if stopped
                      if (!containerCheck.toLowerCase().includes("up")) {
                        addRunLog({ level: "info", message: "Starting Docker container..." });
                        await invoke<string>("run_command", {
                          command: "docker",
                          args: ["start", containerName],
                          cwd: "/"
                        });
                      }
                      
                      // Use Docker volume - NO COPYING! Mount source directly for speed
                      addRunLog({ level: "info", message: "Using shared volume (zero-copy build)..." });
                      
                      // Create symlink in container to actual workspace
                      try {
                        await invoke<string>("run_command", {
                          command: "docker",
                          args: ["exec", containerName, "sh", "-c", `ln -sf /workspace ${cwd} || true`],
                          cwd: "/"
                        });
                      } catch {
                        // If symlink fails, fall back to copying (only as last resort)
                        addRunLog({ level: "warn", message: "Volume mount failed, copying files..." });
                        await invoke<string>("run_command", {
                          command: "docker",
                          args: ["cp", cwd, `${containerName}:/workspace/`],
                          cwd: "/"
                        });
                      }
                      
                      // Use container path, not host path!
                      const workspaceInContainer = `/workspace/${selectedRepo.repo}`;
                      
                      // Auto-install dependencies based on detected build system
                      addRunLog({ level: "info", message: "Checking and installing dependencies..." });
                      
                      // Check for package manager files and install dependencies
                      const installCommands: string[] = [];
                      
                      // Node.js projects
                      try {
                        const pkgCheck = await invoke<string>("run_command", {
                          command: "docker",
                          args: ["exec", "-w", workspaceInContainer, containerName, "test", "-f", "package.json"],
                          cwd: "/"
                        });
                        if (pkgCheck !== undefined) {
                          installCommands.push("npm install || yarn install || pnpm install");
                        }
                      } catch {}
                      
                      // Rust projects
                      try {
                        const cargoCheck = await invoke<string>("run_command", {
                          command: "docker",
                          args: ["exec", "-w", workspaceInContainer, containerName, "test", "-f", "Cargo.toml"],
                          cwd: "/"
                        });
                        if (cargoCheck !== undefined) {
                          installCommands.push("source $HOME/.cargo/env || true");
                        }
                      } catch {}
                      
                      // Go projects
                      try {
                        const goCheck = await invoke<string>("run_command", {
                          command: "docker",
                          args: ["exec", "-w", workspaceInContainer, containerName, "test", "-f", "go.mod"],
                          cwd: "/"
                        });
                        if (goCheck !== undefined) {
                          installCommands.push("go mod download");
                        }
                      } catch {}
                      
                      // Python projects
                      try {
                        const pyCheck = await invoke<string>("run_command", {
                          command: "docker",
                          args: ["exec", "-w", workspaceInContainer, containerName, "test", "-f", "requirements.txt"],
                          cwd: "/"
                        });
                        if (pyCheck !== undefined) {
                          installCommands.push("pip install -r requirements.txt || pip3 install -r requirements.txt");
                        }
                      } catch {}
                      
                      // Run dependency installation
                      for (const installCmd of installCommands) {
                        try {
                          addRunLog({ level: "info", message: `Installing: ${installCmd}` });
                          await invoke<string>("run_command", {
                            command: "docker",
                            args: ["exec", "-w", workspaceInContainer, containerName, "sh", "-c", installCmd],
                            cwd: "/"
                          });
                        } catch (e: any) {
                          addRunLog({ level: "warn", message: `Install command failed (may be normal): ${e}` });
                        }
                      }
                      
                      // Run build in container
                      addRunLog({ level: "command", message: `docker exec ${containerName} ${cmd} ${args.join(" ")}` });
                      const dockerResult = await invoke<string>("run_command", {
                        command: "docker",
                        args: ["exec", "-w", workspaceInContainer, containerName, "sh", "-c", `source $HOME/.cargo/env 2>/dev/null || true; ${cmd} ${args.join(" ")}`],
                        cwd: "/"
                      });
                      
                      // NO need to copy artifacts back - using shared volume!
                      addRunLog({ level: "success", message: "Build complete! Artifacts available at: " + cwd });
                      
                      return dockerResult;
                    } else {
                      addRunLog({ level: "warn", message: `No Docker container for ${platform}. Create one in Servers tab.` });
                      addRunLog({ level: "info", message: "Checking for cross-compilation support..." });
                    }
                  } catch (dockerError: any) {
                    addRunLog({ level: "warn", message: `Docker not available: ${dockerError}` });
                    addRunLog({ level: "info", message: "Checking for cross-compilation support..." });
                  }
                  
                  // Cross-compilation for Windows on macOS/Linux
                  if (platform === "windows") {
                    addRunLog({ level: "info", message: "Setting up Windows cross-compilation..." });
                    
                    // Check if it's a Tauri build
                    if (cmd === "npm" && args.some(arg => arg.includes("tauri"))) {
                      addRunLog({ level: "info", message: "Detected Tauri project - configuring Windows target" });
                      
                      // Install Rust Windows target if not already installed
                      try {
                        addRunLog({ level: "command", message: "rustup target add x86_64-pc-windows-gnu" });
                        await invoke<string>("run_command", {
                          command: "rustup",
                          args: ["target", "add", "x86_64-pc-windows-gnu"],
                          cwd: cwd
                        });
                        addRunLog({ level: "success", message: "Windows Rust target installed" });
                      } catch (e: any) {
                        addRunLog({ level: "warn", message: "Could not add Rust target (may already be installed)" });
                      }
                      
                      // Modify the build command to target Windows
                      const modifiedArgs = [...args, "--target", "x86_64-pc-windows-gnu"];
                      addRunLog({ level: "command", message: `${cmd} ${modifiedArgs.join(" ")}` });
                      addRunLog({ level: "info", message: "Building for Windows with cross-compilation..." });
                      
                      try {
                        const result = await invoke<string>("run_command", { 
                          command: cmd,
                          args: modifiedArgs,
                          cwd: cwd
                        });
                        addRunLog({ level: "success", message: "Windows build completed via cross-compilation" });
                        return result;
                      } catch (buildError: any) {
                        const errorStr = typeof buildError === 'string' ? buildError : JSON.stringify(buildError);
                        if (errorStr.includes("mingw") || errorStr.includes("linker")) {
                          addRunLog({ level: "error", message: "mingw-w64 not found. Install it to cross-compile for Windows:" });
                          addRunLog({ level: "info", message: "  macOS: brew install mingw-w64" });
                          addRunLog({ level: "info", message: "  Linux: sudo apt install mingw-w64" });
                        }
                        throw buildError;
                      }
                    }
                  }
                }
                
                // Run locally
                return await invoke<string>("run_command", { 
                  command: cmd,
                  args: args,
                  cwd: cwd
                });
              };
              
              // Run build (handles routing)
              addRunLog({ level: "command", message: `${buildCmd}` });
              addRunLog({ level: "info", message: `Working directory: ${buildDirectory}` });
              
              // Parse command and args more carefully
              const buildCmdParts = buildCmd.split(" ").filter(p => p.trim() !== "");
              const buildCommand = buildCmdParts[0];
              const buildArgs = buildCmdParts.slice(1);
              
              addRunLog({ level: "info", message: `Command: ${buildCommand}` });
              addRunLog({ level: "info", message: `Arguments: [${buildArgs.join(', ')}]` });
              
              try {
                addRunLog({ level: "info", message: "Invoking build..." });
                
                // If targeting all platforms, run IN PARALLEL for maximum speed
                if (targetOS === "all") {
                  const platforms = ["linux", "windows", "macos"];
                  addRunLog({ level: "info", message: "Building for ALL platforms in parallel..." });
                  
                  const buildPromises = platforms.map(async (platform) => {
                    addRunLog({ level: "info", message: `--- Starting ${platform} build ---` });
                    try {
                      const result = await runBuildOnPlatform(platform, buildCommand, buildArgs, buildDirectory);
                      addRunLog({ level: "success", message: `${platform} build completed!` });
                      addRunLog({ level: "success", message: result || "(no output)" });
                      return { platform, success: true, result };
                    } catch (platformError: any) {
                      addRunLog({ level: "warn", message: `${platform} build failed: ${platformError}` });
                      return { platform, success: false, error: platformError };
                    }
                  });
                  
                  // Wait for all builds to complete
                  const results = await Promise.allSettled(buildPromises);
                  const successCount = results.filter(r => r.status === "fulfilled").length;
                  addRunLog({ level: "info", message: `Parallel builds complete: ${successCount}/${platforms.length} succeeded` });
                } else {
                  const buildResult = await runBuildOnPlatform(targetOS, buildCommand, buildArgs, buildDirectory);
                  addRunLog({ level: "success", message: "Build output:" });
                  addRunLog({ level: "success", message: buildResult || "(no output)" });
                }
                
                addRunLog({ level: "info", message: "=== BUILD NODE COMPLETE ===" });
                
                // Find build artifacts using custom pattern or auto-detect
                const artifactPattern = node.config.artifactPattern;
                let artifactPaths: string[] = [];
                
                if (artifactPattern) {
                  // User specified artifact pattern
                  addRunLog({ level: "info", message: `Looking for artifacts matching: ${artifactPattern}` });
                  try {
                    const findResult = await invoke<string>("run_command", {
                      command: "find",
                      args: [buildDirectory, "-name", artifactPattern, "-type", "f"],
                      cwd: buildDirectory
                    });
                    artifactPaths = findResult.split("\n").filter(p => p.trim());
                  } catch {
                    artifactPaths = [`${buildDirectory}/${artifactPattern}`];
                  }
                } else {
                  // Auto-detect based on build system and verify files exist
                  addRunLog({ level: "info", message: "Auto-detecting build artifacts..." });
                  const detectedSystem = selectedRepo.detectedBuildSystem;
                  const potentialPaths: string[] = [];
                  
                  // Define all possible artifact locations for each build system
                  if (detectedSystem === "tauri") {
                    potentialPaths.push(
                      `${buildDirectory}/src-tauri/target/release`,
                      `${buildDirectory}/src-tauri/target/debug`,
                      `${buildDirectory}/src-tauri/target/*/release`,
                      `${buildDirectory}/src-tauri/target/*/debug`,
                      `${buildDirectory}/src-tauri/target/release/bundle`,
                      `${buildDirectory}/src-tauri/target/debug/bundle`
                    );
                  } else if (detectedSystem === "cargo") {
                    potentialPaths.push(
                      `${buildDirectory}/target/release`,
                      `${buildDirectory}/target/debug`,
                      `${buildDirectory}/target/*/release`,
                      `${buildDirectory}/target/*/debug`
                    );
                  } else if (detectedSystem === "npm" || detectedSystem === "yarn" || detectedSystem === "pnpm" || detectedSystem === "electron") {
                    potentialPaths.push(
                      `${buildDirectory}/dist`,
                      `${buildDirectory}/build`,
                      `${buildDirectory}/out`,
                      `${buildDirectory}/output`,
                      `${buildDirectory}/.next`,
                      `${buildDirectory}/dist-electron`
                    );
                  } else if (detectedSystem === "go") {
                    potentialPaths.push(
                      `${buildDirectory}/bin`,
                      `${buildDirectory}/build`,
                      buildDirectory
                    );
                  } else if (detectedSystem === "gradle") {
                    potentialPaths.push(
                      `${buildDirectory}/build/libs`,
                      `${buildDirectory}/build/outputs`,
                      `${buildDirectory}/app/build/outputs`
                    );
                  } else if (detectedSystem === "maven") {
                    potentialPaths.push(
                      `${buildDirectory}/target`,
                      `${buildDirectory}/target/release`
                    );
                  } else if (detectedSystem === "cmake" || detectedSystem === "make") {
                    potentialPaths.push(
                      `${buildDirectory}/build`,
                      `${buildDirectory}/bin`,
                      `${buildDirectory}/out`
                    );
                  } else if (detectedSystem === "dotnet") {
                    potentialPaths.push(
                      `${buildDirectory}/bin/Release`,
                      `${buildDirectory}/bin/Debug`,
                      `${buildDirectory}/publish`
                    );
                  } else if (detectedSystem === "python") {
                    potentialPaths.push(
                      `${buildDirectory}/dist`,
                      `${buildDirectory}/build`,
                      `${buildDirectory}/.eggs`
                    );
                  } else {
                    // Unknown build system - search for common output patterns
                    potentialPaths.push(
                      `${buildDirectory}/dist`,
                      `${buildDirectory}/build`,
                      `${buildDirectory}/out`,
                      `${buildDirectory}/bin`,
                      `${buildDirectory}/target`
                    );
                  }
                  
                  // Check which paths actually exist and contain files
                  for (const path of potentialPaths) {
                    try {
                      const checkResult = await invoke<string>("run_command", {
                        command: "find",
                        args: [path, "-type", "f", "-o", "-type", "d"],
                        cwd: buildDirectory
                      });
                      if (checkResult && checkResult.trim()) {
                        artifactPaths.push(path);
                        addRunLog({ level: "success", message: `Found artifacts at: ${path}` });
                        break; // Found artifacts, stop searching
                      }
                    } catch {
                      // Path doesn't exist, continue
                    }
                  }
                  
                  // If still no artifacts found, try finding ANY executable or bundle
                  if (artifactPaths.length === 0) {
                    addRunLog({ level: "info", message: "Searching for executables and archives..." });
                    try {
                      const findExec = await invoke<string>("run_command", {
                        command: "find",
                        args: [buildDirectory, "-type", "f", "(", "-name", "*.exe", "-o", "-name", "*.app", "-o", "-name", "*.dmg", "-o", "-name", "*.deb", "-o", "-name", "*.rpm", "-o", "-name", "*.msi", "-o", "-name", "*.zip", "-o", "-name", "*.tar.gz", "-o", "-perm", "+111", ")"],
                        cwd: buildDirectory
                      });
                      const foundFiles = findExec.split("\n").filter(p => p.trim() && !p.includes("/node_modules/") && !p.includes("/.git/"));
                      if (foundFiles.length > 0) {
                        artifactPaths = foundFiles;
                        addRunLog({ level: "success", message: `Found ${foundFiles.length} artifact(s)` });
                      }
                    } catch {
                      addRunLog({ level: "warn", message: "No artifacts found. Defaulting to build directory." });
                      artifactPaths = [buildDirectory];
                    }
                  }
                }
                
                // Store artifact paths for deploy node
                if (artifactPaths.length > 0) {
                  updateNodeConfig(node.id, "artifactPaths", JSON.stringify(artifactPaths));
                  addRunLog({ level: "info", message: `Artifact locations: ${artifactPaths.join(", ")}` });
                } else {
                  addRunLog({ level: "warn", message: "No artifacts detected. Check build output." });
                }
              } catch (e: any) {
                addRunLog({ level: "error", message: "=== BUILD FAILED ===" });
                const buildError = typeof e === 'string' ? e : (e.message || JSON.stringify(e));
                addRunLog({ level: "error", message: `Error: ${buildError}` });
                addRunLog({ level: "error", message: "Check that the build command is correct and dependencies are installed." });
                throw new Error(`Build failed: ${buildError}`);
              }
              break;
              
            case "test":
              const testCmd = detectTestCommand(selectedRepo);
              addRunLog({ level: "command", message: testCmd });
              const [testCommand, ...testArgs] = testCmd.split(" ");
              const testResult = await invoke<string>("run_command", { 
                command: testCommand,
                args: testArgs,
                cwd: selectedRepo.path
              });
              addRunLog({ level: "success", message: testResult || "All tests passed" });
              break;
              
            case "action":
              const actionId = node.config.actionId;
              if (!actionId) {
                throw new Error("No action selected for this node");
              }
              
              const action = localActions.find(a => a.id === actionId);
              if (!action) {
                throw new Error(`Action not found: ${actionId}`);
              }
              
              addRunLog({ level: "command", message: `Running action: ${action.name}` });
              
              // Build the script with input variables
              let actionScript = action.script;
              const inputs = node.config.actionInputs || {};
              for (const input of action.inputs) {
                const value = inputs[input.name] || input.default || "";
                addRunLog({ level: "info", message: `  ${input.name}="${value}"` });
              }
              
              // Prepare environment variables
              const envSetup = action.inputs
                .map(input => {
                  const value = inputs[input.name] || input.default || "";
                  return `export ${input.name}="${value}"`;
                })
                .join("\n");
              
              const fullScript = `${envSetup}\n${actionScript}`;
              
              try {
                const actionResult = await invoke<string>("run_command", { 
                  command: "bash",
                  args: ["-c", fullScript],
                  cwd: selectedRepo?.path || "/tmp"
                });
                addRunLog({ level: "success", message: actionResult || "Action completed successfully" });
              } catch (e: any) {
                const actionError = typeof e === 'string' ? e : JSON.stringify(e);
                addRunLog({ level: "error", message: `Action failed: ${actionError}` });
                throw new Error(`Action failed: ${actionError}`);
              }
              break;
              
            case "command":
              const customCmd = node.config.command;
              if (!customCmd || customCmd.trim() === "") {
                throw new Error("No command specified. Please configure the command node.");
              }
              
              addRunLog({ level: "info", message: `Executing custom command: ${customCmd}` });
              
              // Parse command - first word is the executable
              const customCmdParts = customCmd.trim().split(/\s+/);
              const executable = customCmdParts[0];
              const cmdArgs = customCmdParts.slice(1);
              
              try {
                addRunLog({ level: "info", message: `Checking if '${executable}' is available...` });
                
                // Try to run the command
                const cmdResult = await invoke<string>("run_command", {
                  command: executable,
                  args: cmdArgs,
                  cwd: selectedRepo.path
                });
                addRunLog({ level: "success", message: cmdResult || "Command executed successfully" });
              } catch (e: any) {
                const errorStr = typeof e === 'string' ? e : (e.message || JSON.stringify(e));
                
                // Check if it's a "command not found" error
                if (errorStr.includes("not found") || errorStr.includes("Failed to execute")) {
                  addRunLog({ level: "warn", message: `Command '${executable}' not found` });
                  
                  // Ask user if they want to install it
                  const shouldInstall = confirm(
                    `Command '${executable}' is not installed.\n\n` +
                    `Would you like to install it using your system package manager?\n\n` +
                    `This will run a package manager command (brew, apt, pacman, etc.)`
                  );
                  
                  if (shouldInstall) {
                    addRunLog({ level: "info", message: `Installing '${executable}'...` });
                    try {
                      await invoke<string>("install_package", {
                        packageName: executable
                      });
                      addRunLog({ level: "success", message: `Successfully installed '${executable}'` });
                      
                      // Try running the command again
                      addRunLog({ level: "info", message: "Retrying command..." });
                      const retryResult = await invoke<string>("run_command", {
                        command: executable,
                        args: cmdArgs,
                        cwd: selectedRepo.path
                      });
                      addRunLog({ level: "success", message: retryResult || "Command executed successfully" });
                    } catch (installError: any) {
                      const installErr = typeof installError === 'string' ? installError : JSON.stringify(installError);
                      addRunLog({ level: "error", message: `Failed to install: ${installErr}` });
                      throw new Error(`Failed to install ${executable}: ${installErr}`);
                    }
                  } else {
                    throw new Error(`Command '${executable}' not found and installation was declined`);
                  }
                } else {
                  addRunLog({ level: "error", message: `Command failed: ${errorStr}` });
                  throw new Error(`Command failed: ${errorStr}`);
                }
              }
              break;
              
            case "commit":
              const commitMsg = node.config.commitMessage || `Build ${workflow.nextVersion}`;
              addRunLog({ level: "info", message: `Committing changes in ${selectedRepo.path}` });
              addRunLog({ level: "command", message: `git add . && git commit -m "${commitMsg}"` });
              
              // Stage all changes
              try {
                addRunLog({ level: "info", message: "Staging all changes..." });
                const addResult = await invoke<string>("run_command", { 
                  command: "git",
                  args: ["add", "."],
                  cwd: selectedRepo.path
                });
                addRunLog({ level: "info", message: addResult || "Files staged" });
              } catch (e: any) {
                const stageError = typeof e === 'string' ? e : JSON.stringify(e);
                addRunLog({ level: "error", message: `Failed to stage files: ${stageError}` });
                throw new Error(`Git add failed: ${stageError}`);
              }
              
              // Commit changes (handle "nothing to commit" case)
              try {
                addRunLog({ level: "info", message: "Creating commit..." });
                const commitResult = await invoke<string>("run_command", { 
                  command: "git",
                  args: ["commit", "-m", commitMsg],
                  cwd: selectedRepo.path
                });
                addRunLog({ level: "success", message: commitResult || "Changes committed" });
                addRunLog({ level: "info", message: "Commit completed successfully" });
              } catch (e: any) {
                const errorStr = typeof e === 'string' ? e : JSON.stringify(e);
                console.error("Commit error:", e); // Debug log
                
                if (errorStr.includes("nothing to commit") || errorStr.includes("no changes") || errorStr.includes("working tree clean")) {
                  addRunLog({ level: "warn", message: "No changes to commit, continuing..." });
                } else if (errorStr.includes("user.email") || errorStr.includes("user.name") || errorStr.includes("identity")) {
                  addRunLog({ level: "error", message: "Git user not configured. Run in terminal:" });
                  addRunLog({ level: "error", message: "  git config user.name 'Your Name'" });
                  addRunLog({ level: "error", message: "  git config user.email 'you@example.com'" });
                  throw new Error("Git user not configured");
                } else {
                  addRunLog({ level: "error", message: `Commit error details: ${errorStr}` });
                  throw new Error(`Git commit failed: ${errorStr}`);
                }
              }
              break;

            case "deploy":
              if (!accessToken) {
                throw new Error("GitHub access token required for releases");
              }
              const version = node.config.version || workflow.nextVersion;
              const releaseName = node.config.releaseName || `Release v${version}`;
              // Sanitize tag name - git tags cannot have spaces or special characters
              const sanitizedVersion = version.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.-]/g, '');
              const tagName = `v${sanitizedVersion}`;
              
              addRunLog({ level: "info", message: `Preparing release v${sanitizedVersion}...` });
              if (version !== sanitizedVersion) {
                addRunLog({ level: "warn", message: `Tag name sanitized: "${version}" → "${sanitizedVersion}"` });
              }
              
              // Find build directory from clone node if it exists
              const cloneNodeForDeploy = sortedNodes.find(n => n.type === "clone" && n.config.buildDir);
              const buildDir = cloneNodeForDeploy?.config.buildDir || selectedRepo.path;
              
              // Create git tag first
              addRunLog({ level: "command", message: `git tag ${tagName}` });
              try {
                await invoke<string>("run_command", { 
                  command: "git",
                  args: ["tag", "-a", tagName, "-m", releaseName],
                  cwd: selectedRepo.path
                });
                addRunLog({ level: "success", message: `Tag ${tagName} created` });
              } catch (tagError: any) {
                const tagErrorStr = typeof tagError === 'string' ? tagError : JSON.stringify(tagError);
                if (tagErrorStr.includes("already exists")) {
                  addRunLog({ level: "warn", message: `Tag ${tagName} already exists, using existing tag` });
                } else {
                  addRunLog({ level: "error", message: `Failed to create tag: ${tagErrorStr}` });
                  throw new Error(`Failed to create tag: ${tagErrorStr}`);
                }
              }
              
              // Push tag to remote
              addRunLog({ level: "command", message: `git push origin ${tagName}` });
              try {
                await invoke<string>("run_command", { 
                  command: "git",
                  args: ["push", "origin", tagName],
                  cwd: selectedRepo.path
                });
                addRunLog({ level: "success", message: `Tag pushed to remote` });
              } catch (pushTagError: any) {
                const pushErrorStr = typeof pushTagError === 'string' ? pushTagError : JSON.stringify(pushTagError);
                if (pushErrorStr.includes("already exists")) {
                  addRunLog({ level: "warn", message: `Tag already exists on remote` });
                } else {
                  addRunLog({ level: "error", message: `Failed to push tag: ${pushErrorStr}` });
                  throw new Error(`Failed to push tag: ${pushErrorStr}`);
                }
              }
              
              // Now create release via GitHub API
              addRunLog({ level: "command", message: `Creating GitHub release ${tagName}...` });
              
              // First check if release already exists
              const existingReleaseCheck = await fetch(
                `https://api.github.com/repos/${selectedRepo.owner}/${selectedRepo.repo}/releases/tags/${tagName}`,
                {
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: "application/vnd.github.v3+json",
                  },
                }
              );
              
              let release;
              if (existingReleaseCheck.ok) {
                // Release exists - ask user what to do
                release = await existingReleaseCheck.json();
                addRunLog({ level: "warn", message: `Release ${tagName} already exists` });
                addRunLog({ level: "info", message: `Using existing release: ${release.html_url}` });
              } else {
                // Create new release
                const releaseResponse = await fetch(
                  `https://api.github.com/repos/${selectedRepo.owner}/${selectedRepo.repo}/releases`,
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${accessToken}`,
                      Accept: "application/vnd.github.v3+json",
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      tag_name: tagName,
                      name: releaseName,
                      body: `## ${releaseName}\n\nAutomated release created by BuildForge\n\n### Changes\n- Built from ${selectedRepo.defaultBranch} branch`,
                      draft: false,
                      prerelease: false,
                    }),
                  }
                );
                
                if (!releaseResponse.ok) {
                  const error = await releaseResponse.text();
                  // Check if it's a duplicate error
                  if (error.includes("already_exists")) {
                    addRunLog({ level: "warn", message: `Release already exists, fetching existing...` });
                    const existingRelease = await fetch(
                      `https://api.github.com/repos/${selectedRepo.owner}/${selectedRepo.repo}/releases/tags/${tagName}`,
                      {
                        headers: {
                          Authorization: `Bearer ${accessToken}`,
                          Accept: "application/vnd.github.v3+json",
                        },
                      }
                    );
                    if (existingRelease.ok) {
                      release = await existingRelease.json();
                    } else {
                      throw new Error(`Failed to create or fetch release: ${error}`);
                    }
                  } else {
                    throw new Error(`Failed to create release: ${error}`);
                  }
                } else {
                  release = await releaseResponse.json();
                  addRunLog({ level: "success", message: `Release ${tagName} created!` });
                }
              }
              
              addRunLog({ level: "info", message: `URL: ${release.html_url}` });
              
              // Get artifacts from previous build node
              const buildNode = sortedNodes.find(n => n.type === "build");
              let artifactPaths: string[] = [];
              
              if (buildNode?.config.artifactPaths) {
                try {
                  artifactPaths = JSON.parse(buildNode.config.artifactPaths);
                  addRunLog({ level: "info", message: `Found ${artifactPaths.length} artifact(s) from build node` });
                } catch {
                  addRunLog({ level: "warn", message: "Failed to parse artifact paths from build node" });
                }
              }
              
              // If no artifacts from build node, try to auto-detect
              if (artifactPaths.length === 0) {
                addRunLog({ level: "info", message: "No artifacts from build node, searching..." });
                const detectedSystem = selectedRepo.detectedBuildSystem;
                const searchPaths: string[] = [];
                
                if (detectedSystem === "tauri" || detectedSystem === "cargo") {
                  searchPaths.push(
                    `${buildDir}/src-tauri/target/release/bundle`,
                    `${buildDir}/src-tauri/target/*/release/bundle`,
                    `${buildDir}/target/release/bundle`,
                    `${buildDir}/target/*/release`,
                    `${buildDir}/src-tauri/target/release`,
                    `${buildDir}/target/release`
                  );
                } else if (detectedSystem === "npm" || detectedSystem === "yarn" || detectedSystem === "pnpm") {
                  searchPaths.push(
                    `${buildDir}/dist`,
                    `${buildDir}/build`,
                    `${buildDir}/out`
                  );
                }
                
                // Search for actual files in these paths
                for (const searchPath of searchPaths) {
                  try {
                    const findResult = await invoke<string>("run_command", {
                      command: "find",
                      args: [searchPath, "-type", "f", "(", "-name", "*.exe", "-o", "-name", "*.app", "-o", "-name", "*.dmg", "-o", "-name", "*.deb", "-o", "-name", "*.AppImage", "-o", "-name", "*.msi", "-o", "-name", "*.zip", "-o", "-name", "*.tar.gz", ")"],
                      cwd: buildDir
                    });
                    const files = findResult.split("\n").filter(f => f.trim());
                    if (files.length > 0) {
                      artifactPaths.push(...files);
                      addRunLog({ level: "success", message: `Found ${files.length} artifact(s) in ${searchPath}` });
                    }
                  } catch {
                    // Path doesn't exist, continue
                  }
                }
              }
              
              // Upload artifacts if found
              if (artifactPaths.length > 0) {
                addRunLog({ level: "info", message: `Processing ${artifactPaths.length} artifact(s)...` });
                
                // Expand directories to files
                const filesToUpload: string[] = [];
                for (const artifactPath of artifactPaths) {
                  const isDir = await invoke<boolean>("is_directory", { path: artifactPath });
                  
                  if (isDir) {
                    // List all files in directory recursively
                    addRunLog({ level: "info", message: `Expanding directory: ${artifactPath}` });
                    try {
                      const dirFiles = await invoke<string[]>("list_files", { dir: artifactPath });
                      filesToUpload.push(...dirFiles);
                      addRunLog({ level: "info", message: `Found ${dirFiles.length} files in directory` });
                    } catch (e) {
                      addRunLog({ level: "warn", message: `Failed to list directory: ${e}` });
                    }
                  } else {
                    filesToUpload.push(artifactPath);
                  }
                }
                
                addRunLog({ level: "info", message: `Uploading ${filesToUpload.length} file(s)...` });
                
                let uploadedCount = 0;
                for (const artifactPath of filesToUpload.slice(0, 50)) { // Limit to 50 files
                  try {
                    const fileName = artifactPath.split("/").pop() || "artifact";
                    addRunLog({ level: "info", message: `Uploading: ${fileName}` });
                    
                    // Read file using Tauri fs API
                    const { readBinaryFile } = await import("@tauri-apps/api/fs");
                    const fileContent = await readBinaryFile(artifactPath);
                    
                    // Upload to GitHub release using Tauri HTTP client to avoid CORS
                    const uploadUrl = release.upload_url.replace("{?name,label}", `?name=${encodeURIComponent(fileName)}`);
                    
                    // Use Tauri's HTTP client for uploads (bypasses CORS)
                    const { getClient, Body } = await import("@tauri-apps/api/http");
                    const httpClient = await getClient();
                    
                    const uploadResponse = await httpClient.request({
                      method: "POST",
                      url: uploadUrl,
                      headers: {
                        "Authorization": `Bearer ${accessToken}`,
                        "Content-Type": "application/octet-stream",
                        "Accept": "application/vnd.github.v3+json",
                      },
                      body: Body.bytes(fileContent),
                    });
                    
                    if (uploadResponse.ok) {
                      addRunLog({ level: "success", message: `✓ Uploaded: ${fileName}` });
                      uploadedCount++;
                    } else {
                      addRunLog({ level: "warn", message: `Failed to upload ${fileName}: ${JSON.stringify(uploadResponse.data)}` });
                    }
                  } catch (uploadError: any) {
                    addRunLog({ level: "warn", message: `Upload error: ${uploadError.message || uploadError}` });
                  }
                }
                
                if (uploadedCount === 0) {
                  addRunLog({ level: "error", message: "Failed to upload any artifacts!" });
                  throw new Error("No artifacts were uploaded to the release");
                }
                
                addRunLog({ level: "success", message: `Artifact upload complete! ${uploadedCount} file(s) uploaded.` });
              } else {
                addRunLog({ level: "error", message: "No artifacts found to upload" });
                addRunLog({ level: "error", message: "Release created but no files were uploaded" });
                throw new Error("No artifacts found - release deployment failed");
              }
              
              // Cleanup temp build directory if it was created by clone
              if (cloneNodeForDeploy?.config.buildDir) {
                addRunLog({ level: "info", message: `Cleaning up temp directory: ${cloneNodeForDeploy.config.buildDir}` });
                try {
                  await invoke<string>("run_command", {
                    command: "rm",
                    args: ["-rf", cloneNodeForDeploy.config.buildDir],
                    cwd: "/tmp"
                  });
                } catch (e) {
                  // Ignore cleanup errors
                }
              }
              break;
          }
        } catch (nodeError: any) {
          addRunLog({ level: "error", message: `Error: ${nodeError.message || nodeError}` });
          throw nodeError;
        }
      }
      
      endWorkflowRun("success");
      addRunLog({ level: "success", message: "Workflow completed successfully!" });
    } catch (error: any) {
      addRunLog({ level: "error", message: `Workflow failed: ${error.message || error}` });
      endWorkflowRun("failed");
    }
  };

  const stopWorkflow = () => {
    endWorkflowRun("cancelled");
    addRunLog({ level: "warn", message: "Workflow cancelled by user" });
  };

  // Update ref for timer callback
  runWorkflowRef.current = runWorkflow;

  const detectBuildCommand = (repo: LocalRepo): string => {
    const buildInfo = BUILD_SYSTEMS.find(b => b.system === repo.detectedBuildSystem);
    return buildInfo?.buildCmd || "npm run build";
  };

  const detectTestCommand = (repo: LocalRepo): string => {
    const buildInfo = BUILD_SYSTEMS.find(b => b.system === repo.detectedBuildSystem);
    return buildInfo?.testCmd || "npm test";
  };

  const selectedNodeData = workflow?.nodes.find(n => n.id === selectedNode);
  const selectedNodeType = selectedNodeData ? NODE_TYPES.find(t => t.id === selectedNodeData.type) : null;
  const isRunning = currentRun?.status === "running";

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Workflow List */}
        <div className="w-48 bg-slate-900 border-r border-slate-700 flex flex-col">
          <div className="p-3 border-b border-slate-700">
            <button
              onClick={() => {
                const id = addWorkflow({
                  name: "New Workflow",
                  repoId: null,
                  nodes: [],
                  connections: [],
                  nextVersion: "1.0.0",
                });
                selectWorkflow(id);
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              New Workflow
            </button>
          </div>
          <div className="flex-1 overflow-auto" onWheel={(e) => e.stopPropagation()}>
            {workflows.map(w => (
              <div
                key={w.id}
                onClick={() => selectWorkflow(w.id)}
                onDoubleClick={() => {
                  setEditingWorkflowId(w.id);
                  setEditingWorkflowName(w.name);
                }}
                onMouseDown={(e) => {
                  if (e.button === 1) { // Middle click
                    e.preventDefault();
                    e.stopPropagation();
                    if (workflows.length > 1) {
                      const idx = workflows.findIndex(wf => wf.id === w.id);
                      removeWorkflow(w.id);
                      // Select another workflow after deletion
                      if (selectedWorkflowId === w.id) {
                        const nextIdx = idx > 0 ? idx - 1 : 0;
                        const remaining = workflows.filter(wf => wf.id !== w.id);
                        if (remaining[nextIdx]) {
                          selectWorkflow(remaining[nextIdx].id);
                        }
                      }
                    }
                  }
                }}
                className={`w-full text-left px-3 py-2 text-sm border-l-2 cursor-pointer ${
                  selectedWorkflowId === w.id
                    ? "bg-slate-800 border-green-500 text-white"
                    : "border-transparent text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {editingWorkflowId === w.id ? (
                  <input
                    type="text"
                    value={editingWorkflowName}
                    onChange={(e) => setEditingWorkflowName(e.target.value)}
                    onBlur={() => {
                      if (editingWorkflowName.trim()) {
                        renameWorkflow(w.id, editingWorkflowName.trim());
                      }
                      setEditingWorkflowId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (editingWorkflowName.trim()) {
                          renameWorkflow(w.id, editingWorkflowName.trim());
                        }
                        setEditingWorkflowId(null);
                      } else if (e.key === "Escape") {
                        setEditingWorkflowId(null);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                    className="w-full bg-slate-700 border border-green-500 rounded px-1 py-0.5 text-white text-sm outline-none"
                  />
                ) : (
                  <span className="block truncate" title="Double-click to rename">{w.name}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Center: Node Canvas - only show if workflow is selected */}
        {workflow ? (
        <div className="flex-1 flex flex-col bg-slate-950">
          {/* Toolbar */}
          <div className="h-12 border-b border-slate-700 flex items-center justify-between px-4 bg-slate-900">
            <div className="flex items-center gap-3">
              <RepoSelector
                selectedRepoId={workflow?.repoId || null}
                onSelect={handleRepoSelect}
              />
              {selectedRepo?.latestVersion && (
                <span className="text-xs text-slate-500">
                  Latest: <span className="text-green-400 font-mono">{selectedRepo.latestVersion}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-xs">
                Zoom: {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(1)}
                className="px-2 py-1 text-xs text-slate-400 hover:text-white"
              >
                Reset
              </button>
              <span className="text-slate-500 text-xs mx-2">|</span>
              <button
                onClick={() => setShowTerminal(!showTerminal)}
                className={`p-2 rounded ${
                  showTerminal 
                    ? "bg-slate-700 text-white" 
                    : "bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                }`}
                title="Toggle Terminal"
              >
                <Terminal className="w-4 h-4" />
              </button>
              {isRunning ? (
                <button 
                  onClick={stopWorkflow}
                  className="flex items-center gap-2 px-4 py-1.5 bg-red-600 hover:bg-red-500 rounded text-white text-sm font-medium"
                >
                  <StopCircle className="w-4 h-4" />
                  Stop
                </button>
              ) : (
                <button 
                  onClick={runWorkflow}
                  disabled={!workflow?.nodes.length}
                  className="flex items-center gap-2 px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white text-sm font-medium"
                >
                  <Play className="w-4 h-4" />
                  Run
                </button>
              )}
            </div>
          </div>

          {/* Canvas */}
          <div
            ref={canvasRef}
            className={`flex-1 relative overflow-hidden ${isPanning ? 'cursor-grabbing' : 'cursor-crosshair'}`}
            style={{ 
              backgroundImage: "radial-gradient(circle, #334155 1px, transparent 1px)",
              backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
              backgroundPosition: `${canvasOffset.x}px ${canvasOffset.y}px`,
            }}
            onContextMenu={handleContextMenu}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onMouseDown={handleCanvasMouseDown}
            onWheel={handleWheel}
            onClick={() => {
              setSelectedNode(null);
              setNodeContextMenu(null);
            }}
          >
            {/* Transformed container for zoom/pan */}
            <div
              style={{
                transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
              }}
            >
              {/* Connection Lines */}
              <svg 
                className="absolute inset-0 pointer-events-none"
                style={{ width: "10000px", height: "10000px", overflow: "visible" }}
              >
                {/* Existing connections */}
                {workflow?.connections.map(conn => {
                  const from = getNodeCenter(conn.from, true);
                  const to = getNodeCenter(conn.to, false);
                  const midX = (from.x + to.x) / 2;
                  return (
                    <g key={conn.id} className="pointer-events-auto cursor-pointer group" onClick={(e) => {
                      e.stopPropagation();
                      deleteConnection(conn.id);
                    }}>
                      <path
                        d={`M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="20"
                      />
                      <path
                        d={`M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="2"
                        className="drop-shadow-lg group-hover:stroke-red-500 transition-colors"
                      />
                      {/* Delete indicator on hover */}
                      <circle
                        cx={(from.x + to.x) / 2}
                        cy={(from.y + to.y) / 2}
                        r="8"
                        fill="#ef4444"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                      <text
                        x={(from.x + to.x) / 2}
                        y={(from.y + to.y) / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="white"
                        fontSize="10"
                        className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                      >
                        ×
                      </text>
                    </g>
                  );
                })}
                
                {/* Active connection being drawn */}
                {connecting && (
                  <path
                    d={`M ${connecting.startPos.x} ${connecting.startPos.y} C ${(connecting.startPos.x + mousePos.x) / 2} ${connecting.startPos.y}, ${(connecting.startPos.x + mousePos.x) / 2} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                    className="drop-shadow-lg animate-pulse"
                  />
                )}
              </svg>

              {/* Nodes */}
              {workflow?.nodes.map(node => {
                const nodeType = NODE_TYPES.find(t => t.id === node.type);
                const Icon = nodeType?.icon || Package;
                const isSelected = selectedNode === node.id;
                const isCurrentNode = currentRun?.currentNodeId === node.id;
                
                return (
                  <div
                    key={node.id}
                    className={`absolute select-none ${isSelected ? "z-10" : "z-0"}`}
                    style={{
                      left: node.position.x,
                      top: node.position.y,
                      width: 200,
                    }}
                    onMouseDown={(e) => {
                      if (e.button === 1) { // Middle click to delete
                        e.preventDefault();
                        e.stopPropagation();
                        deleteNode(node.id);
                      } else {
                        handleNodeMouseDown(e, node.id);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = canvasRef.current?.getBoundingClientRect();
                      if (rect) {
                        setNodeContextMenu({
                          nodeId: node.id,
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top,
                        });
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNode(node.id);
                    }}
                  >
                    {/* Input Port */}
                    {nodeType?.inputs && nodeType.inputs.length > 0 && (
                      <div
                        className="absolute -left-3 top-8 w-6 h-6 bg-slate-700 border-2 border-slate-500 rounded-full cursor-pointer hover:border-green-400 hover:scale-125 flex items-center justify-center transition-all shadow-lg"
                        onMouseUp={() => completeConnection(node.id, true)}
                      >
                        <div className="w-2 h-2 bg-slate-400 rounded-full" />
                      </div>
                    )}

                    {/* Node Body */}
                    <div className={`rounded-lg overflow-hidden shadow-2xl border-2 transition-all ${
                      isSelected ? "border-green-500 shadow-green-500/20" : "border-slate-600"
                    } ${isCurrentNode ? "border-yellow-500" : ""}`}>
                      {/* Header */}
                      <div 
                        className="px-3 py-2 flex items-center gap-2 cursor-grab active:cursor-grabbing"
                        style={{ backgroundColor: nodeType?.color || "#64748b" }}
                      >
                        <Icon className="w-4 h-4 text-white" />
                        <span className="text-white text-sm font-medium flex-1">
                          {nodeType?.name}
                        </span>
                        {isCurrentNode && <Loader2 className="w-4 h-4 text-white animate-spin" />}
                      </div>
                      
                      {/* Body */}
                      <div className="bg-slate-800 p-2 space-y-1">
                        <p className="text-xs text-slate-400">{nodeType?.description}</p>
                        {node.type === "deploy" && (
                          <div className="pt-1">
                            <span className="text-xs text-green-400 font-mono">
                              v{node.config.version || workflow?.nextVersion}
                            </span>
                          </div>
                        )}
                        {node.type === "fetch" && selectedRepo?.latestVersion && (
                          <div className="pt-1">
                            <span className="text-xs text-blue-400 font-mono">
                              Latest: {selectedRepo.latestVersion}
                            </span>
                          </div>
                        )}
                        {node.type === "checkout" && (
                          <div className="pt-1">
                            <span className="text-xs text-cyan-400 font-mono">
                              Branch: {node.config.branch || "main"}
                            </span>
                          </div>
                        )}
                        {node.type === "build" && (
                          <div className="pt-1">
                            <span className="text-xs text-emerald-400 font-mono">
                              {node.config.command || (selectedRepo?.detectedBuildSystem 
                                ? BUILD_SYSTEMS.find(b => b.system === selectedRepo.detectedBuildSystem)?.buildCmd 
                                : "npm run build")}
                            </span>
                            {node.config.targetOS && node.config.targetOS !== "local" && (
                              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                                node.config.targetOS === "windows" ? "bg-blue-500/30 text-blue-300" :
                                node.config.targetOS === "macos" ? "bg-purple-500/30 text-purple-300" :
                                node.config.targetOS === "linux" ? "bg-orange-500/30 text-orange-300" :
                                node.config.targetOS === "all" ? "bg-green-500/30 text-green-300" :
                                "bg-slate-600 text-slate-300"
                              }`}>
                                {node.config.targetOS}
                              </span>
                            )}
                          </div>
                        )}
                        {node.type === "command" && (
                          <div className="pt-1">
                            <span className="text-xs text-cyan-400 font-mono">
                              $ {node.config.command || "<no command>"}
                            </span>
                          </div>
                        )}
                        {node.type === "timer" && (
                          <div className="pt-1">
                            <span className="text-xs text-cyan-400">
                              {node.config.timerMode === "interval" && `Every ${node.config.intervalHours || 1}h`}
                              {node.config.timerMode === "daily" && `Daily at ${node.config.dailyTime || "00:00"}`}
                              {node.config.timerMode === "weekly" && `${node.config.weeklyDay || "Monday"} at ${node.config.weeklyTime || "00:00"}`}
                              {node.config.timerMode === "combined" && `${node.config.combinedDay || "Monday"} + ${node.config.combinedTime || "00:00"}`}
                              {!node.config.timerMode && "Not configured"}
                            </span>
                            {node.config.enabled && (
                              <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-green-500/30 text-green-300">
                                Active
                              </span>
                            )}
                          </div>
                        )}
                        {node.type === "link" && (
                          <div className="pt-1">
                            <span className="text-xs text-blue-400 font-mono truncate block max-w-[180px]">
                              {node.config.url || "<no url>"}
                            </span>
                          </div>
                        )}
                        {node.type === "download" && (
                          <div className="pt-1">
                            <span className="text-xs text-emerald-400">
                              → {node.config.outputPath || "~/Downloads"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Output Port */}
                    {nodeType?.outputs && nodeType.outputs.length > 0 && (
                      <div
                        className="absolute -right-3 top-8 w-6 h-6 bg-slate-700 border-2 border-slate-500 rounded-full cursor-pointer hover:border-green-400 hover:scale-125 flex items-center justify-center transition-all shadow-lg"
                        onMouseDown={(e) => startConnection(node.id, true, e)}
                      >
                        <div className="w-2 h-2 bg-green-400 rounded-full" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Context Menu */}
            {contextMenu && (
              <div
                className="absolute bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 z-50"
                style={{ 
                  left: contextMenu.x * zoom + canvasOffset.x, 
                  top: contextMenu.y * zoom + canvasOffset.y,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-1.5 text-xs text-slate-500 uppercase tracking-wide">Add Node</div>
                {NODE_TYPES.map(type => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.id}
                      onClick={() => addNode(type.id)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-700"
                    >
                      <div 
                        className="w-6 h-6 rounded flex items-center justify-center"
                        style={{ backgroundColor: type.color }}
                      >
                        <Icon className="w-3 h-3 text-white" />
                      </div>
                      <div>
                        <div className="text-white text-sm">{type.name}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Node Replacement Context Menu */}
            {nodeContextMenu && (
              <div
                className="absolute bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 z-50 max-h-96 overflow-y-auto"
                style={{ 
                  left: nodeContextMenu.x, 
                  top: nodeContextMenu.y,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-1.5 text-xs text-slate-500 uppercase tracking-wide">
                  Replace With
                </div>
                {NODE_TYPES.map(type => {
                  const Icon = type.icon;
                  const currentNode = workflow?.nodes.find(n => n.id === nodeContextMenu.nodeId);
                  const isCurrent = currentNode?.type === type.id;
                  return (
                    <button
                      key={type.id}
                      onClick={() => {
                        if (!isCurrent) {
                          replaceNode(nodeContextMenu.nodeId, type.id);
                        }
                      }}
                      disabled={isCurrent}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left ${
                        isCurrent ? 'bg-slate-700/50 cursor-not-allowed opacity-50' : 'hover:bg-slate-700'
                      }`}
                    >
                      <div 
                        className="w-6 h-6 rounded flex items-center justify-center"
                        style={{ backgroundColor: type.color }}
                      >
                        <Icon className="w-3 h-3 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="text-white text-sm">{type.name}</div>
                      </div>
                      {isCurrent && <span className="text-xs text-green-400">[CURRENT]</span>}
                    </button>
                  );
                })}
                <div className="border-t border-slate-600 mt-1">
                  <button
                    onClick={() => {
                      deleteNode(nodeContextMenu.nodeId);
                    }}
                    className="w-full px-3 py-2 flex items-center gap-3 hover:bg-red-600 text-left text-red-400 hover:text-white transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-sm">Delete Node</span>
                  </button>
                </div>
              </div>
            )}

            {/* Empty State */}
            {workflow?.nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center text-slate-500">
                  <p className="text-lg mb-2">Right-click to add nodes</p>
                  <p className="text-sm">Drag nodes to arrange, connect ports to create flow</p>
                  <p className="text-sm mt-2">Ctrl/Pinch to zoom • Right-click to pan • Middle-click nodes to delete</p>
                </div>
              </div>
            )}

            {/* No Workflow Selected - show only when no workflow */}
            {!workflow ? (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
                <div className="text-center">
                  <GitBranch className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                  <p className="text-xl font-medium text-slate-400 mb-2">No Workflow Selected</p>
                  <p className="text-sm text-slate-500 mb-4">Select a workflow from the sidebar or create a new one</p>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      const newId = addWorkflow({
                        name: `Workflow ${workflows.length + 1}`,
                        repoId: null,
                        nodes: [],
                        connections: [],
                        nextVersion: "1.0.0",
                        variables: {},
                        history: [],
                        historyIndex: -1,
                      });
                      selectWorkflow(newId);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm font-medium transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Create Workflow
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-950">
            <div className="text-center">
              <GitBranch className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-xl font-medium text-slate-400 mb-2">No Workflow Selected</p>
              <p className="text-sm text-slate-500 mb-4">Select a workflow from the sidebar or create a new one</p>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  const newId = addWorkflow({
                    name: `Workflow ${workflows.length + 1}`,
                    repoId: null,
                    nodes: [],
                    connections: [],
                    nextVersion: "1.0.0",
                    variables: {},
                    history: [],
                    historyIndex: -1,
                  });
                  selectWorkflow(newId);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Workflow
              </button>
            </div>
          </div>
        )}

        {/* Right: Node Properties - only show if workflow is selected */}
        {workflow && (
        <div className="w-64 bg-slate-900 border-l border-slate-700 flex flex-col">
          <div className="p-3 border-b border-slate-700">
            <h3 className="text-sm font-medium text-white">Properties</h3>
          </div>
          
          {selectedNodeData && selectedNodeType ? (
            <div className="p-3 space-y-3 overflow-auto flex-1" onWheel={(e) => e.stopPropagation()}>
              <div 
                className="flex items-center gap-2 px-3 py-2 rounded"
                style={{ backgroundColor: `${selectedNodeType.color}20` }}
              >
                <selectedNodeType.icon className="w-4 h-4" style={{ color: selectedNodeType.color }} />
                <span className="text-white font-medium">{selectedNodeType.name}</span>
              </div>
              
              <p className="text-xs text-slate-400">{selectedNodeType.description}</p>

              {/* Server Selection */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">Server</label>
                <select
                  value={selectedNodeData.config.server || ""}
                  onChange={(e) => updateNodeConfig(selectedNodeData.id, "server", e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                >
                  <option value="">Auto (any available)</option>
                  {onlineServers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Node-specific config */}
              {selectedNodeData.type === "timer" && (
                <>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Schedule Mode</label>
                    <select
                      value={selectedNodeData.config.timerMode || "interval"}
                      onChange={(e) => updateNodeConfig(selectedNodeData.id, "timerMode", e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                    >
                      <option value="interval">Interval (Every X hours)</option>
                      <option value="daily">Daily (Specific time)</option>
                      <option value="weekly">Weekly (Specific day & time)</option>
                      <option value="combined">Combined (Day + Time)</option>
                    </select>
                  </div>
                  
                  {selectedNodeData.config.timerMode === "interval" && (
                    <div className="mt-3">
                      <label className="block text-xs text-slate-500 mb-1">Interval (hours)</label>
                      <input
                        type="number"
                        min="1"
                        value={selectedNodeData.config.intervalHours || 1}
                        onChange={(e) => updateNodeConfig(selectedNodeData.id, "intervalHours", parseInt(e.target.value))}
                        className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                      />
                      <p className="text-xs text-slate-500 mt-1">Workflow will run every {selectedNodeData.config.intervalHours || 1} hour(s)</p>
                    </div>
                  )}
                  
                  {selectedNodeData.config.timerMode === "daily" && (
                    <div className="mt-3">
                      <label className="block text-xs text-slate-500 mb-1">Time (24h format)</label>
                      <input
                        type="time"
                        value={selectedNodeData.config.dailyTime || "00:00"}
                        onChange={(e) => updateNodeConfig(selectedNodeData.id, "dailyTime", e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                      />
                      <p className="text-xs text-slate-500 mt-1">Workflow will run daily at {selectedNodeData.config.dailyTime || "00:00"}</p>
                    </div>
                  )}
                  
                  {selectedNodeData.config.timerMode === "weekly" && (
                    <>
                      <div className="mt-3">
                        <label className="block text-xs text-slate-500 mb-1">Day of Week</label>
                        <select
                          value={selectedNodeData.config.weeklyDay || "Monday"}
                          onChange={(e) => updateNodeConfig(selectedNodeData.id, "weeklyDay", e.target.value)}
                          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                        >
                          <option>Monday</option>
                          <option>Tuesday</option>
                          <option>Wednesday</option>
                          <option>Thursday</option>
                          <option>Friday</option>
                          <option>Saturday</option>
                          <option>Sunday</option>
                        </select>
                      </div>
                      <div className="mt-3">
                        <label className="block text-xs text-slate-500 mb-1">Time (24h format)</label>
                        <input
                          type="time"
                          value={selectedNodeData.config.weeklyTime || "00:00"}
                          onChange={(e) => updateNodeConfig(selectedNodeData.id, "weeklyTime", e.target.value)}
                          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Runs every {selectedNodeData.config.weeklyDay || "Monday"} at {selectedNodeData.config.weeklyTime || "00:00"}
                      </p>
                    </>
                  )}
                  
                  {selectedNodeData.config.timerMode === "combined" && (
                    <>
                      <div className="mt-3">
                        <label className="block text-xs text-slate-500 mb-1">Day of Week</label>
                        <select
                          value={selectedNodeData.config.combinedDay || "Monday"}
                          onChange={(e) => updateNodeConfig(selectedNodeData.id, "combinedDay", e.target.value)}
                          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                        >
                          <option>Monday</option>
                          <option>Tuesday</option>
                          <option>Wednesday</option>
                          <option>Thursday</option>
                          <option>Friday</option>
                          <option>Saturday</option>
                          <option>Sunday</option>
                        </select>
                      </div>
                      <div className="mt-3">
                        <label className="block text-xs text-slate-500 mb-1">Time (24h format)</label>
                        <input
                          type="time"
                          value={selectedNodeData.config.combinedTime || "00:00"}
                          onChange={(e) => updateNodeConfig(selectedNodeData.id, "combinedTime", e.target.value)}
                          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Runs on {selectedNodeData.config.combinedDay || "Monday"} + at {selectedNodeData.config.combinedTime || "00:00"}
                      </p>
                    </>
                  )}
                  
                  <div className="mt-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedNodeData.config.enabled || false}
                        onChange={(e) => updateNodeConfig(selectedNodeData.id, "enabled", e.target.checked)}
                        className="rounded bg-slate-800 border-slate-600"
                      />
                      <span className="text-sm text-slate-300">Enable Timer</span>
                    </label>
                    <p className="text-xs text-slate-500 mt-1">Workflow will run automatically when enabled</p>
                  </div>
                  
                  <div className="mt-3 p-2 bg-cyan-500/10 border border-cyan-500/20 rounded">
                    <p className="text-xs text-cyan-400">
                      Timer will trigger the workflow automatically based on your schedule. Make sure to connect this timer node to your workflow start.
                    </p>
                  </div>
                </>
              )}
              
              {selectedNodeData.type === "link" && (
                <>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">URL</label>
                    <input
                      type="text"
                      value={String(selectedNodeData.config.url || "")}
                      onChange={(e) => updateNodeConfig(selectedNodeData.id, "url", e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white font-mono"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      URL to send to connected nodes (e.g., for downloading)
                    </p>
                  </div>
                  <div className="mt-3 p-2 bg-blue-500/10 border border-blue-500/20 rounded">
                    <p className="text-xs text-blue-400">
                      Connect this node to a Download node or Cobalt Tools node to download media.
                    </p>
                  </div>
                </>
              )}
              
              {selectedNodeData.type === "download" && (
                <>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Output Directory</label>
                    <input
                      type="text"
                      value={String(selectedNodeData.config.outputPath || "~/Downloads")}
                      onChange={(e) => updateNodeConfig(selectedNodeData.id, "outputPath", e.target.value)}
                      placeholder="~/Downloads"
                      className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white font-mono"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Where to save downloaded files
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1 mt-3">Filename (optional)</label>
                    <input
                      type="text"
                      value={String(selectedNodeData.config.filename || "")}
                      onChange={(e) => updateNodeConfig(selectedNodeData.id, "filename", e.target.value)}
                      placeholder="Leave empty to use original name"
                      className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white font-mono"
                    />
                  </div>
                  <div className="mt-3 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded">
                    <p className="text-xs text-emerald-400">
                      Connect a Link node or any node that outputs a URL to download files.
                    </p>
                  </div>
                </>
              )}
              
              {selectedNodeData.type === "checkout" && (
                <>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Branch</label>
                    <select
                      value={selectedNodeData.config.branch || "main"}
                      onChange={(e) => updateNodeConfig(selectedNodeData.id, "branch", e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                      disabled={loadingBranches}
                    >
                      {loadingBranches ? (
                        <option>Loading...</option>
                      ) : branches.length > 0 ? (
                        branches.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))
                      ) : (
                        <option value="main">main</option>
                      )}
                    </select>
                  </div>
                  
                  {!showCreateBranch ? (
                    <button
                      onClick={() => setShowCreateBranch(true)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-slate-300 text-sm"
                    >
                      <GitBranchPlus className="w-4 h-4" />
                      Create Branch
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={newBranchName}
                        onChange={(e) => setNewBranchName(e.target.value)}
                        placeholder="new-branch-name"
                        className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={createBranch}
                          className="flex-1 px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-white text-sm"
                        >
                          Create
                        </button>
                        <button
                          onClick={() => {
                            setShowCreateBranch(false);
                            setNewBranchName("");
                          }}
                          className="flex-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {selectedNodeData.type === "commit" && (
                <>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Commit Message</label>
                    <input
                      type="text"
                      value={selectedNodeData.config.commitMessage || ""}
                      onChange={(e) => updateNodeConfig(selectedNodeData.id, "commitMessage", e.target.value)}
                      placeholder={`Build ${workflow?.nextVersion || "1.0.0"}`}
                      className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Leave empty to use default: "Build [version]"
                    </p>
                  </div>
                </>
              )}

              {selectedNodeData.type === "command" && (
                <>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Command</label>
                    <input
                      type="text"
                      value={selectedNodeData.config.command || ""}
                      onChange={(e) => updateNodeConfig(selectedNodeData.id, "command", e.target.value)}
                      placeholder="e.g., wails build, docker build -t myapp ."
                      className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white font-mono"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Any shell command. Will offer to install if not found.
                    </p>
                  </div>
                  <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded">
                    <p className="text-xs text-blue-400">
                      If the command is not installed, you'll be prompted to install it via your OS package manager (brew/apt/winget/etc).
                    </p>
                  </div>
                </>
              )}

              {selectedNodeData.type === "build" && (
                <>
                  <div className="p-3 bg-slate-700/30 rounded border border-slate-600 mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-3 h-3 text-green-400" />
                      <span className="text-xs font-medium text-slate-300">Build Configuration</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Build system: <span className="text-green-400 font-mono">{selectedRepo?.detectedBuildSystem || "will be detected"}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Default: {detectBuildCommand(selectedRepo || {} as LocalRepo)}
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Target Platform</label>
                    <select
                      value={selectedNodeData.config.targetOS || "local"}
                      onChange={(e) => updateNodeConfig(selectedNodeData.id, "targetOS", e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                    >
                      <option value="local">Local Machine</option>
                      <option value="windows">Windows</option>
                      <option value="macos">macOS</option>
                      <option value="linux">Linux</option>
                      <option value="all">All Platforms</option>
                    </select>
                    <p className="text-xs text-slate-500 mt-1">
                      Will route to matching server or Docker container
                    </p>
                  </div>
                  
                  <div className="mt-3">
                    <label className="block text-xs text-slate-500 mb-1">Build Command</label>
                    <input
                      type="text"
                      value={selectedNodeData.config.command || ""}
                      onChange={(e) => updateNodeConfig(selectedNodeData.id, "command", e.target.value)}
                      placeholder={detectBuildCommand(selectedRepo || {} as LocalRepo)}
                      className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white font-mono"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Leave empty to use auto-detected command.
                    </p>
                  </div>
                  
                  <div className="mt-3">
                    <label className="block text-xs text-slate-500 mb-1">Artifact Pattern (optional)</label>
                    <input
                      type="text"
                      value={selectedNodeData.config.artifactPattern || ""}
                      onChange={(e) => updateNodeConfig(selectedNodeData.id, "artifactPattern", e.target.value)}
                      placeholder="e.g., dist/*.zip, target/release/*"
                      className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white font-mono"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Files to upload to GitHub release
                    </p>
                  </div>
                </>
              )}

              {selectedNodeData.type === "deploy" && (
                <>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Version</label>
                    <input
                      type="text"
                      value={selectedNodeData.config.version || workflow?.nextVersion || ""}
                      onChange={(e) => updateNodeConfig(selectedNodeData.id, "version", e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Release Name</label>
                    <input
                      type="text"
                      value={selectedNodeData.config.releaseName || ""}
                      onChange={(e) => updateNodeConfig(selectedNodeData.id, "releaseName", e.target.value)}
                      placeholder="Release v1.0.0"
                      className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                    />
                  </div>
                </>
              )}

              {selectedNodeData.type === "action" && (
                <>
                  {/* Check for build.yml in repo */}
                  {selectedRepo && (
                      <div className="mb-3 p-2 bg-slate-800/50 border border-slate-700 rounded">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">build.yml Status:</span>
                          <button
                            onClick={async () => {
                              try {
                                // Check if build.yml exists
                                await invoke("run_command", {
                                  command: "test",
                                  args: ["-f", `${selectedRepo.path}/.github/workflows/build.yml`],
                                  cwd: selectedRepo.path
                                });
                                alert("build.yml found! You can import it as a workflow.");
                              } catch (e) {
                                alert("NO BUILD.YML PRESENT\n\nCreate one in .github/workflows/build.yml or define your workflow manually.");
                              }
                            }}
                            className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white"
                          >
                            Check File
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Path: .github/workflows/build.yml
                        </p>
                      </div>
                  )}
                  
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Select Action</label>
                    <select
                      value={selectedNodeData.config.actionId || ""}
                      onChange={(e) => updateNodeConfig(selectedNodeData.id, "actionId", e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
                    >
                      <option value="">Choose an action...</option>
                      {localActions.map(action => (
                        <option key={action.id} value={action.id}>{action.name}</option>
                      ))}
                    </select>
                    {localActions.length === 0 && (
                      <p className="text-xs text-amber-400 mt-1">
                        No actions defined. Create custom actions in Settings.
                      </p>
                    )}
                  </div>
                  
                  {selectedNodeData.config.actionId && (() => {
                    const selectedAction = localActions.find(a => a.id === selectedNodeData.config.actionId);
                    if (!selectedAction) return null;
                    
                    return (
                      <>
                        {selectedAction.description && (
                          <p className="text-xs text-slate-400 italic">{selectedAction.description}</p>
                        )}
                        
                        {selectedAction.inputs && selectedAction.inputs.length > 0 && (
                          <div className="space-y-2">
                            <label className="block text-xs text-slate-500">Inputs</label>
                            {selectedAction.inputs.map(input => (
                              <div key={input.name}>
                                <label className="block text-xs text-slate-400 mb-1">
                                  {input.name}
                                  {input.required && <span className="text-red-400 ml-1">*</span>}
                                </label>
                                <input
                                  type="text"
                                  value={(selectedNodeData.config.actionInputs as Record<string, string>)?.[input.name] || input.default || ""}
                                  onChange={(e) => {
                                    const currentInputs = (selectedNodeData.config.actionInputs as Record<string, string>) || {};
                                    updateNodeConfig(selectedNodeData.id, "actionInputs", {
                                      ...currentInputs,
                                      [input.name]: e.target.value
                                    });
                                  }}
                                  placeholder={input.description || input.default || ""}
                                  className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white font-mono"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <div className="p-2 bg-slate-800 rounded border border-slate-700 mt-2">
                          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                            <Terminal className="w-3 h-3" />
                            Script Preview
                          </div>
                          <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap max-h-32 overflow-auto">
                            {selectedAction.script.slice(0, 200)}{selectedAction.script.length > 200 ? "..." : ""}
                          </pre>
                        </div>
                      </>
                    );
                  })()}
                </>
              )}

              {/* Delete Button */}
              <button
                onClick={() => deleteNode(selectedNodeData.id)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 rounded text-red-400 text-sm mt-4"
              >
                <Trash2 className="w-4 h-4" />
                Delete Node
              </button>
            </div>
          ) : (
            <div className="p-3 text-center text-slate-500 text-sm">
              Select a node to view properties
            </div>
          )}

          {/* Connection help */}
          {connecting && (
            <div className="p-3 border-t border-slate-700 bg-green-500/10">
              <p className="text-xs text-green-400 text-center">
                Click on an input port to connect
              </p>
              <button
                onClick={() => setConnecting(null)}
                className="w-full mt-2 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 text-xs"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Terminal at bottom */}
      {showTerminal && workflow && (
        currentRun ? (
          <WorkflowTerminal
            logs={currentRun.logs}
            isRunning={isRunning}
            onClose={() => {
              setShowTerminal(false);
              if (!isRunning) {
                clearCurrentRun();
              }
            }}
            onStop={stopWorkflow}
          />
        ) : (
          <div className="h-64 bg-slate-900 border-t border-slate-700 flex items-center justify-center">
            <p className="text-slate-500 text-sm">Terminal is ready. Run a workflow to see output.</p>
          </div>
        )
      )}
    </div>
  );
}

// Topological sort for node execution order
function topologicalSort(nodes: WorkflowNode[], connections: WorkflowConnection[]): WorkflowNode[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  
  nodes.forEach(n => {
    inDegree.set(n.id, 0);
    adjacency.set(n.id, []);
  });
  
  connections.forEach(c => {
    adjacency.get(c.from)?.push(c.to);
    inDegree.set(c.to, (inDegree.get(c.to) || 0) + 1);
  });
  
  const queue: string[] = [];
  inDegree.forEach((degree, id) => {
    if (degree === 0) queue.push(id);
  });
  
  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    
    adjacency.get(id)?.forEach(target => {
      const newDegree = (inDegree.get(target) || 0) - 1;
      inDegree.set(target, newDegree);
      if (newDegree === 0) queue.push(target);
    });
  }
  
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  return sorted.map(id => nodeMap.get(id)!).filter(Boolean);
}
