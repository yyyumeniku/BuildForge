import { Github, Hammer, Server, Zap } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../store/appStore";

const GITHUB_CLIENT_ID = "YOUR_GITHUB_CLIENT_ID"; // Replace with actual client ID

export function LoginScreen() {
  const [isLoading, setIsLoading] = useState(false);
  const [token, setToken] = useState("");
  const [showTokenInput, setShowTokenInput] = useState(false);
  const { login } = useAppStore();

  const handleGitHubLogin = async () => {
    setIsLoading(true);
    // In a real app, this would redirect to GitHub OAuth
    // For now, we'll use a personal access token flow
    setShowTokenInput(true);
    setIsLoading(false);
  };

  const handleTokenLogin = async () => {
    if (!token.trim()) return;
    
    setIsLoading(true);
    try {
      // Validate token by fetching user info
      const response = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!response.ok) {
        throw new Error("Invalid token");
      }

      const user = await response.json();
      login(token, {
        id: user.id,
        login: user.login,
        name: user.name || user.login,
        avatar_url: user.avatar_url,
        email: user.email,
      });
    } catch (error) {
      console.error("Login failed:", error);
      alert("Login failed. Please check your token.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-md p-8">
        {/* Logo and Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 mb-6 shadow-lg shadow-green-500/25">
            <Hammer className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">BuildForge</h1>
          <p className="text-slate-400">Node-based build orchestration</p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          <div className="text-center p-4 rounded-lg bg-slate-800/50 border border-slate-700">
            <Zap className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
            <span className="text-xs text-slate-400">Node Workflows</span>
          </div>
          <div className="text-center p-4 rounded-lg bg-slate-800/50 border border-slate-700">
            <Server className="w-6 h-6 text-blue-400 mx-auto mb-2" />
            <span className="text-xs text-slate-400">Multi-Server</span>
          </div>
          <div className="text-center p-4 rounded-lg bg-slate-800/50 border border-slate-700">
            <Github className="w-6 h-6 text-purple-400 mx-auto mb-2" />
            <span className="text-xs text-slate-400">GitHub Releases</span>
          </div>
        </div>

        {/* Login Form */}
        <div className="space-y-4">
          {!showTokenInput ? (
            <button
              onClick={handleGitHubLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl text-white font-medium transition-all duration-200 disabled:opacity-50"
            >
              <Github className="w-5 h-5" />
              {isLoading ? "Connecting..." : "Login with GitHub"}
            </button>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">
                  GitHub Personal Access Token
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Create a token at GitHub → Settings → Developer Settings → Personal Access Tokens
                </p>
              </div>
              <button
                onClick={handleTokenLogin}
                disabled={isLoading || !token.trim()}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-green-600 hover:bg-green-500 rounded-xl text-white font-medium transition-all duration-200 disabled:opacity-50"
              >
                {isLoading ? "Authenticating..." : "Login"}
              </button>
              <button
                onClick={() => setShowTokenInput(false)}
                className="w-full px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Back
              </button>
            </div>
          )}
        </div>

        {/* Version */}
        <p className="text-center text-slate-600 text-xs mt-10">
          BuildForge v1.0.0
        </p>
      </div>
    </div>
  );
}
