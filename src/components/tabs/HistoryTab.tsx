import { useState } from "react";
import { Clock, CheckCircle, XCircle, Play, Filter } from "lucide-react";

interface BuildHistory {
  id: string;
  workflowName: string;
  repo: string;
  status: "success" | "failed" | "running";
  startedAt: string;
  duration: number;
  version: string;
}

export function HistoryTab() {
  const [filter, setFilter] = useState<"all" | "success" | "failed">("all");
  
  const [history] = useState<BuildHistory[]>([
    {
      id: "1",
      workflowName: "HyPrism Release",
      repo: "hyprcub/HyPrism",
      status: "success",
      startedAt: new Date(Date.now() - 3600000).toISOString(),
      duration: 125,
      version: "v1.0.0",
    },
    {
      id: "2",
      workflowName: "HyPrism Release",
      repo: "hyprcub/HyPrism",
      status: "failed",
      startedAt: new Date(Date.now() - 7200000).toISOString(),
      duration: 45,
      version: "v0.9.9",
    },
  ]);

  const filteredHistory = history.filter((h) => 
    filter === "all" || h.status === filter
  );

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 3600000) {
      return `${Math.floor(diff / 60000)} min ago`;
    } else if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)} hours ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}m ${sec}s`;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Build History</h2>
          <p className="text-slate-400 mt-1">View past workflow runs</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none"
          >
            <option value="all">All</option>
            <option value="success">Successful</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {filteredHistory.map((build) => (
          <div
            key={build.id}
            className="flex items-center gap-4 p-4 bg-slate-800/50 border border-slate-700 rounded-lg"
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              build.status === "success" ? "bg-green-600/20" :
              build.status === "failed" ? "bg-red-600/20" : "bg-blue-600/20"
            }`}>
              {build.status === "success" ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : build.status === "failed" ? (
                <XCircle className="w-5 h-5 text-red-400" />
              ) : (
                <Play className="w-5 h-5 text-blue-400 animate-pulse" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">{build.workflowName}</span>
                <span className="px-2 py-0.5 text-xs bg-slate-700 text-slate-300 rounded">
                  {build.version}
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-1">{build.repo}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Clock className="w-4 h-4" />
                {formatDuration(build.duration)}
              </div>
              <p className="text-xs text-slate-500 mt-1">{formatTime(build.startedAt)}</p>
            </div>
          </div>
        ))}

        {filteredHistory.length === 0 && (
          <div className="text-center py-20 text-slate-500">
            <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No build history yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
