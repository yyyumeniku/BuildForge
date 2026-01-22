# BuildForge Custom Nodes

Official repository for BuildForge custom workflow nodes.

## Creating Custom Nodes

### Node Structure

A custom node is defined by a JSON file with this structure:

```json
{
  "id": "my-custom-node",
  "name": "My Custom Node",
  "description": "Executes custom commands",
  "version": "1.0.0",
  "author": "Your Name",
  "category": "custom",
  "icon": "terminal",
  "inputs": [
    {
      "id": "command",
      "label": "Command",
      "type": "string",
      "required": true
    },
    {
      "id": "args",
      "label": "Arguments",
      "type": "array",
      "default": []
    }
  ],
  "outputs": [
    {
      "id": "output",
      "label": "Command Output",
      "type": "string"
    },
    {
      "id": "exitCode",
      "label": "Exit Code",
      "type": "number"
    }
  ],
  "execution": {
    "type": "command",
    "command": "{{inputs.command}}",
    "args": "{{inputs.args}}",
    "cwd": "{{workflow.cwd}}"
  }
}
```

### Execution Types

#### 1. Command Execution
```json
{
  "execution": {
    "type": "command",
    "command": "npm",
    "args": ["install"],
    "cwd": "{{workflow.cwd}}"
  }
}
```

#### 2. Script Execution
```json
{
  "execution": {
    "type": "script",
    "language": "bash",
    "script": "echo 'Hello from {{inputs.name}}'"
  }
}
```

#### 3. HTTP Request
```json
{
  "execution": {
    "type": "http",
    "method": "POST",
    "url": "{{inputs.apiUrl}}",
    "headers": {
      "Authorization": "Bearer {{inputs.token}}"
    },
    "body": "{{inputs.data}}"
  }
}
```

## Example Nodes

### Timer Node
Schedules workflow execution at specific intervals or times.

```json
{
  "id": "timer",
  "name": "Timer/Schedule",
  "description": "Run workflow on schedule",
  "version": "1.0.0",
  "category": "trigger",
  "icon": "clock",
  "inputs": [
    {
      "id": "mode",
      "label": "Schedule Mode",
      "type": "select",
      "options": ["interval", "daily", "weekly"],
      "default": "interval"
    },
    {
      "id": "interval",
      "label": "Interval (hours)",
      "type": "number",
      "default": 1,
      "min": 0.1
    },
    {
      "id": "time",
      "label": "Time (HH:MM)",
      "type": "string",
      "default": "09:00"
    },
    {
      "id": "dayOfWeek",
      "label": "Day of Week",
      "type": "select",
      "options": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    }
  ],
  "execution": {
    "type": "timer",
    "schedule": "{{inputs.mode}}",
    "interval": "{{inputs.interval}}",
    "time": "{{inputs.time}}",
    "dayOfWeek": "{{inputs.dayOfWeek}}"
  }
}
```

### Custom Command Node
```json
{
  "id": "custom-command",
  "name": "Custom Command",
  "description": "Run any shell command",
  "version": "1.0.0",
  "category": "utility",
  "inputs": [
    {
      "id": "command",
      "label": "Command",
      "type": "string",
      "required": true
    }
  ],
  "execution": {
    "type": "command",
    "command": "{{inputs.command}}",
    "cwd": "{{workflow.cwd}}"
  }
}
```

### Slack Notification Node
```json
{
  "id": "slack-notify",
  "name": "Slack Notification",
  "description": "Send message to Slack",
  "version": "1.0.0",
  "category": "notification",
  "inputs": [
    {
      "id": "webhookUrl",
      "label": "Webhook URL",
      "type": "string",
      "required": true
    },
    {
      "id": "message",
      "label": "Message",
      "type": "text",
      "required": true
    }
  ],
  "execution": {
    "type": "http",
    "method": "POST",
    "url": "{{inputs.webhookUrl}}",
    "body": {
      "text": "{{inputs.message}}"
    }
  }
}
```

## Publishing Nodes

1. Create your node JSON file in the `nodes/` directory
2. Commit and push to your repository
3. Share your GitHub repository URL
4. Users can add via BuildForge Settings → Node Marketplace → Add Repository

## Contributing

Submit PRs to add your nodes to the official repository!
