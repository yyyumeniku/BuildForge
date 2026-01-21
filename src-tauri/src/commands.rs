use crate::server::{ServerConnection, ServerStatus};
use crate::AppState;
use notify_rust::Notification;
use serde::{Deserialize, Serialize};
use tauri::State;
use once_cell::sync::Lazy;

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectServerRequest {
    pub name: String,
    pub address: String,
    pub port: u16,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StartBuildRequest {
    pub server_id: String,
    pub project_name: String,
    pub version: String,
    pub nodes: Vec<serde_json::Value>,
    pub edges: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitHubUser {
    pub login: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub avatar_url: String,
}

#[tauri::command]
pub async fn connect_server(
    request: ConnectServerRequest,
    state: State<'_, AppState>,
) -> Result<ServerConnection, String> {
    let mut server = ServerConnection::new(request.name, request.address, request.port);
    
    server.connect().await?;
    
    let mut servers = state.servers.lock().await;
    servers.push(server.clone());
    
    Ok(server)
}

#[tauri::command]
pub async fn disconnect_server(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut servers = state.servers.lock().await;
    
    if let Some(server) = servers.iter_mut().find(|s| s.id == server_id) {
        server.disconnect();
    }
    
    Ok(())
}

#[tauri::command]
pub async fn start_build(
    request: StartBuildRequest,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let servers = state.servers.lock().await;
    
    let server = servers
        .iter()
        .find(|s| s.id == request.server_id)
        .ok_or("Server not found")?;
    
    if server.status != ServerStatus::Online {
        return Err("Server is not online".to_string());
    }
    
    // Generate build ID
    let build_id = uuid::Uuid::new_v4().to_string();
    
    // In a real implementation, this would send the build request over WebSocket
    // For now, we just return the build ID
    
    Ok(build_id)
}

#[tauri::command]
pub async fn cancel_build(
    _build_id: String,
    server_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let servers = state.servers.lock().await;
    
    let _server = servers
        .iter()
        .find(|s| s.id == server_id)
        .ok_or("Server not found")?;
    
    // In a real implementation, this would send a cancel request over WebSocket
    
    Ok(())
}

#[tauri::command]
pub async fn get_server_status(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let servers = state.servers.lock().await;
    
    let server = servers
        .iter()
        .find(|s| s.id == server_id)
        .ok_or("Server not found")?;
    
    Ok(serde_json::to_string(&server.status).unwrap())
}

#[tauri::command]
pub async fn send_notification(
    title: String,
    body: String,
    success: bool,
) -> Result<(), String> {
    let prefix = if success { "[SUCCESS]" } else { "[ERROR]" };
    
    Notification::new()
        .summary(&format!("{} {}", prefix, title))
        .body(&body)
        .appname("BuildForge")
        .show()
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn validate_github_token(token: String) -> Result<GitHubUser, String> {
    let client = reqwest::Client::new();
    
    let response = client
        .get("https://api.github.com/user")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "BuildForge/1.0.0")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    if response.status().is_success() {
        let user: GitHubUser = response.json().await.map_err(|e| e.to_string())?;
        Ok(user)
    } else {
        Err("Invalid token".to_string())
    }
}

#[tauri::command]
pub async fn get_git_remote(path: String) -> Result<String, String> {
    use std::process::Command;
    
    let output = Command::new("git")
        .args(["-C", &path, "remote", "get-url", "origin"])
        .output()
        .map_err(|e| e.to_string())?;
    
    if output.status.success() {
        let remote = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(remote)
    } else {
        Err("No git remote found".to_string())
    }
}

#[tauri::command]
pub async fn detect_build_system(path: String) -> Result<String, String> {
    use std::path::Path;
    
    let path = Path::new(&path);
    
    // Check for Wails (Go + frontend framework)
    if path.join("wails.json").exists() || (path.join("go.mod").exists() && path.join("frontend").is_dir()) {
        return Ok("wails".to_string());
    }
    
    // Check for Tauri (Rust + frontend)
    if path.join("src-tauri").is_dir() && path.join("src-tauri/Cargo.toml").exists() {
        return Ok("tauri".to_string());
    }
    
    // Check for Electron (Node.js based)
    if path.join("package.json").exists() {
        if let Ok(content) = std::fs::read_to_string(path.join("package.json")) {
            if content.contains("\"electron\"") {
                return Ok("electron".to_string());
            }
        }
    }
    
    // Cargo (Rust)
    if path.join("Cargo.toml").exists() {
        return Ok("cargo".to_string());
    }
    
    // Go
    if path.join("go.mod").exists() {
        return Ok("go".to_string());
    }
    
    // Node.js package managers (check in order of specificity)
    if path.join("pnpm-lock.yaml").exists() {
        return Ok("pnpm".to_string());
    }
    if path.join("yarn.lock").exists() {
        return Ok("yarn".to_string());
    }
    if path.join("package-lock.json").exists() {
        return Ok("npm".to_string());
    }
    if path.join("package.json").exists() {
        // Check package.json for package manager hint
        if let Ok(content) = std::fs::read_to_string(path.join("package.json")) {
            if content.contains("\"packageManager\"") {
                if content.contains("pnpm") {
                    return Ok("pnpm".to_string());
                } else if content.contains("yarn") {
                    return Ok("yarn".to_string());
                }
            }
        }
        return Ok("npm".to_string());
    }
    
    // Java
    if path.join("build.gradle").exists() || path.join("build.gradle.kts").exists() {
        return Ok("gradle".to_string());
    }
    if path.join("pom.xml").exists() {
        return Ok("maven".to_string());
    }
    
    // C/C++
    if path.join("CMakeLists.txt").exists() {
        return Ok("cmake".to_string());
    }
    if path.join("Makefile").exists() || path.join("makefile").exists() {
        return Ok("make".to_string());
    }
    
    // Python
    if path.join("pyproject.toml").exists() {
        return Ok("python".to_string());
    }
    if path.join("setup.py").exists() {
        return Ok("python".to_string());
    }
    if path.join("requirements.txt").exists() {
        return Ok("python".to_string());
    }
    
    // .NET
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str.ends_with(".csproj") || name_str.ends_with(".fsproj") || name_str.ends_with(".sln") {
                return Ok("dotnet".to_string());
            }
        }
    }
    
    Ok("unknown".to_string())
}

