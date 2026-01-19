import { 
  Activity, 
  CheckCircle2, 
  Clock, 
  XCircle,
  Play,
  Zap,
  Server,
  FolderKanban,
  ArrowUpRight,
  Calendar
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import { formatDistanceToNow } from "date-fns";

export function Dashboard() {
  const { 
    projects, 
    servers, 
    builds, 
    activeBuilds,
    setCurrentView 
  } = useAppStore();

  const successBuilds = builds.filter(b => b.status === "success").length;
  const failedBuilds = builds.filter(b => b.status === "failed").length;
  const onlineServers = servers.filter(s => s.status === "online").length;

  const recentBuilds = builds.slice(0, 5);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400">Overview of your build infrastructure</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Builds"
          value={activeBuilds.length}
          icon={Activity}
          color="green"
          pulse={activeBuilds.length > 0}
        />
        <StatCard
          title="Success Rate"
          value={builds.length > 0 ? `${Math.round((successBuilds / builds.length) * 100)}%` : "N/A"}
          icon={CheckCircle2}
          color="emerald"
        />
        <StatCard
          title="Failed Builds"
          value={failedBuilds}
          icon={XCircle}
          color="red"
        />
        <StatCard
          title="Online Servers"
          value={`${onlineServers}/${servers.length}`}
          icon={Server}
          color="blue"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickAction
          title="New Build"
          description="Start a new build job"
          icon={Play}
          onClick={() => setCurrentView("projects")}
        />
        <QuickAction
          title="Add Server"
          description="Connect a build server"
          icon={Server}
          onClick={() => setCurrentView("servers")}
        />
        <QuickAction
          title="Create Project"
          description="Set up a new project"
          icon={FolderKanban}
          onClick={() => setCurrentView("projects")}
        />
      </div>

      {/* Recent Builds */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Recent Builds</h2>
          <button 
            onClick={() => setCurrentView("history")}
            className="text-sm text-green-400 hover:text-green-300 flex items-center gap-1"
          >
            View All <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>

        {recentBuilds.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No builds yet</p>
            <p className="text-sm">Start your first build to see it here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentBuilds.map((build) => (
              <BuildRow key={build.id} build={build} />
            ))}
          </div>
        )}
      </div>

      {/* Servers Overview */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Servers</h2>
          <button 
            onClick={() => setCurrentView("servers")}
            className="text-sm text-green-400 hover:text-green-300 flex items-center gap-1"
          >
            Manage <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>

        {servers.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No servers connected</p>
            <p className="text-sm">Add a build server to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {servers.map((server) => (
              <ServerCard key={server.id} server={server} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  color,
  pulse 
}: { 
  title: string; 
  value: string | number; 
  icon: any; 
  color: string;
  pulse?: boolean;
}) {
  const colorClasses: Record<string, string> = {
    green: "bg-green-500/20 text-green-400",
    emerald: "bg-emerald-500/20 text-emerald-400",
    red: "bg-red-500/20 text-red-400",
    blue: "bg-blue-500/20 text-blue-400",
    yellow: "bg-yellow-500/20 text-yellow-400",
  };

  return (
    <div className={`bg-slate-800/50 rounded-xl border border-slate-700 p-4 ${pulse ? 'building' : ''}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-sm text-slate-400">{title}</p>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ 
  title, 
  description, 
  icon: Icon, 
  onClick 
}: { 
  title: string; 
  description: string; 
  icon: any; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700 hover:border-green-500/50 p-4 text-left transition-all duration-200 group"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-green-500/20 text-green-400 flex items-center justify-center group-hover:bg-green-500 group-hover:text-white transition-colors">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="font-medium text-white">{title}</p>
          <p className="text-sm text-slate-400">{description}</p>
        </div>
      </div>
    </button>
  );
}

function BuildRow({ build }: { build: any }) {
  const statusIcons: Record<string, any> = {
    success: CheckCircle2,
    failed: XCircle,
    running: Activity,
    queued: Clock,
    cancelled: XCircle,
  };

  const statusColors: Record<string, string> = {
    success: "text-green-400",
    failed: "text-red-400",
    running: "text-yellow-400",
    queued: "text-slate-400",
    cancelled: "text-slate-400",
  };

  const Icon = statusIcons[build.status] || Clock;
  const colorClass = statusColors[build.status] || "text-slate-400";

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors">
      <div className={`${colorClass} ${build.status === 'running' ? 'animate-pulse' : ''}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white truncate">{build.projectName}</p>
        <p className="text-sm text-slate-400">v{build.version} • {build.serverName}</p>
      </div>
      <div className="text-right">
        <p className="text-sm text-slate-400">
          {formatDistanceToNow(new Date(build.startedAt), { addSuffix: true })}
        </p>
        {build.duration && (
          <p className="text-xs text-slate-500">{build.duration}s</p>
        )}
      </div>
    </div>
  );
}

function ServerCard({ server }: { server: any }) {
  const statusColors: Record<string, string> = {
    online: "bg-green-500",
    offline: "bg-red-500",
    connecting: "bg-yellow-500",
  };

  return (
    <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${statusColors[server.status]}`} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-white truncate">{server.name}</p>
          <p className="text-sm text-slate-400">{server.address}:{server.port}</p>
        </div>
      </div>
      <div className="mt-3 text-xs text-slate-500">
        {server.os} • Last seen {formatDistanceToNow(new Date(server.lastSeen), { addSuffix: true })}
      </div>
    </div>
  );
}
