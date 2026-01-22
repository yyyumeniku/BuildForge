import { useState, useEffect, useCallback } from "react";
import { Package, Download, Star, Search, RefreshCw, Check, Plus, Trash2, Workflow, Clock, GitBranch, Upload, TestTube, Zap, Terminal, GitCommit, Link, FileDown } from "lucide-react";
import { useAppStore } from "../../store/appStore";

interface MarketplaceNode {
  id: string;
  name: string;
  description: string;
  type: string;
  category: string;
  author: string;
  version: string;
  color?: string;
  downloads?: number;
  stars?: number;
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

// Node type icons and colors matching WorkflowsTab
const NODE_VISUALS: Record<string, { icon: React.ElementType; color: string }> = {
  timer: { icon: Clock, color: "#06b6d4" },
  clone: { icon: Download, color: "#3b82f6" },
  pull: { icon: Download, color: "#0ea5e9" },
  sync_push: { icon: Upload, color: "#3b82f6" },
  push: { icon: Upload, color: "#6366f1" },
  checkout: { icon: GitBranch, color: "#06b6d4" },
  build: { icon: Package, color: "#10b981" },
  test: { icon: TestTube, color: "#f59e0b" },
  action: { icon: Zap, color: "#a855f7" },
  commit: { icon: GitCommit, color: "#ec4899" },
  command: { icon: Terminal, color: "#f97316" },
  deploy: { icon: Upload, color: "#8b5cf6" },
  link: { icon: Link, color: "#3b82f6" },
  download: { icon: FileDown, color: "#10b981" },
  cobalt: { icon: Download, color: "#f43f5e" },
  shell: { icon: Terminal, color: "#f97316" },
  webhook: { icon: Zap, color: "#6366f1" },
};

const DEFAULT_MARKETPLACE_URL = "https://raw.githubusercontent.com/yyyumeniku/buildforge-marketplace/main";

export function MarketplaceTab() {
  const [activeSection, setActiveSection] = useState<"nodes" | "workflows">("nodes");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [nodes, setNodes] = useState<MarketplaceNode[]>([]);
  const [workflows, setWorkflows] = useState<MarketplaceWorkflow[]>([]);
  const [sources, setSources] = useState<MarketplaceSource[]>([
    { name: "BuildForge Official", url: DEFAULT_MARKETPLACE_URL, enabled: true }
  ]);
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [installedNodes, setInstalledNodes] = useState<Set<string>>(new Set());
  const [notification, setNotification] = useState<string | null>(null);
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

  // Auto-hide notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Save installed nodes
  const saveInstalledNodes = useCallback((nodes: Set<string>) => {
    localStorage.setItem("buildforge-installed-nodes", JSON.stringify([...nodes]));
    setInstalledNodes(nodes);
  }, []);

  // Fetch marketplace data
  const fetchMarketplace = useCallback(async () => {
    setLoading(true);
    const allNodes: MarketplaceNode[] = [];
    const allWorkflows: MarketplaceWorkflow[] = [];

    for (const source of sources.filter(s => s.enabled)) {
      try {
        const nodesRes = await fetch(`${source.url}/nodes/manifest.json`);
        if (nodesRes.ok) {
          const nodesData = await nodesRes.json();
          if (nodesData.nodes) {
            allNodes.push(...nodesData.nodes.map((n: MarketplaceNode) => ({
              ...n,
              author: nodesData.author || "Unknown",
            })));
          }
        }
      } catch (e) {
        console.log(`Failed to fetch nodes from ${source.name}:`, e);
      }

      try {
        const workflowsRes = await fetch(`${source.url}/workflows/manifest.json`);
        if (workflowsRes.ok) {
          const workflowsData = await workflowsRes.json();
          if (workflowsData.workflows) {
            allWorkflows.push(...workflowsData.workflows.map((w: MarketplaceWorkflow) => ({
              ...w,
              author: workflowsData.author || "Unknown"
            })));
          }
        }
      } catch (e) {
        console.log(`Failed to fetch workflows from ${source.name}:`, e);
      }
    }

    setNodes(allNodes);
    setWorkflows(allWorkflows);
    setLoading(false);
  }, [sources]);

  useEffect(() => {
    fetchMarketplace();
  }, [fetchMarketplace]);

  const handleInstallNode = useCallback((node: MarketplaceNode) => {
    const newInstalled = new Set(installedNodes);
    newInstalled.add(node.id);
    saveInstalledNodes(newInstalled);
    setNotification(`${node.name} installed`);
  }, [installedNodes, saveInstalledNodes]);

  const handleUninstallNode = useCallback((node: MarketplaceNode) => {
    const newInstalled = new Set(installedNodes);
    newInstalled.delete(node.id);
    saveInstalledNodes(newInstalled);
    setNotification(`${node.name} uninstalled`);
  }, [installedNodes, saveInstalledNodes]);

  const handleImportWorkflow = useCallback(async (workflow: MarketplaceWorkflow) => {
    for (const source of sources.filter(s => s.enabled)) {
      try {
        const res = await fetch(`${source.url}/workflows/${workflow.id}.json`);
        if (res.ok) {
          const workflowData = await res.json();
          addWorkflow({
            name: workflowData.name || workflow.name,
            nodes: workflowData.nodes || [],
            connections: workflowData.connections || [],
            repoId: null,
            nextVersion: "1.0.0",
          });
          setNotification(`"${workflow.name}" imported to Workflows`);
          return;
        }
      } catch {
        continue;
      }
    }
    setNotification("Failed to import workflow");
  }, [sources, addWorkflow]);

  const handleAddSource = useCallback(() => {
    if (!newSourceUrl) return;
    try {
      const urlObj = new URL(newSourceUrl);
      const name = urlObj.pathname.split('/').filter(Boolean).pop() || newSourceUrl;
      const newSources = [...sources, { name, url: newSourceUrl, enabled: true }];
      setSources(newSources);
      localStorage.setItem("buildforge-marketplace-sources", JSON.stringify(newSources));
      setNewSourceUrl("");
      setNotification("Source added");
    } catch {
      setNotification("Invalid URL");
    }
  }, [newSourceUrl, sources]);

  const handleRemoveSource = useCallback((url: string) => {
    const newSources = sources.filter(s => s.url !== url);
    setSources(newSources);
    localStorage.setItem("buildforge-marketplace-sources", JSON.stringify(newSources));
  }, [sources]);

  const handleToggleSource = useCallback((url: string) => {
    const newSources = sources.map(s => 
      s.url === url ? { ...s, enabled: !s.enabled } : s
    );
    setSources(newSources);
    localStorage.setItem("buildforge-marketplace-sources", JSON.stringify(newSources));
  }, [sources]);

  const filteredNodes = nodes.filter(n => 
    n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredWorkflows = workflows.filter(w =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getNodeVisual = (type: string) => {
    return NODE_VISUALS[type] || { icon: Package, color: "#64748b" };
  };

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg animate-in slide-in-from-top-2 fade-in duration-200">
          {notification}
        </div>
      )}

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
          <Package className="w-4 h-4" />
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
      </div>

      {/* Search Bar */}
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeSection === "nodes" && (
          <div className="space-y-6">
            {/* Nodes Grid - Canvas Style */}
            {loading ? (
              <div className="text-center py-8 text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                Loading marketplace...
              </div>
            ) : filteredNodes.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                No community nodes found. Add a marketplace source below.
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredNodes.map((node) => {
                  const visual = getNodeVisual(node.type);
                  const Icon = visual.icon;
                  const isInstalled = installedNodes.has(node.id);

                  return (
                    <div
                      key={node.id}
                      className="relative group"
                    >
                      {/* Node Card - Canvas Style */}
                      <div className={`rounded-lg overflow-hidden shadow-xl border-2 transition-all ${
                        isInstalled ? "border-green-500" : "border-slate-600 hover:border-slate-500"
                      }`}>
                        {/* Header */}
                        <div 
                          className="px-3 py-2 flex items-center gap-2"
                          style={{ backgroundColor: visual.color }}
                        >
                          <Icon className="w-4 h-4 text-white" />
                          <span className="text-white text-sm font-medium truncate flex-1">
                            {node.name}
                          </span>
                        </div>
                        
                        {/* Body */}
                        <div className="bg-slate-800 p-3 space-y-2">
                          <p className="text-xs text-slate-400 line-clamp-2">{node.description}</p>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{node.author}</span>
                            <span>•</span>
                            <span>v{node.version}</span>
                          </div>
                          {(node.downloads !== undefined || node.stars !== undefined) && (
                            <div className="flex items-center gap-3 text-xs text-slate-500">
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
                          )}
                        </div>

                        {/* Footer / Action */}
                        <div className="bg-slate-900 px-3 py-2 border-t border-slate-700">
                          {isInstalled ? (
                            <button
                              onClick={() => handleUninstallNode(node)}
                              className="w-full flex items-center justify-center gap-1 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded text-xs transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                              Uninstall
                            </button>
                          ) : (
                            <button
                              onClick={() => handleInstallNode(node)}
                              className="w-full flex items-center justify-center gap-1 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-xs transition-colors"
                            >
                              <Download className="w-3 h-3" />
                              Install
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Installed Badge */}
                      {isInstalled && (
                        <div className="absolute -top-2 -right-2 bg-green-500 rounded-full p-1">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add Source Section */}
            <div className="mt-8 pt-6 border-t border-slate-700">
              <h3 className="text-lg font-medium text-white mb-4">Marketplace Sources</h3>
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  placeholder="https://raw.githubusercontent.com/user/repo/main"
                  className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                />
                <button
                  onClick={handleAddSource}
                  disabled={!newSourceUrl}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg text-white transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>

              <div className="space-y-2">
                {sources.map((source) => (
                  <div
                    key={source.url}
                    className="flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={source.enabled}
                        onChange={() => handleToggleSource(source.url)}
                        className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-green-500 focus:ring-green-500"
                      />
                      <div>
                        <p className="font-medium text-white text-sm">{source.name}</p>
                        <p className="text-xs text-slate-500 truncate max-w-md">{source.url}</p>
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
            </div>
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
                No workflow templates found.
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
      </div>
    </div>
  );
}
