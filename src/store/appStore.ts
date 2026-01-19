import { create } from "zustand";
import { persist } from "zustand/middleware";

// Types
export interface GitHubUser {
  id: number;
  login: string;
  name: string;
  avatar_url: string;
  email: string | null;
}

export interface Server {
  id: string;
  name: string;
  address: string;
  port: number;
  status: "online" | "offline" | "connecting";
  os: string;
  lastSeen: string;
}

export interface BuildNode {
  id: string;
  type: "command" | "script" | "condition" | "parallel" | "artifact" | "release";
  name: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface BuildEdge {
  id: string;
  source: string;
  target: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  gitRepo: string | null;
  nodes: BuildNode[];
  edges: BuildEdge[];
  schedule: string | null; // Cron expression
  lastBuild: string | null;
  lastStatus: "success" | "failed" | "running" | null;
}

export interface Build {
  id: string;
  projectId: string;
  projectName: string;
  serverId: string;
  serverName: string;
  version: string;
  status: "queued" | "running" | "success" | "failed" | "cancelled";
  progress: number;
  currentNode: string | null;
  startedAt: string;
  finishedAt: string | null;
  duration: number | null;
  logs: string[];
  releaseUrl: string | null;
}

export interface ScheduledBuild {
  id: string;
  projectId: string;
  cron: string;
  nextRun: string;
  enabled: boolean;
}

interface AppState {
  // Auth
  isAuthenticated: boolean;
  user: GitHubUser | null;
  accessToken: string | null;
  
  // Servers
  servers: Server[];
  selectedServerId: string | null;
  
  // Projects
  projects: Project[];
  selectedProjectId: string | null;
  
  // Builds
  builds: Build[];
  activeBuilds: string[];
  
  // Schedules
  scheduledBuilds: ScheduledBuild[];
  
  // UI State
  sidebarOpen: boolean;
  currentView: "dashboard" | "projects" | "servers" | "history" | "settings";
  
  // Actions
  checkAuth: () => void;
  login: (token: string, user: GitHubUser) => void;
  logout: () => void;
  
  addServer: (server: Omit<Server, "id" | "status" | "lastSeen">) => void;
  removeServer: (id: string) => void;
  updateServerStatus: (id: string, status: Server["status"]) => void;
  selectServer: (id: string | null) => void;
  
  addProject: (project: Omit<Project, "id" | "lastBuild" | "lastStatus">) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  removeProject: (id: string) => void;
  selectProject: (id: string | null) => void;
  
  startBuild: (projectId: string, serverId: string, version: string, isRelease: boolean) => Promise<string>;
  cancelBuild: (buildId: string) => void;
  updateBuild: (buildId: string, updates: Partial<Build>) => void;
  addBuildLog: (buildId: string, log: string) => void;
  
  addScheduledBuild: (schedule: Omit<ScheduledBuild, "id">) => void;
  removeScheduledBuild: (id: string) => void;
  toggleScheduledBuild: (id: string) => void;
  
  setSidebarOpen: (open: boolean) => void;
  setCurrentView: (view: AppState["currentView"]) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      isAuthenticated: false,
      user: null,
      accessToken: null,
      servers: [],
      selectedServerId: null,
      projects: [],
      selectedProjectId: null,
      builds: [],
      activeBuilds: [],
      scheduledBuilds: [],
      sidebarOpen: true,
      currentView: "dashboard",
      
      // Auth actions
      checkAuth: () => {
        const token = get().accessToken;
        if (token) {
          set({ isAuthenticated: true });
        }
      },
      
      login: (token, user) => {
        set({ isAuthenticated: true, accessToken: token, user });
      },
      
      logout: () => {
        set({ 
          isAuthenticated: false, 
          accessToken: null, 
          user: null,
          servers: [],
          selectedServerId: null,
        });
      },
      
      // Server actions
      addServer: (server) => {
        const id = crypto.randomUUID();
        set((state) => ({
          servers: [
            ...state.servers,
            { ...server, id, status: "offline", lastSeen: new Date().toISOString() },
          ],
        }));
      },
      
