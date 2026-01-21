import { useState } from "react";
import { Github, Loader2, CheckCircle2, AlertCircle, Copy, ExternalLink } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { Titlebar } from "./Titlebar";
import { open } from "@tauri-apps/api/shell";
import { invoke } from "@tauri-apps/api/tauri";

interface GitHubUser {
  id: number;
  login: string;
  name: string;
  avatar_url: string;
  email: string | null;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export function LoginScreen() {
  const { login } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "waiting" | "success">("idle");
  const [userCode, setUserCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // GitHub Device Flow - recommended for desktop apps (no client secret needed)
  const handleOAuthLogin = async () => {
    setIsLoading(true);
    setError(null);
    setStep("waiting");

    try {
      // Start device flow - get user code
      const deviceResponse = await invoke<DeviceCodeResponse>("start_device_flow");
      
      setUserCode(deviceResponse.user_code);
      
      // Open GitHub verification page in browser
      await open(deviceResponse.verification_uri);

      // Poll for authorization completion
      const pollInterval = setInterval(async () => {
        try {
          const result = await invoke<{ access_token: string } | null>("poll_device_flow");
          
          if (result && result.access_token) {
            clearInterval(pollInterval);

            // Get user info
            const response = await fetch("https://api.github.com/user", {
              headers: {
                Authorization: `Bearer ${result.access_token}`,
                Accept: "application/vnd.github.v3+json",
              },
            });

            if (!response.ok) {
              throw new Error("Failed to fetch user info");
            }

            const user: GitHubUser = await response.json();
            
            setStep("success");

            // Login
            setTimeout(() => {
              login(result.access_token, {
                id: user.id,
                login: user.login,
                name: user.name || user.login,
                avatar_url: user.avatar_url,
                email: user.email,
              });
            }, 500);
          }
        } catch (e: unknown) {
          console.error("Poll error:", e);
          const errorMessage = e instanceof Error ? e.message : String(e);
          // Check if it's a terminal error
          if (errorMessage.includes("expired") || errorMessage.includes("denied")) {
            clearInterval(pollInterval);
            setError(errorMessage);
            setIsLoading(false);
            setStep("idle");
            setUserCode(null);
          }
          // Otherwise continue polling
        }
      }, (deviceResponse.interval || 5) * 1000);

      // Timeout after expiration
      setTimeout(() => {
        clearInterval(pollInterval);
        if (step === "waiting") {
          setError("Login timed out. Please try again.");
          setIsLoading(false);
          setStep("idle");
          setUserCode(null);
        }
      }, deviceResponse.expires_in * 1000);

    } catch (e: unknown) {
      console.error("OAuth failed:", e);
      // Extract error message from Tauri invoke error
      let errorMessage = "Failed to start login flow.";
      if (typeof e === "string") {
        errorMessage = e;
      } else if (e instanceof Error) {
        errorMessage = e.message;
      } else if (e && typeof e === "object" && "message" in e) {
        errorMessage = String((e as { message: unknown }).message);
      }
      setError(errorMessage);
      setIsLoading(false);
      setStep("idle");
      setUserCode(null);
    }
  };

  const copyCode = () => {
    if (userCode) {
      navigator.clipboard.writeText(userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openVerificationPage = () => {
    open("https://github.com/login/device");
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <Titlebar />
      
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
              <svg viewBox="0 0 24 24" className="w-10 h-10 text-white" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">BuildForge</h1>
            <p className="text-slate-400">Node-based build orchestration</p>
          </div>

          {/* Login Card */}
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6 shadow-xl">
            {step === "success" ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-white mb-2">Welcome!</h2>
                <p className="text-slate-400">Logging you in...</p>
              </div>
            ) : step === "waiting" ? (
              <div className="text-center py-6">
                <Loader2 className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-spin" />
                <h2 className="text-xl font-semibold text-white mb-2">Enter this code on GitHub</h2>
                
                {userCode && (
                  <div className="my-4">
                    <div 
                      onClick={copyCode}
                      className="inline-flex items-center gap-3 px-6 py-3 bg-slate-900 border-2 border-slate-600 rounded-xl cursor-pointer hover:border-blue-500 transition-colors"
                    >
                      <span className="text-3xl font-mono font-bold text-white tracking-widest">
                        {userCode}
                      </span>
                      <Copy className={`w-5 h-5 ${copied ? 'text-green-500' : 'text-slate-400'}`} />
                    </div>
                    {copied && (
                      <p className="text-green-500 text-sm mt-2">Copied!</p>
                    )}
                  </div>
                )}
                
                <p className="text-slate-400 text-sm mb-4">
                  Go to <button onClick={openVerificationPage} className="text-blue-400 hover:underline inline-flex items-center gap-1">github.com/login/device <ExternalLink className="w-3 h-3" /></button> and enter the code
                </p>
                
                <p className="text-slate-500 text-xs">
                  Waiting for you to authorize...
                </p>
                
                {error && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-red-400 text-sm flex items-center gap-2 justify-center">
                      <AlertCircle className="w-4 h-4" />
                      {error}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-white text-center mb-6">
                  Sign in to continue
                </h2>

                <button
                  onClick={handleOAuthLogin}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Github className="w-5 h-5" />
                  )}
                  Continue with GitHub
                </button>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-red-400 text-sm text-center flex items-center gap-2 justify-center">
                      <AlertCircle className="w-4 h-4" />
                      {error}
                    </p>
                  </div>
                )}

                <p className="text-center text-slate-500 text-xs mt-4">
                  BuildForge will open GitHub in your browser to authenticate
                </p>
              </>
            )}
          </div>

          {/* Footer */}
          <p className="text-center text-slate-500 text-sm mt-6">
            Your credentials are never stored on our servers
          </p>
        </div>
      </div>
    </div>
  );
}
