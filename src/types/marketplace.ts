export interface CustomNode {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  icon: string;
  color?: string;
  inputs: NodeInput[];
  outputs: NodeOutput[];
  execution: NodeExecution;
  repository?: string;
}

export interface NodeInput {
  id: string;
  label: string;
  type: "string" | "number" | "boolean" | "select" | "array" | "text" | "time";
  required?: boolean;
  default?: any;
  options?: Array<string | { value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  showWhen?: Record<string, any>;
}

export interface NodeOutput {
  id: string;
  label: string;
  type: string;
}

export interface NodeExecution {
  type: "command" | "script" | "http" | "timer";
  command?: string;
  args?: string[];
  cwd?: string;
  script?: string;
  language?: string;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: any;
  schedule?: string;
  interval?: string | number;
  time?: string;
  dayOfWeek?: string;
  enabled?: string | boolean;
}

export interface NodeRepository {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  nodes: CustomNode[];
  lastUpdated?: Date;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  tags: string[];
  nodes: any[];
  edges: any[];
  repository?: string;
}

export interface WorkflowRepository {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  workflows: WorkflowTemplate[];
  lastUpdated?: Date;
}

// Default official repository
export const OFFICIAL_NODE_REPO: NodeRepository = {
  id: "official",
  name: "BuildForge Official Nodes",
  url: "https://github.com/yyyumeniku/buildforge-nodes",
  enabled: true,
  nodes: [],
};

export const OFFICIAL_WORKFLOW_REPO: WorkflowRepository = {
  id: "official",
  name: "BuildForge Official Workflows",
  url: "https://github.com/yyyumeniku/buildforge-workflows",
  enabled: true,
  workflows: [],
};