#[tauri::command]
pub async fn get_branches(path: String) -> Result<Vec<String>, String> {
    use std::process::Command;
    
    let output = Command::new("git")
        .args(["-C", &path, "branch", "-a", "--format=%(refname:short)"])
        .output()
        .map_err(|e| e.to_string())?;
    
    if output.status.success() {
        let branches: Vec<String> = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        Ok(branches)
    } else {
        Err("Failed to get branches".to_string())
    }
}

#[tauri::command]
pub async fn start_local_server() -> Result<String, String> {
    use std::process::Command;
    
    // Start the server binary in the background
    // This assumes the server binary is in ../server/target/debug/buildforge-server
    // or has been installed system-wide
    
    #[cfg(target_os = "macos")]
    let server_path = "../server/target/debug/buildforge-server";
    #[cfg(target_os = "windows")]
    let server_path = "..\\server\\target\\debug\\buildforge-server.exe";
    #[cfg(target_os = "linux")]
    let server_path = "../server/target/debug/buildforge-server";
    
    Command::new(server_path)
        .spawn()
        .map_err(|e| format!("Failed to start server: {}. Make sure the server is built with 'cargo build' in the server directory.", e))?;
    
    Ok("Server started on port 9876".to_string())
}

#[tauri::command]
pub async fn stop_local_server() -> Result<String, String> {
    use std::process::Command;
    
    // Kill the server process
    #[cfg(target_os = "macos")]
    {
        Command::new("pkill")
            .args(["-f", "buildforge-server"])
            .output()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("taskkill")
            .args(["/F", "/IM", "buildforge-server.exe"])
            .output()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("pkill")
            .args(["-f", "buildforge-server"])
            .output()
            .map_err(|e| e.to_string())?;
    }
    
    Ok("Server stopped".to_string())
}

// OAuth callback server state
use std::sync::{Arc, Mutex as StdMutex};

static OAUTH_RESULT: Lazy<Arc<StdMutex<Option<(String, String)>>>> = Lazy::new(|| Arc::new(StdMutex::new(None)));
static OAUTH_SERVER_RUNNING: Lazy<Arc<StdMutex<bool>>> = Lazy::new(|| Arc::new(StdMutex::new(false)));

