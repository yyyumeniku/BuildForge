import { invoke } from "@tauri-apps/api/tauri";

// Storage configuration
interface StorageConfig {
  customPath: string | null;
}

let storageConfig: StorageConfig = {
  customPath: null,
};

// Initialize storage config from localStorage (bootstrap only)
export function initStorageConfig() {
  const saved = localStorage.getItem("buildforge-storage-config");
  if (saved) {
    try {
      storageConfig = JSON.parse(saved);
    } catch {
      // Ignore invalid config
    }
  }
}

export function getStorageConfig(): StorageConfig {
  return { ...storageConfig };
}

export function setCustomStoragePath(path: string | null) {
  storageConfig.customPath = path;
  localStorage.setItem("buildforge-storage-config", JSON.stringify(storageConfig));
}

// Get the app data directory
export async function getAppDataDir(): Promise<string> {
  if (storageConfig.customPath) {
    return storageConfig.customPath;
  }
  return await invoke<string>("get_app_data_dir");
}

// Save data to a file in app data directory
export async function saveData(filename: string, data: unknown): Promise<void> {
  const jsonData = JSON.stringify(data, null, 2);
  await invoke("save_app_data", {
    filename,
    data: jsonData,
    customPath: storageConfig.customPath,
  });
}

// Load data from a file in app data directory
export async function loadData<T>(filename: string): Promise<T | null> {
  const result = await invoke<string | null>("load_app_data", {
    filename,
    customPath: storageConfig.customPath,
  });
  
  if (result === null) {
    return null;
  }
  
  try {
    return JSON.parse(result) as T;
  } catch {
    console.error(`Failed to parse ${filename}`);
    return null;
  }
}

// Delete a file from app data directory
export async function deleteData(filename: string): Promise<void> {
  await invoke("delete_app_data", {
    filename,
    customPath: storageConfig.customPath,
  });
}

// List files in app data directory
export async function listFiles(subdirectory?: string): Promise<string[]> {
  return await invoke<string[]>("list_app_data_files", {
    subdirectory,
    customPath: storageConfig.customPath,
  });
}

// Ensure a subdirectory exists
export async function ensureDirectory(subdirectory: string): Promise<string> {
  return await invoke<string>("ensure_directory", {
    subdirectory,
    customPath: storageConfig.customPath,
  });
}

// Select a folder using native dialog
export async function selectFolder(): Promise<string | null> {
  return await invoke<string | null>("select_folder");
}

// Storage file names
export const STORAGE_FILES = {
  APP_STATE: "app-state.json",
  WORKFLOWS: "workflows.json",
  REPOS: "repos.json",
  SERVERS: "servers.json",
  ACTIONS: "actions.json",
  SETTINGS: "settings.json",
} as const;

// Subdirectories
export const STORAGE_DIRS = {
  CLONED_REPOS: "cloned-repos",
  ACTIONS: "actions",
  LOGS: "logs",
  CACHE: "cache",
} as const;

// Action types for local actions
export interface LocalAction {
  id: string;
  name: string;
  description: string;
  script: string; // Shell script content
  inputs: ActionInput[];
  outputs: ActionOutput[];
  createdAt: string;
  updatedAt: string;
}

export interface ActionInput {
  name: string;
  description: string;
  required: boolean;
  default?: string;
}

export interface ActionOutput {
  name: string;
  description: string;
}
