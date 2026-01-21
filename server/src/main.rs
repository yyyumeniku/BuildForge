use anyhow::Result;
use clap::Parser;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::process::Command;
use tokio::sync::RwLock;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{error, info, warn};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Port to listen on
    #[arg(short, long, default_value = "9876")]
    port: u16,

    /// GitHub token for creating releases
    #[arg(long, env = "GITHUB_TOKEN")]
    github_token: Option<String>,

    /// Working directory for builds
    #[arg(short, long, default_value = ".")]
    workdir: PathBuf,

    /// Data directory for storing workflows, actions, and settings
    #[arg(long, default_value = "./data")]
    data_dir: PathBuf,
}

// =====================================================
// Persistent Storage Structures
// =====================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct ServerData {
    workflows: Vec<StoredWorkflow>,
    actions: Vec<StoredAction>,
    repos: Vec<StoredRepo>,
    build_history: Vec<BuildRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredWorkflow {
    id: String,
    name: String,
    repo_id: Option<String>,
    nodes: Vec<serde_json::Value>,
    connections: Vec<serde_json::Value>,
    next_version: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredAction {
    id: String,
    name: String,
    description: String,
    script: String,
    inputs: Vec<serde_json::Value>,
    outputs: Vec<serde_json::Value>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredRepo {
    id: String,
    path: String,
    owner: Option<String>,
    repo: Option<String>,
    default_branch: String,
    cloned_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BuildRecord {
    id: String,
    workflow_id: String,
    status: String,
    started_at: String,
    finished_at: Option<String>,
    duration_ms: Option<u64>,
    logs: Vec<String>,
}

type SharedData = Arc<RwLock<ServerData>>;

impl ServerData {
    fn load(data_dir: &PathBuf) -> Result<Self> {
        let path = data_dir.join("server-data.json");
        if path.exists() {
            let content = std::fs::read_to_string(&path)?;
            let data: ServerData = serde_json::from_str(&content)?;
            info!("Loaded {} workflows, {} actions from {}", 
                data.workflows.len(), data.actions.len(), path.display());
            Ok(data)
        } else {
            info!("No existing data found, starting fresh");
            Ok(ServerData::default())
        }
    }

    fn save(&self, data_dir: &PathBuf) -> Result<()> {
        std::fs::create_dir_all(data_dir)?;
        let path = data_dir.join("server-data.json");
        let content = serde_json::to_string_pretty(self)?;
        std::fs::write(&path, content)?;
        info!("Saved data to {}", path.display());
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
enum ServerMessage {
    Ping,
    Pong,
    BuildStart(BuildStartPayload),
    BuildProgress(BuildProgressPayload),
    BuildComplete(BuildCompletePayload),
    BuildLog(BuildLogPayload),
    BuildCancel(String),
    Error(String),
    // Data sync messages
    SyncRequest,
    SyncResponse(SyncData),
    SaveWorkflow(StoredWorkflow),
    DeleteWorkflow(String),
    SaveAction(StoredAction),
    DeleteAction(String),
    RunAction(RunActionPayload),
    ActionResult(ActionResultPayload),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncData {
    workflows: Vec<StoredWorkflow>,
    actions: Vec<StoredAction>,
    repos: Vec<StoredRepo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RunActionPayload {
    action_id: String,
    inputs: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ActionResultPayload {
    action_id: String,
    success: bool,
    output: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BuildStartPayload {
    build_id: String,
    project_name: String,
    version: String,
    nodes: Vec<BuildNode>,
    edges: Vec<BuildEdge>,
    github_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BuildProgressPayload {
    build_id: String,
    progress: u8,
    current_node: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BuildCompletePayload {
    build_id: String,
    success: bool,
    duration: u64,
    artifacts: Vec<String>,
    release_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BuildLogPayload {
    build_id: String,
    log: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BuildNode {
    id: String,
    #[serde(rename = "type")]
    node_type: String,
    name: String,
    config: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BuildEdge {
    id: String,
    source: String,
    target: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("buildforge_server=info".parse()?)
        )
        .init();

    let args = Args::parse();
    
    // Initialize data storage
    let data = ServerData::load(&args.data_dir).unwrap_or_default();
    let shared_data: SharedData = Arc::new(RwLock::new(data));
    
    let addr = SocketAddr::from(([0, 0, 0, 0], args.port));
    let listener = TcpListener::bind(&addr).await?;
    
    info!("BuildForge server listening on {}", addr);
    info!("Working directory: {:?}", args.workdir);
    info!("Data directory: {:?}", args.data_dir);
    
    if args.github_token.is_some() {
        info!("GitHub token configured");
    }

    loop {
        match listener.accept().await {
            Ok((stream, peer)) => {
                info!("New connection from {}", peer);
                let github_token = args.github_token.clone();
                let workdir = args.workdir.clone();
                let data_dir = args.data_dir.clone();
                let data_clone = shared_data.clone();
                
                tokio::spawn(async move {
                    if let Err(e) = handle_connection(stream, github_token, workdir, data_dir, data_clone).await {
                        error!("Connection error: {}", e);
                    }
                });
            }
            Err(e) => {
                error!("Failed to accept connection: {}", e);
            }
        }
    }
}

async fn handle_connection(
    stream: TcpStream,
    github_token: Option<String>,
    workdir: PathBuf,
    data_dir: PathBuf,
    shared_data: SharedData,
) -> Result<()> {
    let ws_stream = accept_async(stream).await?;
    let (mut write, mut read) = ws_stream.split();
    
    info!("WebSocket connection established");
    
    while let Some(msg) = read.next().await {
        let msg = msg?;
        
        if let Message::Text(text) = msg {
            let server_msg: ServerMessage = serde_json::from_str(&text)?;
            
            match server_msg {
                ServerMessage::Ping => {
                    let pong = serde_json::to_string(&ServerMessage::Pong)?;
                    write.send(Message::Text(pong)).await?;
                }
                ServerMessage::BuildStart(payload) => {
                    info!("Starting build: {} v{}", payload.project_name, payload.version);
                    
                    let token = payload.github_token.clone().or(github_token.clone());
                    
                    // Execute build in background
                    let workdir = workdir.clone();
                    let data_clone = shared_data.clone();
                    let data_dir_clone = data_dir.clone();
                    tokio::spawn(async move {
                        if let Err(e) = execute_build(payload.clone(), token, workdir).await {
                            error!("Build failed: {}", e);
                        }
                        // Record build in history
                        let mut data = data_clone.write().await;
                        data.build_history.push(BuildRecord {
                            id: payload.build_id.clone(),
                            workflow_id: String::new(),
                            status: "completed".to_string(),
                            started_at: chrono::Utc::now().to_rfc3339(),
                            finished_at: Some(chrono::Utc::now().to_rfc3339()),
                            duration_ms: None,
                            logs: vec![],
                        });
                        let _ = data.save(&data_dir_clone);
                    });
                }
                ServerMessage::BuildCancel(build_id) => {
                    warn!("Build cancel requested: {}", build_id);
                    // TODO: Implement build cancellation
                }
                // Data sync handlers
                ServerMessage::SyncRequest => {
                    info!("Sync request received");
                    let data = shared_data.read().await;
                    let sync_data = SyncData {
                        workflows: data.workflows.clone(),
                        actions: data.actions.clone(),
                        repos: data.repos.clone(),
                    };
                    let response = serde_json::to_string(&ServerMessage::SyncResponse(sync_data))?;
                    write.send(Message::Text(response)).await?;
                }
                ServerMessage::SaveWorkflow(workflow) => {
                    info!("Saving workflow: {}", workflow.name);
                    let mut data = shared_data.write().await;
                    if let Some(existing) = data.workflows.iter_mut().find(|w| w.id == workflow.id) {
                        *existing = workflow;
                    } else {
                        data.workflows.push(workflow);
                    }
                    let _ = data.save(&data_dir);
                }
                ServerMessage::DeleteWorkflow(id) => {
                    info!("Deleting workflow: {}", id);
                    let mut data = shared_data.write().await;
                    data.workflows.retain(|w| w.id != id);
                    let _ = data.save(&data_dir);
                }
                ServerMessage::SaveAction(action) => {
                    info!("Saving action: {}", action.name);
                    let mut data = shared_data.write().await;
                    if let Some(existing) = data.actions.iter_mut().find(|a| a.id == action.id) {
                        *existing = action;
                    } else {
                        data.actions.push(action);
                    }
                    let _ = data.save(&data_dir);
                }
                ServerMessage::DeleteAction(id) => {
                    info!("Deleting action: {}", id);
                    let mut data = shared_data.write().await;
                    data.actions.retain(|a| a.id != id);
                    let _ = data.save(&data_dir);
                }
                ServerMessage::RunAction(payload) => {
                    info!("Running action: {}", payload.action_id);
                    let data = shared_data.read().await;
                    if let Some(action) = data.actions.iter().find(|a| a.id == payload.action_id) {
                        // Build environment with inputs
                        let mut script = action.script.clone();
                        for (key, value) in &payload.inputs {
                            script = format!("export {}=\"{}\"\n{}", key, value, script);
                        }
                        
                        let result = run_script(&script, &workdir).await;
                        let (success, output) = match result {
                            Ok(out) => (true, out),
                            Err(e) => (false, e.to_string()),
                        };
                        
                        let response = serde_json::to_string(&ServerMessage::ActionResult(ActionResultPayload {
                            action_id: payload.action_id,
                            success,
                            output,
                        }))?;
                        write.send(Message::Text(response)).await?;
                    } else {
                        let response = serde_json::to_string(&ServerMessage::Error(
                            format!("Action not found: {}", payload.action_id)
                        ))?;
                        write.send(Message::Text(response)).await?;
                    }
                }
                _ => {}
            }
        }
    }
    
    info!("WebSocket connection closed");
    Ok(())
}

async fn run_script(script: &str, workdir: &PathBuf) -> Result<String> {
    let output = Command::new("bash")
        .arg("-c")
        .arg(script)
        .current_dir(workdir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    
    if output.status.success() {
        Ok(format!("{}{}", stdout, stderr))
    } else {
        anyhow::bail!("Script failed: {}{}", stdout, stderr)
    }
}

async fn execute_build(
    payload: BuildStartPayload,
    github_token: Option<String>,
    workdir: PathBuf,
) -> Result<()> {
    let start_time = std::time::Instant::now();
    let build_id = &payload.build_id;
    
    // Sort nodes by dependencies (topological sort)
    let sorted_nodes = topological_sort(&payload.nodes, &payload.edges)?;
    let total_nodes = sorted_nodes.len();
    let mut artifacts: Vec<String> = Vec::new();
    let mut release_url: Option<String> = None;
    
    for (index, node) in sorted_nodes.iter().enumerate() {
        let progress = ((index as f32 / total_nodes as f32) * 100.0) as u8;
        
        info!("Executing node: {} ({})", node.name, node.node_type);
        
        match node.node_type.as_str() {
            "command" => {
                let command = node.config.get("command")
                    .and_then(|v| v.as_str())
                    .unwrap_or("echo 'No command specified'");
                
                let cwd = node.config.get("cwd")
                    .and_then(|v| v.as_str())
                    .map(|s| s.replace("$PROJECT_ROOT", workdir.to_str().unwrap_or(".")))
                    .unwrap_or_else(|| workdir.to_string_lossy().to_string());
                
                run_command(command, &cwd, build_id).await?;
            }
            "script" => {
                let script = node.config.get("script")
                    .and_then(|v| v.as_str())
                    .unwrap_or("echo 'No script'");
                
                let shell = node.config.get("shell")
                    .and_then(|v| v.as_str())
                    .unwrap_or("bash");
                
                run_script(script, shell, &workdir, build_id).await?;
            }
            "artifact" => {
                let path_pattern = node.config.get("path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("dist/*");
                
                let full_pattern = workdir.join(path_pattern);
                for entry in glob::glob(full_pattern.to_str().unwrap())? {
                    if let Ok(path) = entry {
                        artifacts.push(path.to_string_lossy().to_string());
                        info!("Collected artifact: {:?}", path);
                    }
                }
            }
            "release" => {
                if let Some(token) = &github_token {
                    let tag = node.config.get("tag")
                        .and_then(|v| v.as_str())
                        .unwrap_or("v1.0.0")
                        .replace("$VERSION", &payload.version);
                    
                    let title = node.config.get("title")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Release")
                        .replace("$VERSION", &payload.version);
                    
                    let body = node.config.get("body")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    
                    let draft = node.config.get("draft")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    
                    let prerelease = node.config.get("prerelease")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    
                    // Create GitHub release
                    // release_url = create_github_release(...).await?;
                    info!("Would create release: {} - {}", tag, title);
                } else {
                    warn!("No GitHub token provided, skipping release");
                }
            }
            _ => {
                warn!("Unknown node type: {}", node.node_type);
            }
        }
    }
    
    let duration = start_time.elapsed().as_secs();
    info!("Build completed in {}s", duration);
    
    Ok(())
}

async fn run_command(command: &str, cwd: &str, build_id: &str) -> Result<()> {
    info!("[{}] Running: {} in {}", build_id, command, cwd);
    
    let output = Command::new("sh")
        .arg("-c")
        .arg(command)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?
        .wait_with_output()
        .await?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("[{}] Command failed: {}", build_id, stderr);
        anyhow::bail!("Command failed: {}", stderr);
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    info!("[{}] Output: {}", build_id, stdout);
    
    Ok(())
}

async fn run_script(script: &str, shell: &str, workdir: &PathBuf, build_id: &str) -> Result<()> {
    info!("[{}] Running script with {}", build_id, shell);
    
    let script_path = workdir.join(format!(".buildforge-{}.sh", build_id));
    tokio::fs::write(&script_path, script).await?;
    
    let result = Command::new(shell)
        .arg(&script_path)
        .current_dir(workdir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?
        .wait_with_output()
        .await;
    
    // Cleanup script file
    let _ = tokio::fs::remove_file(&script_path).await;
    
    let output = result?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("[{}] Script failed: {}", build_id, stderr);
        anyhow::bail!("Script failed: {}", stderr);
    }
    
    Ok(())
}

fn topological_sort(nodes: &[BuildNode], edges: &[BuildEdge]) -> Result<Vec<BuildNode>> {
    use std::collections::{HashMap, VecDeque};
    
    let mut in_degree: HashMap<&str, usize> = HashMap::new();
    let mut adjacency: HashMap<&str, Vec<&str>> = HashMap::new();
    
    for node in nodes {
        in_degree.insert(&node.id, 0);
        adjacency.insert(&node.id, Vec::new());
    }
    
    for edge in edges {
        if let Some(targets) = adjacency.get_mut(edge.source.as_str()) {
            targets.push(&edge.target);
        }
        if let Some(degree) = in_degree.get_mut(edge.target.as_str()) {
            *degree += 1;
        }
    }
    
    let mut queue: VecDeque<&str> = in_degree
        .iter()
        .filter(|(_, &d)| d == 0)
        .map(|(&id, _)| id)
        .collect();
    
    let mut sorted_ids: Vec<&str> = Vec::new();
    
    while let Some(id) = queue.pop_front() {
        sorted_ids.push(id);
        
        if let Some(targets) = adjacency.get(id) {
            for &target in targets {
                if let Some(degree) = in_degree.get_mut(target) {
                    *degree -= 1;
                    if *degree == 0 {
                        queue.push_back(target);
                    }
                }
            }
        }
    }
    
    if sorted_ids.len() != nodes.len() {
        anyhow::bail!("Circular dependency detected in build nodes");
    }
    
    let node_map: HashMap<&str, &BuildNode> = nodes.iter().map(|n| (n.id.as_str(), n)).collect();
    let sorted_nodes: Vec<BuildNode> = sorted_ids
        .iter()
        .filter_map(|id| node_map.get(id).map(|&n| n.clone()))
        .collect();
    
    Ok(sorted_nodes)
}
