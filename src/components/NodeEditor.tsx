import { useState } from "react";
import { X, Save, Trash2, Terminal, FileCode, Package, Upload, GitBranch } from "lucide-react";
import { BuildNode } from "../store/appStore";

interface NodeEditorProps {
  node: BuildNode;
  onSave: (node: BuildNode) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function NodeEditor({ node, onSave, onDelete, onClose }: NodeEditorProps) {
  const [editedNode, setEditedNode] = useState<BuildNode>(node);

  const handleSave = () => {
    onSave(editedNode);
    onClose();
  };

  const updateConfig = (key: string, value: any) => {
    setEditedNode({
      ...editedNode,
      config: { ...editedNode.config, [key]: value },
    });
  };

  const getNodeIcon = () => {
    switch (node.type) {
      case "command": return Terminal;
      case "script": return FileCode;
      case "condition": return GitBranch;
      case "artifact": return Package;
      case "release": return Upload;
      default: return Terminal;
    }
  };

  const Icon = getNodeIcon();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-700">
          <div className="w-10 h-10 rounded-lg bg-green-500/20 text-green-400 flex items-center justify-center">
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <input
              type="text"
              value={editedNode.name}
              onChange={(e) => setEditedNode({ ...editedNode, name: e.target.value })}
              className="bg-transparent border-none text-lg font-semibold text-white focus:outline-none w-full"
              placeholder="Node name"
            />
            <p className="text-sm text-slate-400 capitalize">{editedNode.type} Node</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-auto">
          {editedNode.type === "command" && (
            <>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Command</label>
                <input
                  type="text"
                  value={editedNode.config?.command || ""}
                  onChange={(e) => updateConfig("command", e.target.value)}
                  placeholder="npm run build"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white font-mono text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Working Directory</label>
                <input
                  type="text"
                  value={editedNode.config?.cwd || ""}
                  onChange={(e) => updateConfig("cwd", e.target.value)}
                  placeholder="$PROJECT_ROOT"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white font-mono text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={editedNode.config?.continueOnError || false}
                  onChange={(e) => updateConfig("continueOnError", e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500"
                />
                <label className="text-sm text-slate-300">Continue on error</label>
              </div>
            </>
          )}

          {editedNode.type === "script" && (
            <>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Script</label>
                <textarea
                  value={editedNode.config?.script || ""}
                  onChange={(e) => updateConfig("script", e.target.value)}
                  placeholder="#!/bin/bash&#10;echo 'Hello World'"
                  rows={8}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white font-mono text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Shell</label>
                <select
                  value={editedNode.config?.shell || "bash"}
                  onChange={(e) => updateConfig("shell", e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="bash">Bash</option>
                  <option value="sh">Sh</option>
                  <option value="zsh">Zsh</option>
                  <option value="powershell">PowerShell</option>
                  <option value="cmd">CMD</option>
                </select>
              </div>
            </>
          )}

          {editedNode.type === "artifact" && (
            <>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Artifact Path</label>
                <input
                  type="text"
                  value={editedNode.config?.path || ""}
                  onChange={(e) => updateConfig("path", e.target.value)}
                  placeholder="dist/*.zip"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white font-mono text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Artifact Name</label>
                <input
                  type="text"
                  value={editedNode.config?.name || ""}
                  onChange={(e) => updateConfig("name", e.target.value)}
                  placeholder="build-artifact"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </>
          )}

          {editedNode.type === "release" && (
            <>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Release Tag</label>
                <input
                  type="text"
                  value={editedNode.config?.tag || ""}
                  onChange={(e) => updateConfig("tag", e.target.value)}
                  placeholder="v$VERSION"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white font-mono text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Release Title</label>
                <input
                  type="text"
                  value={editedNode.config?.title || ""}
                  onChange={(e) => updateConfig("title", e.target.value)}
                  placeholder="Release $VERSION"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Release Body</label>
                <textarea
                  value={editedNode.config?.body || ""}
                  onChange={(e) => updateConfig("body", e.target.value)}
                  placeholder="Release notes..."
                  rows={4}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={editedNode.config?.draft || false}
                  onChange={(e) => updateConfig("draft", e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500"
                />
                <label className="text-sm text-slate-300">Create as draft</label>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={editedNode.config?.prerelease || false}
                  onChange={(e) => updateConfig("prerelease", e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500"
                />
                <label className="text-sm text-slate-300">Mark as pre-release</label>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex gap-3">
          <button
            onClick={onDelete}
            className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-white transition-colors"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
