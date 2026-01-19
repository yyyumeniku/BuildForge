import { useState, useCallback } from "react";
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  NodeTypes,
  Panel,
} from "reactflow";
import "reactflow/dist/style.css";
import { 
  Plus, 
  Play, 
  Save, 
  Trash2, 
  Terminal, 
  FileCode, 
  GitBranch,
  Package,
  Upload,
  Clock,
  Settings,
  FolderPlus
} from "lucide-react";
import { useAppStore, BuildNode, Project } from "../store/appStore";
import { NodeEditor } from "./NodeEditor";
import { BuildDialog } from "./BuildDialog";

const nodeTypes: Record<string, React.FC<any>> = {
  command: CommandNode,
  script: ScriptNode,
  condition: ConditionNode,
  artifact: ArtifactNode,
  release: ReleaseNode,
};

export function ProjectsView() {
  const { 
    projects, 
    selectedProjectId, 
    selectProject, 
    addProject,
    updateProject,
    removeProject 
  } = useAppStore();

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectPath, setNewProjectPath] = useState("");

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  const handleCreateProject = () => {
    if (!newProjectName.trim() || !newProjectPath.trim()) return;
    
    addProject({
      name: newProjectName,
      path: newProjectPath,
      gitRepo: null,
      nodes: [],
      edges: [],
      schedule: null,
    });
    
    setShowNewProject(false);
    setNewProjectName("");
    setNewProjectPath("");
  };

  return (
    <div className="h-full flex">
      {/* Project List */}
      <div className="w-64 border-r border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <h2 className="font-semibold text-white mb-3">Projects</h2>
          <button
            onClick={() => setShowNewProject(true)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-white text-sm transition-colors"
          >
            <FolderPlus className="w-4 h-4" />
            New Project
          </button>
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-1">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => selectProject(project.id)}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                selectedProjectId === project.id
                  ? "bg-green-600/20 text-green-400 border border-green-500/30"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <p className="font-medium truncate">{project.name}</p>
              <p className="text-xs text-slate-500 truncate">{project.path}</p>
              {project.lastStatus && (
                <div className={`text-xs mt-1 ${
                  project.lastStatus === "success" ? "text-green-400" : "text-red-400"
                }`}>
                  Last: {project.lastStatus}
                </div>
              )}
            </button>
          ))}

          {projects.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              <p className="text-sm">No projects yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Project Editor */}
      <div className="flex-1">
        {selectedProject ? (
          <ProjectEditor project={selectedProject} />
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500">
            <div className="text-center">
              <FolderPlus className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Select a project or create a new one</p>
            </div>
          </div>
        )}
      </div>

      {/* New Project Dialog */}
      {showNewProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">New Project</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Project Name</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="My App"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Project Path</label>
                <input
                  type="text"
                  value={newProjectPath}
                  onChange={(e) => setNewProjectPath(e.target.value)}
                  placeholder="~/projects/my-app"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowNewProject(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateProject}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-white transition-colors"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectEditor({ project }: { project: Project }) {
  const { updateProject, servers } = useAppStore();
  const [showBuildDialog, setShowBuildDialog] = useState(false);
  const [selectedNode, setSelectedNode] = useState<BuildNode | null>(null);

  const initialNodes: Node[] = project.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: { ...node.config, name: node.name },
  }));

  const initialEdges: Edge[] = project.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: true,
    style: { stroke: "hsl(142, 76%, 36%)" },
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({
      ...params,
      animated: true,
      style: { stroke: "hsl(142, 76%, 36%)" },
    }, eds)),
    [setEdges]
  );

  const addNode = (type: BuildNode["type"]) => {
    const id = crypto.randomUUID();
    const newNode: Node = {
      id,
      type,
      position: { x: 250, y: nodes.length * 100 + 50 },
      data: { name: `${type} node` },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const saveProject = () => {
    const buildNodes: BuildNode[] = nodes.map((node) => ({
      id: node.id,
      type: node.type as BuildNode["type"],
      name: node.data.name || node.type,
      config: node.data,
      position: node.position,
    }));

    const buildEdges = edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    }));

    updateProject(project.id, { nodes: buildNodes, edges: buildEdges });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white">{project.name}</h2>
          <p className="text-sm text-slate-400">{project.path}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={saveProject}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-sm transition-colors"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
          <button
            onClick={() => setShowBuildDialog(true)}
            disabled={servers.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm transition-colors"
          >
            <Play className="w-4 h-4" />
            Build
          </button>
        </div>
      </div>

      {/* Node Editor */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          className="node-editor"
        >
          <Background color="#334155" gap={20} />
          <Controls className="bg-slate-800 border-slate-700" />
          
          <Panel position="top-left" className="flex gap-2">
            <NodeButton icon={Terminal} label="Command" onClick={() => addNode("command")} />
            <NodeButton icon={FileCode} label="Script" onClick={() => addNode("script")} />
            <NodeButton icon={Package} label="Artifact" onClick={() => addNode("artifact")} />
            <NodeButton icon={Upload} label="Release" onClick={() => addNode("release")} />
          </Panel>
        </ReactFlow>
      </div>

      {/* Build Dialog */}
      {showBuildDialog && (
        <BuildDialog
          project={project}
          onClose={() => setShowBuildDialog(false)}
        />
      )}
    </div>
  );
}

function NodeButton({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-white text-sm transition-colors"
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

// Node Components
function CommandNode({ data }: { data: any }) {
  return (
    <div className="node-step px-4 py-3 rounded-lg min-w-[200px]">
      <div className="flex items-center gap-2 mb-2">
        <Terminal className="w-4 h-4 text-green-400" />
        <span className="font-medium text-white text-sm">Command</span>
      </div>
      <p className="text-xs text-slate-400">{data.name || "Run command"}</p>
    </div>
  );
}

function ScriptNode({ data }: { data: any }) {
  return (
    <div className="node-step px-4 py-3 rounded-lg min-w-[200px]">
      <div className="flex items-center gap-2 mb-2">
        <FileCode className="w-4 h-4 text-blue-400" />
        <span className="font-medium text-white text-sm">Script</span>
      </div>
      <p className="text-xs text-slate-400">{data.name || "Run script"}</p>
    </div>
  );
}

function ConditionNode({ data }: { data: any }) {
  return (
    <div className="node-step px-4 py-3 rounded-lg min-w-[200px]">
      <div className="flex items-center gap-2 mb-2">
        <GitBranch className="w-4 h-4 text-yellow-400" />
        <span className="font-medium text-white text-sm">Condition</span>
      </div>
      <p className="text-xs text-slate-400">{data.name || "If/else"}</p>
    </div>
  );
}

function ArtifactNode({ data }: { data: any }) {
  return (
    <div className="node-step px-4 py-3 rounded-lg min-w-[200px]">
      <div className="flex items-center gap-2 mb-2">
        <Package className="w-4 h-4 text-purple-400" />
        <span className="font-medium text-white text-sm">Artifact</span>
      </div>
      <p className="text-xs text-slate-400">{data.name || "Collect artifact"}</p>
    </div>
  );
}

function ReleaseNode({ data }: { data: any }) {
  return (
    <div className="node-step px-4 py-3 rounded-lg min-w-[200px]">
      <div className="flex items-center gap-2 mb-2">
        <Upload className="w-4 h-4 text-orange-400" />
        <span className="font-medium text-white text-sm">GitHub Release</span>
      </div>
      <p className="text-xs text-slate-400">{data.name || "Create release"}</p>
    </div>
  );
}
