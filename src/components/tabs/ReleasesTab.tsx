import { useState, useEffect } from "react";
import { Github, Tag, Package, ExternalLink, FolderOpen, ArrowUp, AlertCircle, RefreshCw, Trash2, Loader2 } from "lucide-react";
import { useAppStore, type LocalRepo, type GitHubRelease, type BuildSystem } from "../../store/appStore";
import { open as openUrl } from "@tauri-apps/api/shell";
import { open as openDialog } from "@tauri-apps/api/dialog";
import { invoke } from "@tauri-apps/api/tauri";

// Properly parse semantic version and increment
function parseVersion(versionStr: string): { major: number; minor: number; patch: number } | null {
  // Remove 'v' prefix and any suffix like -beta
  const clean = versionStr.replace(/^v/, "").split("-")[0];
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)$/);
  
  if (match) {
    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
    };
  }
  return null;
}

function getNextVersion(versionStr: string): string {
  const parsed = parseVersion(versionStr);
  if (parsed) {
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  }
  return "1.0.0";
}

// Detect build system from repository files
async function detectBuildSystem(path: string): Promise<BuildSystem | null> {
  try {
    const result = await invoke<string>("detect_build_system", { path });
    return result as BuildSystem;
  } catch {
    // Fallback detection - check common files
    return null;
  }
}

