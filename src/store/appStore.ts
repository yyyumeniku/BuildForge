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

// GitHub Release types
export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; download_count: number; size: number }[];
}

// Repository that can be shared between tabs
export interface LocalRepo {
  id: string;
  path: string;
  name: string;
  gitRemote: string | null;
  owner: string | null;
  repo: string | null;
  isFork: boolean;
  releases: GitHubRelease[];
  branches: string[];
  latestVersion: string | null;
  nextVersion: string | null;
  defaultBranch: string;
  detectedBuildSystem: BuildSystem | null;
}

export type BuildSystem = "npm" | "yarn" | "pnpm" | "cargo" | "go" | "gradle" | "maven" | "cmake" | "make" | "python" | "dotnet" | "unknown";

// Workflow types for persistence
export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  config: {
    server?: string;
    command?: string;
    branch?: string;
    version?: string;
    releaseName?: string;
    buildSystem?: BuildSystem;
    buildDir?: string;
    artifactPattern?: string;
    artifactPaths?: string;
    actionId?: string; // Reference to a LocalAction
    actionInputs?: Record<string, string>; // Input values for the action
  };
}

export interface WorkflowConnection {
  id: string;
  from: string;
  to: string;
}

export interface Workflow {
  id: string;
  name: string;
  repoId: string | null; // Reference to LocalRepo
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  nextVersion: string;
  variables?: Record<string, string>;
  history?: WorkflowNode[][];
  historyIndex?: number;
}

// Local Action - reusable script/command that can be used in workflows
export interface LocalAction {
  id: string;
  name: string;
  description: string;
  script: string; // Shell script content
  inputs: { name: string; description: string; required: boolean; default?: string }[];
  outputs: { name: string; description: string }[];
  createdAt: string;
  updatedAt: string;
}

// App Settings
export interface AppSettings {
  storagePath: string | null; // Custom storage path, null = default
  theme: "dark" | "light" | "system";
  autoSave: boolean;
  notificationsEnabled: boolean;
}

