import { useState } from "react";
import { X, Play, Server } from "lucide-react";
import { useAppStore, Project } from "../store/appStore";

interface BuildDialogProps {
  project: Project;
  onClose: () => void;
}

export function BuildDialog({ project, onClose }: BuildDialogProps) {
  const { servers, startBuild } = useAppStore();
  const [selectedServer, setSelectedServer] = useState<string>("");
  const [version, setVersion] = useState("1.0.0");
  const onlineServers = servers.filter(s => s.status === "online");

  const handleStartBuild = () => {
    if (!selectedServer || !version) return;
    
    const server = servers.find(s => s.id === selectedServer);
    if (!server) return;

    startBuild({
      projectId: project.id,
      projectName: project.name,
      serverId: server.id,
      serverName: server.name,
      version,
      nodes: project.nodes,
      edges: project.edges,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">Start Build</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Project Info */}
          <div className="bg-slate-900 rounded-lg p-3">
            <p className="text-sm text-slate-400">Project</p>
            <p className="text-white font-medium">{project.name}</p>
            <p className="text-xs text-slate-500">{project.nodes.length} nodes configured</p>
          </div>

          {/* Version */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Version</label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0.0"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Server Selection */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">Build Server</label>
            {onlineServers.length === 0 ? (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-center">
                <p className="text-yellow-400 text-sm">No servers online</p>
                <p className="text-yellow-400/60 text-xs mt-1">
                  Connect a build server first
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {onlineServers.map((server) => (
                  <button
                    key={server.id}
                    onClick={() => setSelectedServer(server.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedServer === server.id
                        ? "bg-green-600/20 border-green-500/50"
                        : "bg-slate-700 border-slate-600 hover:border-slate-500"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Server className="w-5 h-5 text-slate-400" />
                      <div>
                        <p className="text-white font-medium">{server.name}</p>
                        <p className="text-xs text-slate-400">{server.os} • {server.address}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStartBuild}
            disabled={!selectedServer || !version || onlineServers.length === 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
          >
            <Play className="w-4 h-4" />
            Start Build
          </button>
        </div>
      </div>
    </div>
  );
}
