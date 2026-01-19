import { 
  LayoutDashboard, 
  FolderKanban, 
  Server, 
  History, 
  Settings,
  Hammer,
  ChevronLeft,
  ChevronRight,
  LogOut
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import { cn } from "../lib/utils";

const navItems = [
  { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
  { id: "projects" as const, label: "Projects", icon: FolderKanban },
  { id: "servers" as const, label: "Servers", icon: Server },
  { id: "history" as const, label: "History", icon: History },
  { id: "settings" as const, label: "Settings", icon: Settings },
];

export function Sidebar() {
  const { 
    currentView, 
    setCurrentView, 
    sidebarOpen, 
    setSidebarOpen,
    user,
    logout,
    activeBuilds
  } = useAppStore();

  return (
    <div 
      className={cn(
        "h-full flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-300",
        sidebarOpen ? "w-64" : "w-16"
      )}
    >
      {/* Logo */}
      <div className="p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center flex-shrink-0">
          <Hammer className="w-4 h-4 text-white" />
        </div>
        {sidebarOpen && (
          <span className="font-bold text-white">BuildForge</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setCurrentView(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
              currentView === item.id
                ? "bg-green-600/20 text-green-400"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            )}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span>{item.label}</span>}
            {item.id === "dashboard" && activeBuilds.length > 0 && (
              <span className="ml-auto w-5 h-5 rounded-full bg-green-500 text-white text-xs flex items-center justify-center building">
                {activeBuilds.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* User */}
      {sidebarOpen && user && (
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <img 
              src={user.avatar_url} 
              alt={user.name}
              className="w-8 h-8 rounded-full"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium truncate">{user.name}</p>
              <p className="text-xs text-slate-500 truncate">@{user.login}</p>
            </div>
            <button 
              onClick={logout}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="p-4 border-t border-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
      >
        {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
      </button>
    </div>
  );
}
