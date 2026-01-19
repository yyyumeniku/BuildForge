use crate::server::{ServerConnection, ServerStatus, BuildStartPayload, BuildNode, BuildEdge};
use crate::AppState;
use notify_rust::Notification;
use serde::{Deserialize, Serialize};
use tauri::State;

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
    build_id: String,
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
