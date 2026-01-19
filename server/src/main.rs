use anyhow::Result;
use clap::Parser;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::process::Command;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{error, info, warn};
use uuid::Uuid;

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
    
    let addr = SocketAddr::from(([0, 0, 0, 0], args.port));
    let listener = TcpListener::bind(&addr).await?;
    
    info!("BuildForge server listening on {}", addr);
    info!("Working directory: {:?}", args.workdir);
    
    if args.github_token.is_some() {
        info!("GitHub token configured");
    }

    loop {
        match listener.accept().await {
            Ok((stream, peer)) => {
                info!("New connection from {}", peer);
                let github_token = args.github_token.clone();
                let workdir = args.workdir.clone();
                
                tokio::spawn(async move {
                    if let Err(e) = handle_connection(stream, github_token, workdir).await {
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
                    
                    let token = payload.github_token.or(github_token.clone());
                    
                    // Execute build in background
                    let workdir = workdir.clone();
                    tokio::spawn(async move {
                        if let Err(e) = execute_build(payload, token, workdir).await {
                            error!("Build failed: {}", e);
                        }
                    });
                }
                ServerMessage::BuildCancel(build_id) => {
                    warn!("Build cancel requested: {}", build_id);
                    // TODO: Implement build cancellation
                }
                _ => {}
            }
        }
    }
    
    info!("WebSocket connection closed");
    Ok(())
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
    use std::collections::{HashMap, HashSet, VecDeque};
    
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
