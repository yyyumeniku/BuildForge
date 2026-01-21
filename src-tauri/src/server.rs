use serde::{Deserialize, Serialize};
use tokio_tungstenite::connect_async;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConnection {
    pub id: String,
    pub name: String,
    pub address: String,
    pub port: u16,
    pub status: ServerStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ServerStatus {
    Online,
    Offline,
    Connecting,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum ServerMessage {
    Ping,
    Pong,
    BuildStart(BuildStartPayload),
    BuildProgress(BuildProgressPayload),
    BuildComplete(BuildCompletePayload),
    BuildLog(BuildLogPayload),
    Error(String),
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildStartPayload {
    pub build_id: String,
    pub project_name: String,
    pub version: String,
    pub nodes: Vec<BuildNode>,
    pub edges: Vec<BuildEdge>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildProgressPayload {
    pub build_id: String,
    pub progress: u8,
    pub current_node: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildCompletePayload {
    pub build_id: String,
    pub success: bool,
    pub duration: u64,
    pub artifacts: Vec<String>,
    pub release_url: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildLogPayload {
    pub build_id: String,
    pub log: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildNode {
    pub id: String,
    pub node_type: String,
    pub name: String,
    pub config: serde_json::Value,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildEdge {
    pub id: String,
    pub source: String,
    pub target: String,
}

impl ServerConnection {
    pub fn new(name: String, address: String, port: u16) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            address,
            port,
            status: ServerStatus::Offline,
        }
    }

    pub async fn connect(&mut self) -> Result<(), String> {
        self.status = ServerStatus::Connecting;
        
        let url = format!("ws://{}:{}", self.address, self.port);
        
        match connect_async(&url).await {
            Ok((_ws_stream, _)) => {
                self.status = ServerStatus::Online;
                Ok(())
            }
            Err(e) => {
                self.status = ServerStatus::Offline;
                Err(format!("Failed to connect: {}", e))
            }
        }
    }

    pub fn disconnect(&mut self) {
        self.status = ServerStatus::Offline;
    }
}