#[tauri::command]
pub async fn start_oauth_server() -> Result<String, String> {
    use tokio::net::TcpListener;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    
    // Clear previous result
    *OAUTH_RESULT.lock().unwrap() = None;
    *OAUTH_SERVER_RUNNING.lock().unwrap() = true;
    
    tokio::spawn(async move {
        let listener = TcpListener::bind("127.0.0.1:9888").await.unwrap();
        
        while *OAUTH_SERVER_RUNNING.lock().unwrap() {
            if let Ok(Ok((mut socket, _))) = tokio::time::timeout(
                tokio::time::Duration::from_secs(1),
                listener.accept()
            ).await {
                let mut buffer = [0u8; 1024];
                let n = socket.read(&mut buffer).await.unwrap_or(0);
                let request = String::from_utf8_lossy(&buffer[..n]);
                
                // Parse callback URL
                if request.contains("GET /callback") {
                    if let Some(query_start) = request.find("?") {
                        if let Some(http_end) = request[query_start..].find(" HTTP") {
                            let query = &request[query_start+1..query_start+http_end];
                            let mut code = String::new();
                            let mut state = String::new();
                            
                            for param in query.split('&') {
                                let parts: Vec<&str> = param.split('=').collect();
                                if parts.len() == 2 {
                                    match parts[0] {
                                        "code" => code = parts[1].to_string(),
                                        "state" => state = parts[1].to_string(),
                                        _ => {}
                                    }
                                }
                            }
                            
                            if !code.is_empty() && !state.is_empty() {
                                *OAUTH_RESULT.lock().unwrap() = Some((code, state));
                            }
                        }
                    }
                    
                    // Send success response
                    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body><h1>✓ Login successful!</h1><p>You can close this window and return to BuildForge.</p><script>window.close();</script></body></html>";
                    let _ = socket.write_all(response.as_bytes()).await;
                    
                    // Stop server after successful callback
                    *OAUTH_SERVER_RUNNING.lock().unwrap() = false;
                }
            }
        }
    });
    
    Ok("OAuth server started on port 9888".to_string())
}

#[tauri::command]
pub async fn stop_oauth_server() -> Result<String, String> {
    *OAUTH_SERVER_RUNNING.lock().unwrap() = false;
    *OAUTH_RESULT.lock().unwrap() = None;
    Ok("OAuth server stopped".to_string())
}