// Run log entry for terminal output
export interface RunLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "success" | "command";
  message: string;
  nodeId?: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: "running" | "success" | "failed" | "cancelled";
  progress: number;
  currentNodeId: string | null;
  logs: RunLogEntry[];
  startedAt: string;
  finishedAt: string | null;
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
  
  // Repositories (shared between tabs)
  repos: LocalRepo[];
  selectedRepoId: string | null;
  
  // Workflows
  workflows: Workflow[];
  selectedWorkflowId: string | null;
  
  // Current workflow run
  currentRun: WorkflowRun | null;
  
  // Local Actions
  localActions: LocalAction[];
  
  // App Settings
  settings: AppSettings;
  
  // Undo/Redo history
  history: {
    past: Partial<AppState>[];
    future: Partial<AppState>[];
  };
  
  // UI State
  sidebarOpen: boolean;
  currentView: "dashboard" | "projects" | "servers" | "history" | "settings";
  
  // Actions
  checkAuth: () => void;
  login: (token: string, user: GitHubUser) => void;
  logout: () => void;
  
  setServers: (servers: Server[]) => void;
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
  
  // Repository actions
  addRepo: (repo: Omit<LocalRepo, "id">) => string;
  updateRepo: (id: string, updates: Partial<LocalRepo>) => void;
  removeRepo: (id: string) => void;
  selectRepo: (id: string | null) => void;
  
  // Workflow actions
  addWorkflow: (workflow: Omit<Workflow, "id">) => string;
  updateWorkflow: (id: string, updates: Partial<Workflow>) => void;
  removeWorkflow: (id: string) => void;
  selectWorkflow: (id: string | null) => void;
  renameWorkflow: (id: string, name: string) => void;
  
  // Workflow run actions
  startWorkflowRun: (workflowId: string) => string;
  addRunLog: (log: Omit<RunLogEntry, "timestamp">) => void;
  updateRun: (updates: Partial<WorkflowRun>) => void;
  endWorkflowRun: (status: "success" | "failed" | "cancelled") => void;
  clearCurrentRun: () => void;
  
  // Local Actions
  addLocalAction: (action: Omit<LocalAction, "id" | "createdAt" | "updatedAt">) => string;
  updateLocalAction: (id: string, updates: Partial<LocalAction>) => void;
  removeLocalAction: (id: string) => void;
  
  // Settings actions
  updateSettings: (updates: Partial<AppSettings>) => void;
  
  // Undo/Redo actions
  undo: () => void;
  redo: () => void;
  saveHistory: () => void;
  
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
      repos: [],
      selectedRepoId: null,
      workflows: [{
        id: "default",
        name: "New Workflow",
        repoId: null,
        nodes: [],
        connections: [],
        nextVersion: "1.0.0",
        variables: {},
        history: [],
        historyIndex: -1,
      }],
      selectedWorkflowId: "default",
      currentRun: null,
      localActions: [],
      settings: {
        storagePath: null,
        theme: "dark",
        autoSave: true,
        notificationsEnabled: true,
      },
      
      history: {
        past: [],
        future: [],
      },
      
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
      setServers: (servers) => {
        set({ servers });
      },
      
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
          releaseUrl: isRelease ? null : null,
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
      
      // Repository actions
      addRepo: (repo) => {
        const id = crypto.randomUUID();
        set((state) => ({
          repos: [...state.repos, { ...repo, id }],
        }));
        return id;
      },
      
      updateRepo: (id, updates) => {
        set((state) => ({
          repos: state.repos.map((r) =>
            r.id === id ? { ...r, ...updates } : r
          ),
        }));
      },
      
      removeRepo: (id) => {
        set((state) => ({
          repos: state.repos.filter((r) => r.id !== id),
          selectedRepoId: state.selectedRepoId === id ? null : state.selectedRepoId,
        }));
      },
      
      selectRepo: (id) => {
        set({ selectedRepoId: id });
      },
      
      // Workflow actions
      addWorkflow: (workflow) => {
        const id = crypto.randomUUID();
        set((state) => ({
          workflows: [...state.workflows, { ...workflow, id }],
        }));
        return id;
      },
      
      updateWorkflow: (id, updates) => {
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === id ? { ...w, ...updates } : w
          ),
        }));
      },
      
      removeWorkflow: (id) => {
        set((state) => ({
          workflows: state.workflows.filter((w) => w.id !== id),
          selectedWorkflowId: state.selectedWorkflowId === id 
            ? (state.workflows.length > 1 ? state.workflows[0].id : null)
            : state.selectedWorkflowId,
        }));
      },
      
      selectWorkflow: (id) => {
        set({ selectedWorkflowId: id });
      },
      
      renameWorkflow: (id, name) => {
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === id ? { ...w, name } : w
          ),
        }));
      },
      
      // Local Actions
      addLocalAction: (action) => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const newAction: LocalAction = {
          ...action,
          id,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          localActions: [...state.localActions, newAction],
        }));
        return id;
      },
      
      updateLocalAction: (id, updates) => {
        set((state) => ({
          localActions: state.localActions.map((a) =>
            a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a
          ),
        }));
      },
      
      removeLocalAction: (id) => {
        set((state) => ({
          localActions: state.localActions.filter((a) => a.id !== id),
        }));
      },
      
      // Settings actions
      updateSettings: (updates) => {
        set((state) => ({
          settings: { ...state.settings, ...updates },
        }));
      },
      
      // Workflow run actions
      startWorkflowRun: (workflowId) => {
        const runId = crypto.randomUUID();
        const run: WorkflowRun = {
          id: runId,
          workflowId,
          status: "running",
          progress: 0,
          currentNodeId: null,
          logs: [{
            timestamp: new Date().toISOString(),
            level: "info",
            message: "Starting workflow run...",
          }],
          startedAt: new Date().toISOString(),
          finishedAt: null,
        };
        set({ currentRun: run });
        return runId;
      },
      
      addRunLog: (log) => {
        const currentRun = get().currentRun;
        if (currentRun) {
          set({
            currentRun: {
              ...currentRun,
              logs: [...currentRun.logs, { ...log, timestamp: new Date().toISOString() }],
            },
          });
        }
      },
      
      updateRun: (updates) => {
        const currentRun = get().currentRun;
        if (currentRun) {
          set({
            currentRun: { ...currentRun, ...updates },
          });
        }
      },
      
      endWorkflowRun: (status) => {
        const currentRun = get().currentRun;
        if (currentRun) {
          set({
            currentRun: {
              ...currentRun,
              status,
              finishedAt: new Date().toISOString(),
              logs: [
                ...currentRun.logs,
                {
                  timestamp: new Date().toISOString(),
                  level: status === "success" ? "success" : "error",
                  message: status === "success" ? "Workflow completed successfully!" : `Workflow ${status}`,
                },
              ],
            },
          });
        }
      },
      
      clearCurrentRun: () => {
        set({ currentRun: null });
      },
      
      // Undo/Redo
      saveHistory: () => {
        set((state) => {
          const snapshot = {
            workflows: state.workflows,
            repos: state.repos,
          };
          return {
            history: {
              past: [...state.history.past, snapshot].slice(-50),
              future: [],
            },
          };
        });
      },
      
      undo: () => {
        set((state) => {
          if (state.history.past.length === 0) return {};
          
          const previous = state.history.past[state.history.past.length - 1];
          const newPast = state.history.past.slice(0, -1);
          const current = {
            workflows: state.workflows,
            repos: state.repos,
          };
          
          return {
            ...previous,
            history: {
              past: newPast,
              future: [current, ...state.history.future],
            },
          };
        });
      },
      
      redo: () => {
        set((state) => {
          if (state.history.future.length === 0) return {};
          
          const next = state.history.future[0];
          const newFuture = state.history.future.slice(1);
          const current = {
            workflows: state.workflows,
            repos: state.repos,
          };
          
          return {
            ...next,
            history: {
              past: [...state.history.past, current],
              future: newFuture,
            },
          };
        });
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
        repos: state.repos,
        workflows: state.workflows,
        localActions: state.localActions,
        settings: state.settings,
      }),
    }
  )
);
