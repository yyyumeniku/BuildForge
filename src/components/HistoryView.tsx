import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Activity,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Search,
  Filter
} from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { formatDistanceToNow, format } from "date-fns";

export function HistoryView() {
  const { builds } = useAppStore();
  const [expandedBuild, setExpandedBuild] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredBuilds = builds.filter((build) => {
    const matchesSearch = 
      build.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      build.version.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || build.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-400" />;
      case "running":
        return <Activity className="w-5 h-5 text-yellow-400 animate-pulse" />;
      case "queued":
        return <Clock className="w-5 h-5 text-slate-400" />;
      default:
        return <XCircle className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "text-green-400 bg-green-500/10";
      case "failed":
        return "text-red-400 bg-red-500/10";
      case "running":
        return "text-yellow-400 bg-yellow-500/10";
      default:
        return "text-slate-400 bg-slate-500/10";
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Build History</h1>
        <p className="text-slate-400">View all past and current builds</p>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search builds..."
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="all">All Status</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="running">Running</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Build List */}
      {filteredBuilds.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-12 text-center">
          <Clock className="w-16 h-16 mx-auto mb-4 text-slate-600" />
          <h3 className="text-lg font-medium text-white mb-2">No builds found</h3>
          <p className="text-slate-400">
            {builds.length === 0 
              ? "Start your first build to see it here" 
              : "No builds match your search criteria"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBuilds.map((build) => (
            <div
              key={build.id}
              className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden"
            >
              {/* Build Header */}
              <button
                onClick={() => setExpandedBuild(expandedBuild === build.id ? null : build.id)}
                className="w-full p-4 flex items-center gap-4 hover:bg-slate-800/80 transition-colors"
              >
                {getStatusIcon(build.status)}
                
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{build.projectName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(build.status)}`}>
                      {build.status}
                    </span>
                  </div>
                  <div className="text-sm text-slate-400">
                    v{build.version} • {build.serverName}
                  </div>
                </div>

                <div className="text-right text-sm">
                  <div className="text-slate-300">
                    {format(new Date(build.startedAt), "MMM d, yyyy HH:mm")}
                  </div>
                  <div className="text-slate-500">
                    {build.duration ? `${build.duration}s` : formatDistanceToNow(new Date(build.startedAt), { addSuffix: true })}
                  </div>
                </div>

                {expandedBuild === build.id ? (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                )}
              </button>

              {/* Expanded Content */}
              {expandedBuild === build.id && (
                <div className="border-t border-slate-700 p-4 space-y-4">
                  {/* Progress */}
                  {build.status === "running" && (
                    <div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-slate-400">Progress</span>
                        <span className="text-white">{build.progress}%</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500 transition-all duration-500"
                          style={{ width: `${build.progress}%` }}
                        />
                      </div>
                      {build.currentNode && (
                        <p className="text-xs text-slate-500 mt-1">
                          Current: {build.currentNode}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Release URL */}
                  {build.releaseUrl && (
                    <a
                      href={build.releaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-green-400 hover:text-green-300 text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View Release on GitHub
                    </a>
                  )}

                  {/* Logs */}
                  <div>
                    <h4 className="text-sm font-medium text-white mb-2">Build Logs</h4>
                    <div className="bg-slate-900 rounded-lg p-4 max-h-64 overflow-auto build-log">
                      {build.logs.map((log, i) => (
                        <div 
                          key={i} 
                          className={
                            log.includes("✓") || log.includes("Success") 
                              ? "success" 
                              : log.includes("✗") || log.includes("Error") || log.includes("Failed")
                              ? "error"
                              : log.includes("▶")
                              ? "info"
                              : ""
                          }
                        >
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