#[tauri::command]
pub async fn check_oauth_result() -> Result<Option<serde_json::Value>, String> {
    let result = OAUTH_RESULT.lock().unwrap().clone();
    
    if let Some((code, state)) = result {
        Ok(Some(serde_json::json!({
            "code": code,
            "state": state
        })))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn exchange_oauth_code(code: String) -> Result<serde_json::Value, String> {
    // Note: In production, this should be done through a backend server to keep the client secret secure
    // For development, we'll use GitHub's device flow or direct token exchange
    // This is a simplified version - you need to add your GitHub OAuth App's client secret
    
    let client_id = "Ov23li4L1cL2GgCWNENc";
    let client_secret = "YOUR_CLIENT_SECRET_HERE"; // Add your OAuth App client secret
    
    let client = reqwest::Client::new();
    let response = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    
    if data.get("access_token").is_some() {
        Ok(data)
    } else {
        Err(format!("Failed to exchange code: {:?}", data))
    }
}

#[tauri::command]
pub async fn run_command(command: String, args: Vec<String>, cwd: String) -> Result<String, String> {
    use std::process::Command;
    
    let output = Command::new(&command)
        .args(&args)
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    
    if output.status.success() {
        Ok(format!("{}{}", stdout, stderr))
    } else {
        // Include both stdout and stderr in error, and the exit code
        let exit_code = output.status.code().map(|c| c.to_string()).unwrap_or_else(|| "unknown".to_string());
        let combined = format!("{}\n{}", stdout, stderr).trim().to_string();
        let error_msg = if combined.is_empty() {
            format!("Command '{}' failed with exit code {}", command, exit_code)
        } else {
            format!("{}\n(exit code {})", combined, exit_code)
        };
        Err(error_msg)
    }
}

#[tauri::command]
pub async fn install_package(package_name: String) -> Result<String, String> {
    use std::process::Command;
    
    // Detect OS and use appropriate package manager
    #[cfg(target_os = "macos")]
    let (pkg_manager, args) = ("brew", vec!["install", &package_name]);
    
    #[cfg(target_os = "linux")]
    let (pkg_manager, args) = {
        // Try to detect Linux package manager
        if Command::new("which").arg("apt").output().is_ok() {
            ("sudo", vec!["apt", "install", "-y", &package_name])
        } else if Command::new("which").arg("dnf").output().is_ok() {
            ("sudo", vec!["dnf", "install", "-y", &package_name])
        } else if Command::new("which").arg("pacman").output().is_ok() {
            ("sudo", vec!["pacman", "-S", "--noconfirm", &package_name])
        } else if Command::new("which").arg("zypper").output().is_ok() {
            ("sudo", vec!["zypper", "install", "-y", &package_name])
        } else {
            return Err("Could not detect package manager (apt, dnf, pacman, or zypper)".to_string());
        }
    };
    
    #[cfg(target_os = "windows")]
    let (pkg_manager, args) = {
        // Try winget first, fall back to choco
        if Command::new("winget").arg("--version").output().is_ok() {
            ("winget", vec!["install", &package_name])
        } else if Command::new("choco").arg("--version").output().is_ok() {
            ("choco", vec!["install", "-y", &package_name])
        } else {
            return Err("Could not find winget or chocolatey. Please install one.".to_string());
        }
    };
    
    let output = Command::new(pkg_manager)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run package manager: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    
    if output.status.success() {
        Ok(format!("Package installed successfully\n{}{}", stdout, stderr))
    } else {
        Err(format!("Package installation failed\n{}{}", stdout, stderr))
    }
}

// GitHub Device Flow OAuth (recommended for desktop apps - no client secret needed)
#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u32,
    pub interval: u32,
}

static DEVICE_CODE: Lazy<Arc<StdMutex<Option<String>>>> = Lazy::new(|| Arc::new(StdMutex::new(None)));

#[tauri::command]
pub async fn start_device_flow() -> Result<DeviceCodeResponse, String> {
    let client_id = "Ov23li4L1cL2GgCWNENc";
    
    let client = reqwest::Client::new();
    let response = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .header("User-Agent", "BuildForge/1.0.0")
        .form(&[("client_id", client_id), ("scope", "repo user workflow")])
        .send()
        .await
        .map_err(|e| format!("Network error: {}. Check your internet connection.", e))?;
    
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    
    if !status.is_success() {
        // Parse error for more details
        if text.contains("device_flow_disabled") {
            return Err("Device Flow is not enabled for this OAuth App. Go to GitHub Developer Settings > OAuth Apps > Your App > Enable 'Device Flow' checkbox.".to_string());
        }
        if text.contains("Not Found") || status.as_u16() == 404 {
            return Err("OAuth App not found. Please check the Client ID is correct.".to_string());
        }
        return Err(format!("GitHub API error ({}): {}", status, text));
    }
    
    let data: DeviceCodeResponse = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse response: {}. Response was: {}", e, text))?;
    
    // Store device code for polling
    *DEVICE_CODE.lock().unwrap() = Some(data.device_code.clone());
    
    Ok(data)
}

#[tauri::command]
pub async fn poll_device_flow() -> Result<Option<serde_json::Value>, String> {
    let device_code = DEVICE_CODE.lock().unwrap().clone();
    
    let device_code = match device_code {
        Some(code) => code,
        None => return Err("No device code available. Start device flow first.".to_string()),
    };
    
    let client_id = "Ov23li4L1cL2GgCWNENc";
    
    let client = reqwest::Client::new();
    let response = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .header("User-Agent", "BuildForge/1.0.0")
        .form(&[
            ("client_id", client_id),
            ("device_code", device_code.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to poll for token: {}", e))?;
    
    let text = response.text().await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    let data: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse response: {}. Raw: {}", e, text))?;
    
    // Check for errors
    if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
        match error {
            "authorization_pending" => Ok(None), // User hasn't authorized yet
            "slow_down" => Ok(None), // Need to wait longer
            "expired_token" => {
                *DEVICE_CODE.lock().unwrap() = None;
                Err("Device code expired. Please try again.".to_string())
            }
            "access_denied" => {
                *DEVICE_CODE.lock().unwrap() = None;
                Err("Access denied by user.".to_string())
            }
            _ => Err(format!("OAuth error: {}", error))
        }
    } else if data.get("access_token").is_some() {
        // Success! Clear device code and return token
        *DEVICE_CODE.lock().unwrap() = None;
        Ok(Some(data))
    } else {
        // Unknown response
        Ok(None)
    }
}

#[tauri::command]
pub async fn list_files(dir: String, pattern: Option<String>) -> Result<Vec<String>, String> {
    use std::fs;
    
    let path = std::path::Path::new(&dir);
    if !path.exists() {
        return Ok(vec![]);
    }
    
    let mut files = Vec::new();
    
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    
                    // Filter by pattern if provided
                    if let Some(ref pat) = pattern {
                        if name.contains(pat) || name.ends_with(pat) {
                            files.push(entry.path().to_string_lossy().to_string());
                        }
                    } else {
                        files.push(entry.path().to_string_lossy().to_string());
                    }
                }
            }
        }
    }
    
    Ok(files)
}

#[tauri::command]
pub async fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    use std::fs;
    
    fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))
}

// =====================================================
// Storage Commands - Save/Load app data to disk
// =====================================================