      removeServer: (id) => {
        set((state) => ({
          servers: state.servers.filter((s) => s.id !== id),
          selectedServerId: state.selectedServerId === id ? null : state.selectedServerId,
        }));
      },
      
      updateServerStatus: (id, status) => {
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id ? { ...s, status, lastSeen: new Date().toISOString() } : s
          ),
        }));
      },
      
      selectServer: (id) => {
        set({ selectedServerId: id });
      },
      
      // Project actions
      addProject: (project) => {
        const id = crypto.randomUUID();
        set((state) => ({
          projects: [
            ...state.projects,
            { ...project, id, lastBuild: null, lastStatus: null },
          ],
        }));
      },
      
      updateProject: (id, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        }));
      },
      
      removeProject: (id) => {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
        }));
      },
      
      selectProject: (id) => {
        set({ selectedProjectId: id });
      },
      
      // Build actions
      startBuild: async (projectId, serverId, version, isRelease) => {
        const project = get().projects.find((p) => p.id === projectId);
        const server = get().servers.find((s) => s.id === serverId);
        
        if (!project || !server) {
          throw new Error("Project or server not found");
        }
        
        const buildId = crypto.randomUUID();
        const build: Build = {
          id: buildId,
          projectId,
          projectName: project.name,
          serverId,
          serverName: server.name,
          version,
          status: "queued",
          progress: 0,
          currentNode: null,
          startedAt: new Date().toISOString(),
          finishedAt: null,
          duration: null,
          logs: [`Build started for ${project.name} v${version}`],
          releaseUrl: isRelease ? null : undefined,
        };
        
        set((state) => ({
          builds: [build, ...state.builds],
          activeBuilds: [...state.activeBuilds, buildId],
        }));
        
        // Update project last build
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId ? { ...p, lastBuild: new Date().toISOString(), lastStatus: "running" } : p
          ),
        }));
        
        return buildId;
      },
      
      cancelBuild: (buildId) => {
        set((state) => ({
          builds: state.builds.map((b) =>
            b.id === buildId ? { ...b, status: "cancelled", finishedAt: new Date().toISOString() } : b
          ),
          activeBuilds: state.activeBuilds.filter((id) => id !== buildId),
        }));
      },
      
      updateBuild: (buildId, updates) => {
        set((state) => ({
          builds: state.builds.map((b) =>
            b.id === buildId ? { ...b, ...updates } : b
          ),
        }));
        
        // If build finished, remove from active and update project
        if (updates.status === "success" || updates.status === "failed") {
          const build = get().builds.find((b) => b.id === buildId);
          if (build) {
            set((state) => ({
              activeBuilds: state.activeBuilds.filter((id) => id !== buildId),
              projects: state.projects.map((p) =>
                p.id === build.projectId ? { ...p, lastStatus: updates.status as "success" | "failed" } : p
              ),
            }));
          }
        }
      },
      
      addBuildLog: (buildId, log) => {
        set((state) => ({
          builds: state.builds.map((b) =>
            b.id === buildId ? { ...b, logs: [...b.logs, log] } : b
          ),
        }));
      },
      
      // Schedule actions
      addScheduledBuild: (schedule) => {
        const id = crypto.randomUUID();
        set((state) => ({
          scheduledBuilds: [...state.scheduledBuilds, { ...schedule, id }],
        }));
      },
      
      removeScheduledBuild: (id) => {
        set((state) => ({
          scheduledBuilds: state.scheduledBuilds.filter((s) => s.id !== id),
        }));
      },
      
      toggleScheduledBuild: (id) => {
        set((state) => ({
          scheduledBuilds: state.scheduledBuilds.map((s) =>
            s.id === id ? { ...s, enabled: !s.enabled } : s
          ),
        }));
      },
      
      // UI actions
      setSidebarOpen: (open) => {
        set({ sidebarOpen: open });
      },
      
      setCurrentView: (view) => {
        set({ currentView: view });
      },
    }),
    {
      name: "buildforge-storage",
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        servers: state.servers,
        projects: state.projects,
        scheduledBuilds: state.scheduledBuilds,
      }),
    }
  )
);
