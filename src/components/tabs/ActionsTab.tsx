import { useState } from "react";
import { Plus, Trash2, Play, Save, Edit2, Terminal, Code, ChevronDown, ChevronRight, Upload } from "lucide-react";
import { useAppStore, type LocalAction } from "../../store/appStore";
import { invoke } from "@tauri-apps/api/tauri";
import { open } from "@tauri-apps/api/dialog";
import { readTextFile } from "@tauri-apps/api/fs";

// Simple YAML parser for GitHub Actions workflows
function parseGitHubActionsYaml(content: string): { name: string; jobs: Record<string, { steps: Array<{ name?: string; run?: string; uses?: string; with?: Record<string, string> }> }> } | null {
  try {
    const lines = content.split('\n');
    const result: { name: string; jobs: Record<string, { steps: Array<{ name?: string; run?: string; uses?: string; with?: Record<string, string> }> }> } = {
      name: '',
      jobs: {}
    };
    
    let currentSection = '';
    let currentJob = '';
    let currentStep: { name?: string; run?: string; uses?: string; with?: Record<string, string> } | null = null;
    let inRun = false;
    let runContent = '';
    let runIndent = 0;
    let inWith = false;
    let withContent: Record<string, string> = {};
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const indent = line.length - line.trimStart().length;
      
      // Skip comments and empty lines
      if (trimmed.startsWith('#') || trimmed === '') continue;
      
      // Handle multi-line run content
      if (inRun) {
        if (indent > runIndent || (trimmed && !trimmed.includes(':'))) {
          runContent += (runContent ? '\n' : '') + trimmed;
          continue;
        } else {
          if (currentStep) currentStep.run = runContent;
          inRun = false;
          runContent = '';
        }
      }
      
      // Handle with section
      if (inWith) {
        if (indent > 6 && trimmed.includes(':')) {
          const [key, ...valueParts] = trimmed.split(':');
          withContent[key.trim()] = valueParts.join(':').trim().replace(/^['"]|['"]$/g, '');
          continue;
        } else {
          if (currentStep) currentStep.with = { ...withContent };
          inWith = false;
          withContent = {};
        }
      }
      
      // Parse name
      if (trimmed.startsWith('name:')) {
        const value = trimmed.substring(5).trim().replace(/^['"]|['"]$/g, '');
        if (currentStep) {
          currentStep.name = value;
        } else if (!currentJob) {
          result.name = value;
        }
        continue;
      }
      
      // Parse jobs section
      if (trimmed === 'jobs:') {
        currentSection = 'jobs';
        continue;
      }
      
      // Parse job name
      if (currentSection === 'jobs' && indent === 2 && trimmed.endsWith(':')) {
        currentJob = trimmed.slice(0, -1);
        result.jobs[currentJob] = { steps: [] };
        continue;
      }
      
      // Parse steps
      if (trimmed === 'steps:') {
        continue;
      }
      
      // Parse step start
      if (trimmed.startsWith('- ')) {
        if (currentStep && (currentStep.run || currentStep.uses)) {
          result.jobs[currentJob]?.steps.push(currentStep);
        }
        currentStep = {};
        const rest = trimmed.substring(2);
        if (rest.startsWith('name:')) {
          currentStep.name = rest.substring(5).trim().replace(/^['"]|['"]$/g, '');
        } else if (rest.startsWith('uses:')) {
          currentStep.uses = rest.substring(5).trim();
        } else if (rest.startsWith('run:')) {
          const runValue = rest.substring(4).trim();
          if (runValue === '|') {
            inRun = true;
            runIndent = indent;
          } else {
            currentStep.run = runValue.replace(/^['"]|['"]$/g, '');
          }
        }
        continue;
      }
      
      // Parse uses/run in step
      if (currentStep) {
        if (trimmed.startsWith('uses:')) {
          currentStep.uses = trimmed.substring(5).trim();
        } else if (trimmed.startsWith('run:')) {
          const runValue = trimmed.substring(4).trim();
          if (runValue === '|') {
            inRun = true;
            runIndent = indent;
          } else {
            currentStep.run = runValue.replace(/^['"]|['"]$/g, '');
          }
        } else if (trimmed === 'with:') {
          inWith = true;
        }
      }
    }
    
    // Add last step
    if (currentStep && (currentStep.run || currentStep.uses)) {
      result.jobs[currentJob]?.steps.push(currentStep);
    }
    
    return result;
  } catch (e) {
    console.error('Failed to parse YAML:', e);
    return null;
  }
}

// Convert GitHub Actions workflow to local actions
function convertWorkflowToActions(workflow: ReturnType<typeof parseGitHubActionsYaml>): Omit<LocalAction, 'id' | 'createdAt' | 'updatedAt'>[] {
  if (!workflow) return [];
  
  const actions: Omit<LocalAction, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  
  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    // Collect all run steps into a single script
    const runSteps = job.steps.filter(s => s.run);
    
    if (runSteps.length > 0) {
      const script = runSteps.map((step, idx) => {
        const header = step.name ? `# Step ${idx + 1}: ${step.name}` : `# Step ${idx + 1}`;
        return `${header}\n${step.run}`;
      }).join('\n\n');
      
      actions.push({
        name: `${workflow.name || 'Imported'} - ${jobName}`,
        description: `Imported from GitHub Actions workflow. Contains ${runSteps.length} step(s).`,
        script: `#!/bin/bash\nset -e\n\n${script}`,
        inputs: [],
        outputs: [],
      });
    }
    
    // Also create individual actions for complex steps
    for (const step of job.steps) {
      if (step.uses && step.uses.includes('/')) {
        // This is a GitHub Action - create a placeholder
        actions.push({
          name: step.name || step.uses.split('@')[0].split('/').pop() || 'Action',
          description: `Placeholder for GitHub Action: ${step.uses}\n\nOriginal action needs manual conversion.`,
          script: `#!/bin/bash\n# GitHub Action: ${step.uses}\n# This action needs to be manually converted to a local script.\n# Original parameters:\n${step.with ? Object.entries(step.with).map(([k, v]) => `# ${k}: ${v}`).join('\n') : '# (none)'}\n\necho "TODO: Implement local equivalent of ${step.uses}"`,
          inputs: step.with ? Object.keys(step.with).map(k => ({ name: k, description: '', required: false, default: step.with?.[k] })) : [],
          outputs: [],
        });
      }
    }
  }
  
  return actions;
}

export function ActionsTab() {
  const { 
    localActions, 
    addLocalAction, 
    updateLocalAction, 
    removeLocalAction,
    currentRun 
  } = useAppStore();
  
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [editingAction, setEditingAction] = useState<Partial<LocalAction> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [testOutput, setTestOutput] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [expandedInputs, setExpandedInputs] = useState(true);
  const [importStatus, setImportStatus] = useState<string>("");
  const [runningActions, setRunningActions] = useState<Array<{ actionId: string; actionName: string; startTime: number }>>([]);

  const selectedAction = localActions.find(a => a.id === selectedActionId);
  
  // Check if any actions are currently running from workflows
  const activeWorkflowAction = currentRun?.logs
    ?.filter(log => log.message.includes("Running action:"))
    ?.slice(-1)[0]
    ?.message.replace("Running action: ", "");

  const handleImportYaml = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'YAML Files',
          extensions: ['yml', 'yaml']
        }],
        title: 'Import GitHub Actions Workflow',
      });
      
      if (!selected) return;
      
      const files = Array.isArray(selected) ? selected : [selected];
      let totalImported = 0;
      
      for (const filePath of files) {
        try {
          const content = await readTextFile(filePath);
          const workflow = parseGitHubActionsYaml(content);
          
          if (workflow) {
            const actions = convertWorkflowToActions(workflow);
            for (const action of actions) {
              addLocalAction(action);
              totalImported++;
            }
          }
        } catch (e) {
          console.error(`Failed to import ${filePath}:`, e);
        }
      }
      
      setImportStatus(`Imported ${totalImported} action(s) from ${files.length} file(s)`);
      setTimeout(() => setImportStatus(""), 3000);
    } catch (e) {
      console.error('Import failed:', e);
      setImportStatus("Import failed");
      setTimeout(() => setImportStatus(""), 3000);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setEditingAction({
      name: "New Action",
      description: "",
      script: "#!/bin/bash\n\necho \"Hello from BuildForge Action!\"\n",
      inputs: [],
      outputs: [],
    });
    setSelectedActionId(null);
  };

  const handleSave = () => {
    if (!editingAction) return;
    
    if (isCreating) {
      const id = addLocalAction({
        name: editingAction.name || "Unnamed Action",
        description: editingAction.description || "",
        script: editingAction.script || "",
        inputs: editingAction.inputs || [],
        outputs: editingAction.outputs || [],
      });
      setSelectedActionId(id);
      setIsCreating(false);
    } else if (selectedActionId) {
      updateLocalAction(selectedActionId, editingAction);
    }
    setEditingAction(null);
  };

  const handleCancel = () => {
    setEditingAction(null);
    setIsCreating(false);
  };

  const handleEdit = () => {
    if (selectedAction) {
      setEditingAction({ ...selectedAction });
    }
  };

  const handleDelete = () => {
    if (selectedActionId && confirm("Delete this action?")) {
      removeLocalAction(selectedActionId);
      setSelectedActionId(null);
    }
  };

  const handleTest = async () => {
    const action = editingAction || selectedAction;
    if (!action?.script) return;
    
    setIsRunning(true);
    setTestOutput("Running action...\n");
    
    // Add to running actions
    const actionEntry = {
      actionId: selectedActionId || "test",
      actionName: action.name || "Test Action",
      startTime: Date.now()
    };
    setRunningActions(prev => [...prev, actionEntry]);
    
    try {
      // Create a temp script file and run it
      const result = await invoke<string>("run_command", {
        command: "bash",
        args: ["-c", action.script],
        cwd: "/tmp",
      });
      setTestOutput(prev => prev + result + "\nAction completed successfully");
    } catch (e: unknown) {
      const errMsg = typeof e === 'string' ? e : JSON.stringify(e);
      setTestOutput(prev => prev + `\nError: ${errMsg}`);
    } finally {
      setIsRunning(false);
      // Remove from running actions
      setRunningActions(prev => prev.filter(a => a.actionId !== actionEntry.actionId || a.startTime !== actionEntry.startTime));
    }
  };

  const addInput = () => {
    if (editingAction) {
      setEditingAction({
        ...editingAction,
        inputs: [...(editingAction.inputs || []), { name: "", description: "", required: false }],
      });
    }
  };

  const removeInput = (index: number) => {
    if (editingAction?.inputs) {
      setEditingAction({
        ...editingAction,
        inputs: editingAction.inputs.filter((_, i) => i !== index),
      });
    }
  };

  const updateInput = (index: number, field: string, value: string | boolean) => {
    if (editingAction?.inputs) {
      const newInputs = [...editingAction.inputs];
      newInputs[index] = { ...newInputs[index], [field]: value };
      setEditingAction({ ...editingAction, inputs: newInputs });
    }
  };

  const current = editingAction || selectedAction;
  const isEditing = !!editingAction;

  return (
    <div className="flex h-full">
      {/* Left: Actions List */}
      <div className="w-64 bg-slate-900 border-r border-slate-700 flex flex-col">
        <div className="p-3 border-b border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-white">Local Actions</h3>
          </div>
          <div className="space-y-2">
            <button
              onClick={handleCreate}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              New Action
            </button>
            <button
              onClick={handleImportYaml}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded text-white text-sm font-medium"
            >
              <Upload className="w-4 h-4" />
              Import from YAML
            </button>
          </div>
          {importStatus && (
            <p className="text-xs text-center mt-2 text-green-400">{importStatus}</p>
          )}
        </div>
        
        {/* Currently Running Actions Section */}
        {(runningActions.length > 0 || activeWorkflowAction) && (
          <div className="border-t border-slate-700 p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <h4 className="text-xs font-medium text-white uppercase tracking-wide">Running</h4>
            </div>
            {runningActions.map((action) => (
              <div key={`${action.actionId}-${action.startTime}`} className="p-2 bg-green-500/10 border border-green-500/30 rounded mb-2">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3 h-3 text-green-400" />
                  <span className="text-xs text-green-400 truncate">{action.actionName}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {Math.floor((Date.now() - action.startTime) / 1000)}s
                </p>
              </div>
            ))}
            {activeWorkflowAction && !runningActions.some(a => a.actionName === activeWorkflowAction) && (
              <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3 h-3 text-blue-400" />
                  <span className="text-xs text-blue-400 truncate">{activeWorkflowAction}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Via workflow</p>
              </div>
            )}
          </div>
        )}
        
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {localActions.length === 0 && !isCreating && (
            <p className="text-xs text-slate-500 text-center py-4">
              No actions yet.<br/>Create your first local action<br/>or import from a build.yml file!
            </p>
          )}
          
          {localActions.map(action => (
            <button
              key={action.id}
              onClick={() => {
                setSelectedActionId(action.id);
                setEditingAction(null);
                setIsCreating(false);
              }}
              className={`w-full text-left p-2 rounded text-sm ${
                selectedActionId === action.id
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-green-400" />
                <span className="truncate">{action.name}</span>
              </div>
              {action.description && (
                <p className="text-xs text-slate-500 mt-1 truncate">{action.description}</p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right: Action Editor */}
      <div className="flex-1 flex flex-col bg-slate-950">
        {!current && !isCreating ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Code className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-xl font-medium text-slate-400 mb-2">No Action Selected</p>
              <p className="text-sm text-slate-500 mb-4">
                Create reusable shell scripts that can be used in your workflows
              </p>
              <button 
                onClick={handleCreate}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Action
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="h-12 border-b border-slate-700 flex items-center justify-between px-4 bg-slate-900">
              <div className="flex items-center gap-3">
                <Terminal className="w-5 h-5 text-green-400" />
                {isEditing ? (
                  <input
                    type="text"
                    value={editingAction?.name || ""}
                    onChange={(e) => setEditingAction({ ...editingAction, name: e.target.value })}
                    className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm"
                    placeholder="Action name"
                  />
                ) : (
                  <span className="text-white font-medium">{current?.name}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleCancel}
                      className="px-3 py-1.5 text-slate-400 hover:text-white text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-white text-sm font-medium"
                    >
                      <Save className="w-4 h-4" />
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleEdit}
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-white text-sm"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={handleTest}
                      disabled={isRunning}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-white text-sm font-medium"
                    >
                      <Play className="w-4 h-4" />
                      Test
                    </button>
                    <button
                      onClick={handleDelete}
                      className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-white text-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex overflow-hidden">
              {/* Script Editor */}
              <div className="flex-1 flex flex-col border-r border-slate-700">
                <div className="px-4 py-2 border-b border-slate-700 bg-slate-900/50">
                  <span className="text-xs text-slate-500 uppercase tracking-wide">Script</span>
                </div>
                <div className="flex-1 overflow-auto">
                  {isEditing ? (
                    <textarea
                      value={editingAction?.script || ""}
                      onChange={(e) => setEditingAction({ ...editingAction, script: e.target.value })}
                      className="w-full h-full p-4 bg-slate-950 text-green-400 font-mono text-sm resize-none outline-none"
                      placeholder="#!/bin/bash&#10;&#10;# Your script here..."
                      spellCheck={false}
                    />
                  ) : (
                    <pre className="p-4 text-green-400 font-mono text-sm whitespace-pre-wrap">
                      {current?.script || "No script defined"}
                    </pre>
                  )}
                </div>
              </div>

              {/* Right Panel: Properties & Test Output */}
              <div className="w-80 flex flex-col bg-slate-900">
                {/* Description */}
                <div className="p-4 border-b border-slate-700">
                  <label className="block text-xs text-slate-500 mb-1">Description</label>
                  {isEditing ? (
                    <textarea
                      value={editingAction?.description || ""}
                      onChange={(e) => setEditingAction({ ...editingAction, description: e.target.value })}
                      className="w-full h-20 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm resize-none"
                      placeholder="What does this action do?"
                    />
                  ) : (
                    <p className="text-sm text-slate-300">
                      {current?.description || "No description"}
                    </p>
                  )}
                </div>

                {/* Inputs */}
                <div className="p-4 border-b border-slate-700">
                  <button
                    onClick={() => setExpandedInputs(!expandedInputs)}
                    className="flex items-center gap-2 text-xs text-slate-500 mb-2 hover:text-white"
                  >
                    {expandedInputs ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    INPUTS ({current?.inputs?.length || 0})
                  </button>
                  
                  {expandedInputs && (
                    <div className="space-y-2">
                      {(isEditing ? editingAction?.inputs : current?.inputs)?.map((input, idx) => (
                        <div key={idx} className="p-2 bg-slate-800 rounded text-xs">
                          {isEditing ? (
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={input.name}
                                onChange={(e) => updateInput(idx, "name", e.target.value)}
                                className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white"
                                placeholder="Input name"
                              />
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-1 text-slate-400">
                                  <input
                                    type="checkbox"
                                    checked={input.required}
                                    onChange={(e) => updateInput(idx, "required", e.target.checked)}
                                    className="w-3 h-3"
                                  />
                                  Required
                                </label>
                                <button
                                  onClick={() => removeInput(idx)}
                                  className="text-red-400 hover:text-red-300 ml-auto"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <span className="text-white">${input.name}</span>
                              {input.required && (
                                <span className="text-amber-400 text-xs">required</span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {isEditing && (
                        <button
                          onClick={addInput}
                          className="w-full flex items-center justify-center gap-1 px-2 py-1 border border-dashed border-slate-600 rounded text-slate-500 hover:text-white hover:border-slate-500 text-xs"
                        >
                          <Plus className="w-3 h-3" />
                          Add Input
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Test Output */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-4 py-2 border-b border-slate-700">
                    <span className="text-xs text-slate-500 uppercase tracking-wide">Test Output</span>
                  </div>
                  <div className="flex-1 overflow-auto p-4">
                    <pre className="text-xs text-slate-400 font-mono whitespace-pre-wrap">
                      {testOutput || "Run the action to see output here"}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