#[tauri::command]
pub async fn get_app_data_dir(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("Could not determine app data directory")?;
    
    // Create directory if it doesn't exist
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    
    Ok(app_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn save_app_data(
    app_handle: tauri::AppHandle,
    filename: String,
    data: String,
    custom_path: Option<String>,
) -> Result<(), String> {
    use std::fs;
    
    let base_dir = if let Some(custom) = custom_path {
        std::path::PathBuf::from(custom)
    } else {
        app_handle
            .path_resolver()
            .app_data_dir()
            .ok_or("Could not determine app data directory")?
    };
    
    // Ensure directory exists
    fs::create_dir_all(&base_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;
    
    let file_path = base_dir.join(&filename);
    fs::write(&file_path, &data)
        .map_err(|e| format!("Failed to save {}: {}", filename, e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn load_app_data(
    app_handle: tauri::AppHandle,
    filename: String,
    custom_path: Option<String>,
) -> Result<Option<String>, String> {
    use std::fs;
    
    let base_dir = if let Some(custom) = custom_path {
        std::path::PathBuf::from(custom)
    } else {
        app_handle
            .path_resolver()
            .app_data_dir()
            .ok_or("Could not determine app data directory")?
    };
    
    let file_path = base_dir.join(&filename);
    
    if !file_path.exists() {
        return Ok(None);
    }
    
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read {}: {}", filename, e))?;
    
    Ok(Some(content))
}

#[tauri::command]
pub async fn delete_app_data(
    app_handle: tauri::AppHandle,
    filename: String,
    custom_path: Option<String>,
) -> Result<(), String> {
    use std::fs;
    
    let base_dir = if let Some(custom) = custom_path {
        std::path::PathBuf::from(custom)
    } else {
        app_handle
            .path_resolver()
            .app_data_dir()
            .ok_or("Could not determine app data directory")?
    };
    
    let file_path = base_dir.join(&filename);
    
    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete {}: {}", filename, e))?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn list_app_data_files(
    app_handle: tauri::AppHandle,
    subdirectory: Option<String>,
    custom_path: Option<String>,
) -> Result<Vec<String>, String> {
    use std::fs;
    
    let base_dir = if let Some(custom) = custom_path {
        std::path::PathBuf::from(custom)
    } else {
        app_handle
            .path_resolver()
            .app_data_dir()
            .ok_or("Could not determine app data directory")?
    };
    
    let target_dir = if let Some(sub) = subdirectory {
        base_dir.join(sub)
    } else {
        base_dir
    };
    
    if !target_dir.exists() {
        return Ok(vec![]);
    }
    
    let mut files = Vec::new();
    
    if let Ok(entries) = fs::read_dir(&target_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            files.push(name);
        }
    }
    
    Ok(files)
}

#[tauri::command]
pub async fn ensure_directory(
    app_handle: tauri::AppHandle,
    subdirectory: String,
    custom_path: Option<String>,
) -> Result<String, String> {
    use std::fs;
    
    let base_dir = if let Some(custom) = custom_path {
        std::path::PathBuf::from(custom)
    } else {
        app_handle
            .path_resolver()
            .app_data_dir()
            .ok_or("Could not determine app data directory")?
    };
    
    let target_dir = base_dir.join(&subdirectory);
    
    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create directory {}: {}", subdirectory, e))?;
    
    Ok(target_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn select_folder(window: tauri::Window) -> Result<Option<String>, String> {
    use tauri::api::dialog::blocking::FileDialogBuilder;
    
    let folder = FileDialogBuilder::new()
        .set_title("Select Storage Location")
        .set_parent(&window)
        .pick_folder();
    
    Ok(folder.map(|p| p.to_string_lossy().to_string()))
}

// System Information Commands (fastfetch-style)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemInfo {
    pub hostname: String,
    pub os: String,
    pub os_version: String,
    pub arch: String,
    pub cpu: String,
    pub cpu_cores: u32,
    pub cpu_usage_percent: f64,
    pub memory_total_gb: f64,
    pub memory_used_gb: f64,
    pub disk_total_gb: f64,
    pub disk_used_gb: f64,
    pub uptime_hours: f64,
    pub package_manager: String,
    pub shell: String,
    pub username: String,
    pub gpu: String,
    pub kernel: String,
}

#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    // Get hostname
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());
    
    // Get username
    let username = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "unknown".to_string());
    
    // Get OS info
    let (os, os_version) = get_os_info();
    
    // Get architecture
    let arch = std::env::consts::ARCH.to_string();
    
    // Get CPU info
    let (cpu, cpu_cores) = get_cpu_info();
    
    // Get CPU usage
    let cpu_usage_percent = get_cpu_usage();
    
    // Get memory info (now returns total, used)
    let (memory_total_gb, memory_used_gb) = get_memory_info();
    
    // Get disk info (now returns total, used)
    let (disk_total_gb, disk_used_gb) = get_disk_info();
    
    // Get uptime
    let uptime_hours = get_uptime_hours();
    
    // Get package manager
    let package_manager = detect_package_manager();
    
    // Get shell
    let shell = std::env::var("SHELL")
        .or_else(|_| std::env::var("COMSPEC"))
        .map(|s| s.split('/').last().unwrap_or(&s).to_string())
        .unwrap_or_else(|_| "unknown".to_string());
    
    // Get GPU info
    let gpu = get_gpu_info();
    
    // Get kernel version
    let kernel = get_kernel_version();
    
    Ok(SystemInfo {
        hostname,
        os,
        os_version,
        arch,
        cpu,
        cpu_cores,
        cpu_usage_percent,
        memory_total_gb,
        memory_used_gb,
        disk_total_gb,
        disk_used_gb,
        uptime_hours,
        package_manager,
        shell,
        username,
        gpu,
        kernel,
    })
}

fn get_os_info() -> (String, String) {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let version = Command::new("sw_vers")
            .arg("-productVersion")
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_else(|_| "unknown".to_string());
        ("macOS".to_string(), version)
    }
    
    #[cfg(target_os = "linux")]
    {
        use std::fs;
        let os_release = fs::read_to_string("/etc/os-release").unwrap_or_default();
        let mut name = "Linux".to_string();
        let mut version = "unknown".to_string();
        
        for line in os_release.lines() {
            if line.starts_with("NAME=") {
                name = line.trim_start_matches("NAME=").trim_matches('"').to_string();
            } else if line.starts_with("VERSION_ID=") {
                version = line.trim_start_matches("VERSION_ID=").trim_matches('"').to_string();
            }
        }
        (name, version)
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let output = Command::new("cmd")
            .args(["/C", "ver"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_else(|_| "Windows".to_string());
        
        // Parse version from output like "Microsoft Windows [Version 10.0.22631.4317]"
        let version = output
            .split('[')
            .nth(1)
            .and_then(|s| s.strip_suffix(']'))
            .map(|s| s.replace("Version ", ""))
            .unwrap_or_else(|| "unknown".to_string());
        
        ("Windows".to_string(), version)
    }
}

fn get_cpu_info() -> (String, u32) {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let cpu = Command::new("sysctl")
            .args(["-n", "machdep.cpu.brand_string"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_else(|_| "unknown".to_string());
        
        let cores = Command::new("sysctl")
            .args(["-n", "hw.ncpu"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().parse::<u32>().unwrap_or(0))
            .unwrap_or(0);
        
        (cpu, cores)
    }
    
    #[cfg(target_os = "linux")]
    {
        use std::fs;
        let cpuinfo = fs::read_to_string("/proc/cpuinfo").unwrap_or_default();
        let mut cpu = "unknown".to_string();
        let mut cores: u32 = 0;
        
        for line in cpuinfo.lines() {
            if line.starts_with("model name") {
                cpu = line.split(':').nth(1).map(|s| s.trim().to_string()).unwrap_or_else(|| "unknown".to_string());
            }
            if line.starts_with("processor") {
                cores += 1;
            }
        }
        (cpu, cores)
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let cpu = Command::new("wmic")
            .args(["cpu", "get", "name"])
            .output()
            .map(|o| {
                let output = String::from_utf8_lossy(&o.stdout);
                output.lines().nth(1).unwrap_or("unknown").trim().to_string()
            })
            .unwrap_or_else(|_| "unknown".to_string());
        
        let cores = Command::new("wmic")
            .args(["cpu", "get", "NumberOfLogicalProcessors"])
            .output()
            .map(|o| {
                let output = String::from_utf8_lossy(&o.stdout);
                output.lines().nth(1).unwrap_or("0").trim().parse::<u32>().unwrap_or(0)
            })
            .unwrap_or(0);
        
        (cpu, cores)
    }
}

fn get_memory_info() -> (f64, f64) {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // Get total physical memory
        let total = Command::new("sysctl")
            .args(["-n", "hw.memsize"])
            .output()
            .map(|o| {
                let bytes: u64 = String::from_utf8_lossy(&o.stdout).trim().parse().unwrap_or(0);
                bytes as f64 / 1024.0 / 1024.0 / 1024.0
            })
            .unwrap_or(0.0);
        
        // Use memory_pressure to get accurate used memory (like fastfetch does)
        let memory_pressure = Command::new("memory_pressure")
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default();
        
        // Try to parse "System-wide memory free percentage: X%"
        let mut used = 0.0;
        for line in memory_pressure.lines() {
            if line.contains("System-wide memory free percentage:") {
                if let Some(pct_str) = line.split(':').nth(1) {
                    let pct_str = pct_str.trim().trim_end_matches('%');
                    if let Ok(free_pct) = pct_str.parse::<f64>() {
                        used = total * (1.0 - free_pct / 100.0);
                        return (total, used);
                    }
                }
            }
        }
        
        // Fallback: use vm_stat to calculate used memory
        let vm_stat = Command::new("vm_stat")
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default();
        
        let page_size: u64 = 16384; // Modern macOS uses 16KB pages on Apple Silicon
        let mut wired: u64 = 0;
        let mut active: u64 = 0;
        let mut compressed: u64 = 0;
        
        for line in vm_stat.lines() {
            let parts: Vec<&str> = line.split(':').collect();
            if parts.len() == 2 {
                let value: u64 = parts[1].trim().trim_end_matches('.').parse().unwrap_or(0);
                if line.contains("Pages wired down") {
                    wired = value;
                } else if line.contains("Pages active") {
                    active = value;
                } else if line.contains("Pages occupied by compressor") {
                    compressed = value;
                }
            }
        }
        
        // Used = wired + active + compressed (this matches Activity Monitor)
        used = ((wired + active + compressed) * page_size) as f64 / 1024.0 / 1024.0 / 1024.0;
        (total, used)
    }
    
    #[cfg(target_os = "linux")]
    {
        use std::fs;
        let meminfo = fs::read_to_string("/proc/meminfo").unwrap_or_default();
        let mut total: u64 = 0;
        let mut available: u64 = 0;
        
        for line in meminfo.lines() {
            if line.starts_with("MemTotal:") {
                total = line.split_whitespace().nth(1)
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
            } else if line.starts_with("MemAvailable:") {
                available = line.split_whitespace().nth(1)
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
            }
        }
        
        let total_gb = total as f64 / 1024.0 / 1024.0;
        let used_gb = (total - available) as f64 / 1024.0 / 1024.0;
        (total_gb, used_gb)
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let output = Command::new("wmic")
            .args(["OS", "get", "TotalVisibleMemorySize,FreePhysicalMemory", "/VALUE"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default();
        
        let mut total: u64 = 0;
        let mut free: u64 = 0;
        
        for line in output.lines() {
            if line.starts_with("TotalVisibleMemorySize=") {
                total = line.split('=').nth(1)
                    .and_then(|s| s.trim().parse().ok())
                    .unwrap_or(0);
            } else if line.starts_with("FreePhysicalMemory=") {
                free = line.split('=').nth(1)
                    .and_then(|s| s.trim().parse().ok())
                    .unwrap_or(0);
            }
        }
        
        let total_gb = total as f64 / 1024.0 / 1024.0;
        let used_gb = (total - free) as f64 / 1024.0 / 1024.0;
        (total_gb, used_gb)
    }
}

fn get_disk_info() -> (f64, f64) {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        use std::process::Command;
        let output = Command::new("df")
            .args(["-k", "/"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default();
        
        if let Some(line) = output.lines().nth(1) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                let total: u64 = parts[1].parse().unwrap_or(0);
                let used: u64 = parts[2].parse().unwrap_or(0);
                return (total as f64 / 1024.0 / 1024.0, used as f64 / 1024.0 / 1024.0);
            }
        }
        (0.0, 0.0)
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let output = Command::new("wmic")
            .args(["logicaldisk", "where", "DeviceID='C:'", "get", "Size,FreeSpace", "/VALUE"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default();
        
        let mut total: u64 = 0;
        let mut free: u64 = 0;
        
        for line in output.lines() {
            if line.starts_with("Size=") {
                total = line.split('=').nth(1)
                    .and_then(|s| s.trim().parse().ok())
                    .unwrap_or(0);
            } else if line.starts_with("FreeSpace=") {
                free = line.split('=').nth(1)
                    .and_then(|s| s.trim().parse().ok())
                    .unwrap_or(0);
            }
        }
        
        let total_gb = total as f64 / 1024.0 / 1024.0 / 1024.0;
        let used_gb = (total - free) as f64 / 1024.0 / 1024.0 / 1024.0;
        (total_gb, used_gb)
    }
}

fn get_cpu_usage() -> f64 {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // Use top in one-shot mode to get CPU usage
        let output = Command::new("top")
            .args(["-l", "1", "-n", "0", "-stats", "cpu"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default();
        
        // Look for "CPU usage: X% user, Y% sys, Z% idle"
        for line in output.lines() {
            if line.contains("CPU usage:") {
                // Parse user and sys percentages
                let parts: Vec<&str> = line.split(',').collect();
                let mut user = 0.0;
                let mut sys = 0.0;
                
                for part in parts {
                    if part.contains("user") {
                        if let Some(pct) = part.split('%').next() {
                            user = pct.trim().split_whitespace().last()
                                .and_then(|s| s.parse().ok())
                                .unwrap_or(0.0);
                        }
                    } else if part.contains("sys") {
                        if let Some(pct) = part.split('%').next() {
                            sys = pct.trim().split_whitespace().last()
                                .and_then(|s| s.parse().ok())
                                .unwrap_or(0.0);
                        }
                    }
                }
                return user + sys;
            }
        }
        0.0
    }
    
    #[cfg(target_os = "linux")]
    {
        use std::fs;
        use std::thread;
        use std::time::Duration;
        
        fn read_cpu_stats() -> Option<(u64, u64)> {
            let stat = fs::read_to_string("/proc/stat").ok()?;
            let line = stat.lines().next()?;
            let parts: Vec<u64> = line.split_whitespace()
                .skip(1)
                .filter_map(|s| s.parse().ok())
                .collect();
            
            if parts.len() >= 4 {
                let idle = parts[3];
                let total: u64 = parts.iter().sum();
                Some((idle, total))
            } else {
                None
            }
        }
        
        if let Some((idle1, total1)) = read_cpu_stats() {
            thread::sleep(Duration::from_millis(100));
            if let Some((idle2, total2)) = read_cpu_stats() {
                let idle_delta = idle2 - idle1;
                let total_delta = total2 - total1;
                if total_delta > 0 {
                    return 100.0 * (1.0 - (idle_delta as f64 / total_delta as f64));
                }
            }
        }
        0.0
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let output = Command::new("wmic")
            .args(["cpu", "get", "loadpercentage", "/VALUE"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default();
        
        for line in output.lines() {
            if line.starts_with("LoadPercentage=") {
                return line.split('=').nth(1)
                    .and_then(|s| s.trim().parse().ok())
                    .unwrap_or(0.0);
            }
        }
        0.0
    }
}

fn get_gpu_info() -> String {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let output = Command::new("system_profiler")
            .args(["SPDisplaysDataType", "-json"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default();
        
        // Simple parsing - look for chipset_model or gpu name
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&output) {
            if let Some(displays) = json.get("SPDisplaysDataType").and_then(|v| v.as_array()) {
                if let Some(first) = displays.first() {
                    if let Some(name) = first.get("sppci_model").and_then(|v| v.as_str()) {
                        return name.to_string();
                    }
                    if let Some(name) = first.get("spdisplays_vendor").and_then(|v| v.as_str()) {
                        return name.to_string();
                    }
                }
            }
        }
        
        // Fallback to simple grep
        let output = Command::new("system_profiler")
            .arg("SPDisplaysDataType")
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default();
        
        for line in output.lines() {
            if line.contains("Chipset Model:") || line.contains("Chip:") {
                return line.split(':').nth(1).map(|s| s.trim().to_string()).unwrap_or_default();
            }
        }
        "Unknown GPU".to_string()
    }
    
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let output = Command::new("lspci")
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default();
        
        for line in output.lines() {
            if line.contains("VGA") || line.contains("3D") || line.contains("Display") {
                return line.split(':').last().map(|s| s.trim().to_string()).unwrap_or_default();
            }
        }
        "Unknown GPU".to_string()
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let output = Command::new("wmic")
            .args(["path", "win32_videocontroller", "get", "name", "/VALUE"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default();
        
        for line in output.lines() {
            if line.starts_with("Name=") {
                return line.split('=').nth(1).map(|s| s.trim().to_string()).unwrap_or_default();
            }
        }
        "Unknown GPU".to_string()
    }
}

fn get_kernel_version() -> String {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("uname")
            .arg("-r")
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_else(|_| "unknown".to_string())
    }
    
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        Command::new("uname")
            .arg("-r")
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_else(|_| "unknown".to_string())
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let output = Command::new("cmd")
            .args(["/C", "ver"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_else(|_| "unknown".to_string());
        output
    }
}

fn get_uptime_hours() -> f64 {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let output = Command::new("sysctl")
            .args(["-n", "kern.boottime"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default();
        
        // Parse boottime like "{ sec = 1234567890, usec = 0 }"
        if let Some(sec_str) = output.split("sec = ").nth(1) {
            if let Some(sec) = sec_str.split(',').next() {
                if let Ok(boot_time) = sec.trim().parse::<i64>() {
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0);
                    return (now - boot_time) as f64 / 3600.0;
                }
            }
        }
        0.0
    }
    
    #[cfg(target_os = "linux")]
    {
        use std::fs;
        let uptime = fs::read_to_string("/proc/uptime").unwrap_or_default();
        uptime.split_whitespace().next()
            .and_then(|s| s.parse::<f64>().ok())
            .map(|s| s / 3600.0)
            .unwrap_or(0.0)
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let output = Command::new("wmic")
            .args(["os", "get", "LastBootUpTime", "/VALUE"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default();
        
        // Parse time and calculate uptime (simplified)
        0.0 // Windows uptime parsing is complex, return 0 for now
    }
}

fn detect_package_manager() -> String {
    #[cfg(target_os = "macos")]
    {
        "Homebrew".to_string()
    }
    
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        if Command::new("apt").arg("--version").output().is_ok() {
            "apt".to_string()
        } else if Command::new("dnf").arg("--version").output().is_ok() {
            "dnf".to_string()
        } else if Command::new("pacman").arg("--version").output().is_ok() {
            "pacman".to_string()
        } else if Command::new("zypper").arg("--version").output().is_ok() {
            "zypper".to_string()
        } else {
            "unknown".to_string()
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        if Command::new("winget").arg("--version").output().is_ok() {
            "winget".to_string()
        } else if Command::new("choco").arg("--version").output().is_ok() {
            "Chocolatey".to_string()
        } else {
            "unknown".to_string()
        }
    }
}

