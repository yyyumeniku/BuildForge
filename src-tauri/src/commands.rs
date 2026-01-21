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
    let icon = if success { "✅" } else { "❌" };
    
    Notification::new()
        .summary(&format!("{} {}", icon, title))
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
    
    // Check for various build system files
    if path.join("Cargo.toml").exists() {
        return Ok("cargo".to_string());
    }
    if path.join("go.mod").exists() {
        return Ok("go".to_string());
    }
    if path.join("pnpm-lock.yaml").exists() {
        return Ok("pnpm".to_string());
    }
    if path.join("yarn.lock").exists() {
        return Ok("yarn".to_string());
    }
    if path.join("package-lock.json").exists() || path.join("package.json").exists() {
        return Ok("npm".to_string());
    }
    if path.join("build.gradle").exists() || path.join("build.gradle.kts").exists() {
        return Ok("gradle".to_string());
    }
    if path.join("pom.xml").exists() {
        return Ok("maven".to_string());
    }
    if path.join("CMakeLists.txt").exists() {
        return Ok("cmake".to_string());
    }
    if path.join("Makefile").exists() {
        return Ok("make".to_string());
    }
    if path.join("pyproject.toml").exists() || path.join("setup.py").exists() {
        return Ok("python".to_string());
    }
    
    // Check for .csproj or .fsproj files
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str.ends_with(".csproj") || name_str.ends_with(".fsproj") {
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
    use tauri::Manager;
    
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