export function ReleasesTab() {
  const { 
    accessToken, 
    user, 
    repos, 
    selectedRepoId,
    addRepo, 
    updateRepo, 
    removeRepo, 
    selectRepo 
  } = useAppStore();
  
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const currentRepo = repos.find(r => r.id === selectedRepoId);

  // Add a local repository
  const addLocalRepo = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Select Project Repository",
      });
      
      if (selected && typeof selected === "string") {
        await detectGitRepo(selected);
      }
    } catch (e) {
      console.error("Failed to open folder:", e);
    }
  };

  // Detect if folder is a git repo and get remote
  const detectGitRepo = async (path: string) => {
    setLoading(true);
    
    try {
      // Try to get git remote URL using Tauri command
      let gitRemote: string | null = null;
      let owner: string | null = null;
      let repoName: string | null = null;
      let defaultBranch = "main";
      
      try {
        const result = await invoke<string>("get_git_remote", { path });
        gitRemote = result;
        
        // Parse GitHub URL
        const match = gitRemote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
        if (match) {
          owner = match[1];
          repoName = match[2];
        }
      } catch {
        // No git remote found
      }

      const name = path.split("/").pop() || "Unknown";
      
      // Detect build system
      const detectedBuildSystem = await detectBuildSystem(path);
      
      const newRepo: Omit<LocalRepo, "id"> = {
        path,
        name,
        gitRemote,
        owner,
        repo: repoName,
        isFork: false,
        releases: [],
        branches: [],
        latestVersion: null,
        nextVersion: null,
        defaultBranch,
        detectedBuildSystem,
      };

      // If we have a GitHub remote, fetch repo info and releases
      if (owner && repoName && accessToken) {
        try {
          // Fetch repo info
          const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/vnd.github.v3+json",
            },
          });
          
          if (repoResponse.ok) {
            const repoData = await repoResponse.json();
            newRepo.isFork = repoData.fork;
            newRepo.defaultBranch = repoData.default_branch || "main";
            
            // If it's a fork, check if user owns the fork
            if (repoData.fork && repoData.owner.login !== user?.login) {
              // Find user's fork
              const forksResponse = await fetch(`https://api.github.com/repos/${owner}/${repoName}/forks`, {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  Accept: "application/vnd.github.v3+json",
                },
              });
              
              if (forksResponse.ok) {
                const forks = await forksResponse.json();
                const userFork = forks.find((f: { owner: { login: string } }) => f.owner.login === user?.login);
                if (userFork) {
                  newRepo.owner = user?.login || owner;
                  newRepo.isFork = true;
                }
              }
            }
          }

          // Fetch releases
          const releases = await fetchReleasesForRepo(owner, repoName);
          newRepo.releases = releases;
          
          // Calculate versions
          const latestVersion = findHighestVersion(releases);
          newRepo.latestVersion = latestVersion;
          newRepo.nextVersion = latestVersion ? getNextVersion(latestVersion) : "1.0.0";
          
        } catch (e) {
          console.error("Failed to fetch repo info:", e);
        }
      }

      // Check if repo already exists
      const existingRepo = repos.find(r => r.path === path);
      if (existingRepo) {
        updateRepo(existingRepo.id, newRepo);
        selectRepo(existingRepo.id);
      } else {
        const id = addRepo(newRepo);
        selectRepo(id);
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch releases for a repo
  const fetchReleasesForRepo = async (owner: string, repo: string): Promise<GitHubRelease[]> => {
    if (!accessToken) return [];

    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/releases?per_page=50`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (response.ok) {
        const releases: GitHubRelease[] = await response.json();
        return releases;
      }
    } catch (e) {
      console.error("Failed to fetch releases:", e);
    }
    
    return [];
  };

  // Find highest version from releases
  const findHighestVersion = (releases: GitHubRelease[]): string | null => {
    if (!releases || releases.length === 0) return null;
    
    // Filter out drafts and pre-releases, parse all versions
    const validVersions = releases
      .filter(r => !r.draft && !r.prerelease)
      .map(r => ({
        tag: r.tag_name,
        parsed: parseVersion(r.tag_name)
      }))
      .filter(v => v.parsed !== null);
    
    if (validVersions.length === 0) return null;
    
    // Sort by semantic version (highest first)
    validVersions.sort((a, b) => {
      if (!a.parsed || !b.parsed) return 0;
      
      if (a.parsed.major !== b.parsed.major) return b.parsed.major - a.parsed.major;
      if (a.parsed.minor !== b.parsed.minor) return b.parsed.minor - a.parsed.minor;
      return b.parsed.patch - a.parsed.patch;
    });
    
    return validVersions[0]?.tag || null;
  };

  // Refresh releases for a repo
  const refreshReleases = async (repoId: string) => {
    const repo = repos.find(r => r.id === repoId);
    if (!repo?.owner || !repo?.repo) return;
    
    setRefreshing(repoId);
    try {
      const releases = await fetchReleasesForRepo(repo.owner, repo.repo);
      const latestVersion = findHighestVersion(releases);
      
      updateRepo(repoId, {
        releases,
        latestVersion,
        nextVersion: latestVersion ? getNextVersion(latestVersion) : "1.0.0",
      });
    } finally {
      setRefreshing(null);
    }
  };

  // Auto-refresh releases when tab is opened
  useEffect(() => {
    if (currentRepo?.owner && currentRepo?.repo && accessToken) {
      refreshReleases(currentRepo.id);
    }
  }, [currentRepo?.id, accessToken]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", { 
      year: "numeric", 
      month: "short", 
      day: "numeric" 
    });
  };

  return (
    <div className="h-full flex">
      {/* Left: Local Repos List */}
      <div className="w-64 border-r border-slate-700 flex flex-col bg-slate-900">
        <div className="p-3 border-b border-slate-700">
          <button
            onClick={addLocalRepo}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm font-medium disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FolderOpen className="w-4 h-4" />
            )}
            {loading ? "Loading..." : "Add Local Repo"}
          </button>
        </div>
        
        <div className="flex-1 overflow-auto">
          {repos.map(repo => (
            <div
              key={repo.id}
              className={`relative group ${
                selectedRepoId === repo.id
                  ? "bg-slate-800"
                  : "hover:bg-slate-800"
              }`}
            >
              <button
                onClick={() => selectRepo(repo.id)}
                className={`w-full text-left px-3 py-3 border-l-2 ${
                  selectedRepoId === repo.id
                    ? "border-green-500 text-white"
                    : "border-transparent text-slate-400 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Github className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{repo.name}</span>
                </div>
                {repo.owner && repo.repo && (
                  <p className="text-xs text-slate-500 mt-0.5 ml-6 truncate">
                    {repo.owner}/{repo.repo}
                    {repo.isFork && " (fork)"}
                  </p>
                )}
                {repo.latestVersion && (
                  <p className="text-xs text-green-500 mt-0.5 ml-6 font-mono">
                    {repo.latestVersion}
                  </p>
                )}
                {repo.detectedBuildSystem && (
                  <p className="text-xs text-slate-600 mt-0.5 ml-6">
                    {repo.detectedBuildSystem}
                  </p>
                )}
              </button>
              
              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeRepo(repo.id);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded text-red-400"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        
        {repos.length === 0 && (
          <div className="p-4 text-center text-slate-500 text-sm">
            <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Add a local repository</p>
            <p className="text-xs mt-1">to see releases and use in workflows</p>
          </div>
        )}
      </div>

      {/* Right: Releases */}
      <div className="flex-1 overflow-auto">
        {currentRepo ? (
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">{currentRepo.name}</h2>
                {currentRepo.owner && currentRepo.repo && (
                  <p className="text-slate-400 text-sm mt-1">
                    {currentRepo.owner}/{currentRepo.repo}
                    {currentRepo.isFork && (
                      <span className="ml-2 px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded">
                        Fork
                      </span>
                    )}
                  </p>
                )}
                <p className="text-slate-500 text-xs mt-1">{currentRepo.path}</p>
                {currentRepo.detectedBuildSystem && (
                  <p className="text-slate-500 text-xs mt-1">
                    Build system: <span className="text-blue-400">{currentRepo.detectedBuildSystem}</span>
                  </p>
                )}
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={() => refreshReleases(currentRepo.id)}
                  disabled={refreshing === currentRepo.id}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded disabled:opacity-50"
                  title="Refresh releases"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing === currentRepo.id ? 'animate-spin' : ''}`} />
                </button>
                
                <div className="text-right">
                  {currentRepo.latestVersion && (
                    <div className="text-sm text-slate-400 mb-1">
                      Latest: <span className="text-white font-mono">{currentRepo.latestVersion}</span>
                    </div>
                  )}
                  {currentRepo.nextVersion && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-green-600/20 border border-green-500/30 rounded-lg">
                      <ArrowUp className="w-4 h-4 text-green-400" />
                      <span className="text-green-400 font-mono font-bold text-lg">
                        {currentRepo.nextVersion}
                      </span>
                      <span className="text-green-400/60 text-xs">next</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {!currentRepo.owner && (
              <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-yellow-400 font-medium">No GitHub remote detected</p>
                  <p className="text-yellow-400/70 text-sm mt-1">
                    This folder doesn't appear to be connected to a GitHub repository.
                  </p>
                </div>
              </div>
            )}

            {/* Version Cards - Latest and Next */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              {/* Latest Release */}
              {currentRepo.releases.length > 0 && currentRepo.releases[0] && (
                <div className="p-6 bg-slate-800 border border-slate-700 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <Tag className="w-5 h-5 text-blue-400" />
                    <h3 className="text-lg font-semibold text-white">Latest Release</h3>
                  </div>
                  <div className="mt-4">
                    <div className="text-3xl font-mono font-bold text-blue-400 mb-2">
                      {currentRepo.releases[0].tag_name}
                    </div>
                    {currentRepo.releases[0].name && currentRepo.releases[0].name !== currentRepo.releases[0].tag_name && (
                      <div className="text-slate-300 mb-2">{currentRepo.releases[0].name}</div>
                    )}
                    <div className="text-sm text-slate-500 mb-3">
                      Published {formatDate(currentRepo.releases[0].published_at)}
                    </div>
                    {currentRepo.releases[0].assets.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-slate-400 mb-3">
                        <Package className="w-4 h-4" />
                        {currentRepo.releases[0].assets.length} asset{currentRepo.releases[0].assets.length !== 1 ? 's' : ''}
                      </div>
                    )}
                    <button
                      onClick={() => openUrl(currentRepo.releases[0].html_url)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm font-medium"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View on GitHub
                    </button>
                  </div>
                </div>
              )}
              
              {/* Next Version */}
              {currentRepo.nextVersion && (
                <div className="p-6 bg-gradient-to-br from-green-900/20 to-green-800/10 border border-green-500/30 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowUp className="w-5 h-5 text-green-400" />
                    <h3 className="text-lg font-semibold text-white">Next Version</h3>
                  </div>
                  <div className="mt-4">
                    <div className="text-5xl font-mono font-bold text-green-400 mb-4">
                      {currentRepo.nextVersion}
                    </div>
                    <p className="text-sm text-slate-400 mb-4">
                      This will be the version number for your next release when you run a release workflow.
                    </p>
                    <div className="px-3 py-2 bg-green-500/10 border border-green-500/20 rounded text-xs text-green-400">
                      Auto-incremented from {currentRepo.latestVersion || "1.0.0"}
                    </div>
                  </div>
                </div>
              )}
              
              {/* No releases yet */}
              {currentRepo.releases.length === 0 && currentRepo.owner && (
                <div className="col-span-2 text-center py-16 text-slate-500 bg-slate-800/30 border border-slate-700 rounded-xl">
                  <Tag className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-lg">No releases yet</p>
                  <p className="text-sm mt-2">Create your first release using a workflow</p>
                  {currentRepo.nextVersion && (
                    <p className="text-green-400 font-mono text-lg mt-4">First version: {currentRepo.nextVersion}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500">
            <div className="text-center">
              <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>Add a local repository to get started</p>
              <p className="text-sm mt-1">Repos added here can be used in workflows</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
