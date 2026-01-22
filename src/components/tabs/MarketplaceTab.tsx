import { useState, useEffect } from "react";
import { Package, Download, Star, Search, RefreshCw, Check, ExternalLink, Plus, Trash2, Code, Workflow } from "lucide-react";
import { useAppStore } from "../../store/appStore";

interface MarketplaceNode {
  id: string;
  name: string;
  description: string;
  type: string;
  category: string;
  author: string;
  version: string;
  downloads?: number;
  stars?: number;
  installed?: boolean;
}

interface MarketplaceWorkflow {
  id: string;
  name: string;
  description: string;
  author: string;
  nodes: number;
  downloads?: number;
  stars?: number;
}

interface MarketplaceSource {
  name: string;
  url: string;
  enabled: boolean;
}

const DEFAULT_MARKETPLACE_URL = "https://raw.githubusercontent.com/yyyumeniku/buildforge-marketplace/main";

export function MarketplaceTab() {
  const [activeSection, setActiveSection] = useState<"nodes" | "workflows" | "sources">("nodes");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [nodes, setNodes] = useState<MarketplaceNode[]>([]);
  const [workflows, setWorkflows] = useState<MarketplaceWorkflow[]>([]);
  const [sources, setSources] = useState<MarketplaceSource[]>([
    { name: "BuildForge Official", url: DEFAULT_MARKETPLACE_URL, enabled: true }
  ]);
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [installedNodes, setInstalledNodes] = useState<Set<string>>(new Set());
  const { addWorkflow } = useAppStore();

  // Load installed nodes from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("buildforge-installed-nodes");
    if (saved) {
      setInstalledNodes(new Set(JSON.parse(saved)));
    }
    const savedSources = localStorage.getItem("buildforge-marketplace-sources");
    if (savedSources) {
      setSources(JSON.parse(savedSources));
    }
  }, []);

  // Save installed nodes
  const saveInstalledNodes = (nodes: Set<string>) => {
    localStorage.setItem("buildforge-installed-nodes", JSON.stringify([...nodes]));
    setInstalledNodes(nodes);
  };

  // Fetch marketplace data
  const fetchMarketplace = async () => {
    setLoading(true);
    const allNodes: MarketplaceNode[] = [];
    const allWorkflows: MarketplaceWorkflow[] = [];

    for (const source of sources.filter(s => s.enabled)) {
      try {
        // Fetch nodes manifest
        const nodesRes = await fetch(`${source.url}/nodes/manifest.json`);
        if (nodesRes.ok) {
          const nodesData = await nodesRes.json();
          if (nodesData.nodes) {
            allNodes.push(...nodesData.nodes.map((n: any) => ({
              ...n,
              author: nodesData.author || "Unknown",
              installed: installedNodes.has(n.id)
            })));
          }
        }
      } catch (e) {
        console.log(`Failed to fetch nodes from ${source.name}:`, e);
      }

      try {
        // Fetch workflows manifest
        const workflowsRes = await fetch(`${source.url}/workflows/manifest.json`);
        if (workflowsRes.ok) {
          const workflowsData = await workflowsRes.json();
          if (workflowsData.workflows) {
            allWorkflows.push(...workflowsData.workflows.map((w: any) => ({
              ...w,
              author: workflowsData.author || "Unknown"
            })));
          }
        }
      } catch (e) {
        console.log(`Failed to fetch workflows from ${source.name}:`, e);
      }
    }

    // Add built-in nodes
    const builtInNodes: MarketplaceNode[] = [
      {
        id: "builtin-clone",
        name: "Clone Repository",
        description: "Clone a Git repository to local storage",
        type: "clone",
        category: "Core",
        author: "BuildForge",
        version: "1.0.0",
        installed: true
      },
      {
        id: "builtin-commit",
        name: "Commit Changes",
        description: "Commit staged changes to the repository",
        type: "commit",
        category: "Core",
        author: "BuildForge",
        version: "1.0.0",
        installed: true
      },
      {
        id: "builtin-sync",
        name: "Sync Repository",
        description: "Push and pull changes from remote",
        type: "sync",
        category: "Core",
        author: "BuildForge",
        version: "1.0.0",
        installed: true
      },
      {
        id: "builtin-build",
        name: "Build Project",
        description: "Run build commands for your project",
        type: "build",
        category: "Core",
        author: "BuildForge",
        version: "1.0.0",
        installed: true
      },
      {
        id: "builtin-deploy",
        name: "Deploy Release",
        description: "Create a GitHub release with artifacts",
        type: "deploy",
        category: "Core",
        author: "BuildForge",
        version: "1.0.0",
        installed: true
      },
      {
        id: "builtin-link",
        name: "Link Node",
        description: "Reference workflows from other nodes",
        type: "link",
        category: "Core",
        author: "BuildForge",
        version: "1.0.0",
        installed: true
      },
      {
        id: "builtin-download",
        name: "Download File",
        description: "Download files from URLs",
        type: "download",
        category: "Core",
        author: "BuildForge",
        version: "1.0.0",
        installed: true
      },
      {
        id: "builtin-timer",
        name: "Timer Trigger",
        description: "Schedule workflows to run at specific times",
        type: "timer",
        category: "Core",
        author: "BuildForge",
        version: "1.0.0",
        installed: true
      },
    ];

    setNodes([...builtInNodes, ...allNodes]);
    setWorkflows(allWorkflows);
    setLoading(false);
  };

  useEffect(() => {
    fetchMarketplace();
  }, [sources, installedNodes]);

  const handleInstallNode = (node: MarketplaceNode) => {
    const newInstalled = new Set(installedNodes);
    newInstalled.add(node.id);
    saveInstalledNodes(newInstalled);
    alert(`Installed ${node.name}! You can now use it in your workflows.`);
  };

  const handleUninstallNode = (node: MarketplaceNode) => {
    const newInstalled = new Set(installedNodes);
    newInstalled.delete(node.id);
    saveInstalledNodes(newInstalled);
  };

  const handleImportWorkflow = async (workflow: MarketplaceWorkflow) => {
    try {
      // Find the source that has this workflow
      for (const source of sources.filter(s => s.enabled)) {
        try {
          const res = await fetch(`${source.url}/workflows/${workflow.id}.json`);
          if (res.ok) {
            const workflowData = await res.json();
            // Import the workflow
            addWorkflow({
              name: workflowData.name || workflow.name,
              nodes: workflowData.nodes || [],
              connections: workflowData.connections || [],
              repoId: null,
              nextVersion: "1.0.0",
            });
            alert(`Imported "${workflow.name}" workflow! Find it in your Workflows tab.`);
            return;
          }
        } catch (e) {
          continue;
        }
      }
      alert("Failed to import workflow: source not found");
    } catch (e) {
      alert(`Failed to import workflow: ${e}`);
    }
  };

  const handleAddSource = () => {
    if (!newSourceUrl) return;
    const newSources = [...sources, { name: newSourceUrl, url: newSourceUrl, enabled: true }];
    setSources(newSources);
    localStorage.setItem("buildforge-marketplace-sources", JSON.stringify(newSources));
    setNewSourceUrl("");
    fetchMarketplace();
  };

  const handleRemoveSource = (url: string) => {
    const newSources = sources.filter(s => s.url !== url);
    setSources(newSources);
    localStorage.setItem("buildforge-marketplace-sources", JSON.stringify(newSources));
  };

  const handleToggleSource = (url: string) => {
    const newSources = sources.map(s => 
      s.url === url ? { ...s, enabled: !s.enabled } : s
    );
    setSources(newSources);
    localStorage.setItem("buildforge-marketplace-sources", JSON.stringify(newSources));
  };

  const filteredNodes = nodes.filter(n => 
    n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredWorkflows = workflows.filter(w =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Package className="w-7 h-7 text-green-400" />
          <h2 className="text-2xl font-bold text-white">Marketplace</h2>
        </div>
        <button
          onClick={fetchMarketplace}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-white text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveSection("nodes")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            activeSection === "nodes"
              ? "bg-green-600 text-white"
              : "bg-slate-800 text-slate-400 hover:bg-slate-700"
          }`}
        >
          <Code className="w-4 h-4" />
          Nodes
        </button>
        <button
          onClick={() => setActiveSection("workflows")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            activeSection === "workflows"
              ? "bg-green-600 text-white"
              : "bg-slate-800 text-slate-400 hover:bg-slate-700"
          }`}
        >
          <Workflow className="w-4 h-4" />
          Workflows
        </button>
        <button
          onClick={() => setActiveSection("sources")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            activeSection === "sources"
              ? "bg-green-600 text-white"
              : "bg-slate-800 text-slate-400 hover:bg-slate-700"
          }`}
        >
          <ExternalLink className="w-4 h-4" />
          Sources
        </button>
      </div>

      {/* Search Bar */}
      {activeSection !== "sources" && (
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${activeSection}...`}
            className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeSection === "nodes" && (
          <div className="grid gap-4">
            {loading ? (
              <div className="text-center py-8 text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                Loading marketplace...
              </div>
            ) : filteredNodes.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                No nodes found. Try adding a marketplace source.
              </div>
            ) : (
              filteredNodes.map((node) => (
                <div
                  key={node.id}
                  className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-white">{node.name}</h3>
                        <span className="text-xs px-2 py-0.5 bg-slate-700 rounded text-slate-400">
                          {node.category}
                        </span>
                        <span className="text-xs text-slate-500">v{node.version}</span>
                      </div>
                      <p className="text-sm text-slate-400 mb-2">{node.description}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>By {node.author}</span>
                        {node.downloads !== undefined && (
                          <span className="flex items-center gap-1">
                            <Download className="w-3 h-3" />
                            {node.downloads}
                          </span>
                        )}
                        {node.stars !== undefined && (
                          <span className="flex items-center gap-1">
                            <Star className="w-3 h-3" />
                            {node.stars}
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      {node.installed || node.category === "Core" ? (
                        <span className="flex items-center gap-1 px-3 py-1.5 bg-green-600/20 text-green-400 rounded text-sm">
                          <Check className="w-4 h-4" />
                          Installed
                        </span>
                      ) : installedNodes.has(node.id) ? (
                        <button
                          onClick={() => handleUninstallNode(node)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded text-sm transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          Uninstall
                        </button>
                      ) : (
                        <button
                          onClick={() => handleInstallNode(node)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-sm transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          Install
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeSection === "workflows" && (
          <div className="grid gap-4">
            {loading ? (
              <div className="text-center py-8 text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                Loading workflows...
              </div>
            ) : filteredWorkflows.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                No workflow templates found. Try adding a marketplace source.
              </div>
            ) : (
              filteredWorkflows.map((workflow) => (
                <div
                  key={workflow.id}
                  className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-white mb-1">{workflow.name}</h3>
                      <p className="text-sm text-slate-400 mb-2">{workflow.description}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>By {workflow.author}</span>
                        <span>{workflow.nodes} nodes</span>
                        {workflow.downloads !== undefined && (
                          <span className="flex items-center gap-1">
                            <Download className="w-3 h-3" />
                            {workflow.downloads}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleImportWorkflow(workflow)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Import
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeSection === "sources" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400 mb-4">
              Add custom marketplace sources to discover more nodes and workflow templates.
              Sources should point to a GitHub repository with a compatible manifest.
            </p>

            {/* Add New Source */}
            <div className="flex gap-2 mb-6">
              <input
                type="text"
                value={newSourceUrl}
                onChange={(e) => setNewSourceUrl(e.target.value)}
                placeholder="https://raw.githubusercontent.com/user/repo/main"
                className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={handleAddSource}
                disabled={!newSourceUrl}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:hover:bg-green-600 rounded-lg text-white transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Source
              </button>
            </div>

            {/* Source List */}
            <div className="space-y-2">
              {sources.map((source) => (
                <div
                  key={source.url}
                  className="flex items-center justify-between p-4 bg-slate-800/50 border border-slate-700 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={source.enabled}
                      onChange={() => handleToggleSource(source.url)}
                      className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-green-500 focus:ring-green-500"
                    />
                    <div>
                      <p className="font-medium text-white">{source.name}</p>
                      <p className="text-xs text-slate-500 break-all">{source.url}</p>
                    </div>
                  </div>
                  {source.url !== DEFAULT_MARKETPLACE_URL && (
                    <button
                      onClick={() => handleRemoveSource(source.url)}
                      className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 bg-blue-600/10 border border-blue-500/30 rounded-lg">
              <h4 className="font-medium text-blue-400 mb-2">Marketplace Structure</h4>
              <p className="text-sm text-slate-400 mb-2">
                To create your own marketplace source, your repository should have:
              </p>
              <pre className="text-xs bg-slate-900 p-3 rounded text-slate-300 overflow-x-auto">
{`repo/
├── nodes/
│   ├── manifest.json      # Node definitions
│   └── node-id.json       # Individual node configs
└── workflows/
    ├── manifest.json      # Workflow templates list
    └── workflow-id.json   # Individual workflow configs`}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
