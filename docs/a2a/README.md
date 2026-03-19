# A2A (Agent2Agent) Protocol Documentation

This directory contains documentation for the A2A protocol, which ftsfaf uses to communicate with ADK agents.

## Source
https://a2a-protocol.org/

## Key Understanding

**A2A + ADK Work Together:**
- **Google ADK**: Framework for building agents (handles LLM orchestration, tools, state management)
- **A2A Protocol**: Communication protocol for agent-to-agent interaction (JSON-RPC over HTTP)
- **ADK agents can expose A2A endpoints** - this is exactly what ftsfaf needs!

## Files Downloaded

- `a2a-protocol.txt` - Complete A2A protocol specification including:
  - JSON-RPC message structure
  - Task lifecycle management
  - AgentCard discovery mechanism
  - Streaming via Server-Sent Events (SSE)
  - Artifact handling (text, files, structured data)
  - Error codes and security considerations

## How ftsfaf Uses A2A

ftsfaf acts as an **A2A host/orchestrator** that:
1. Discovers ADK agents via their AgentCard (`/.well-known/agent-card.json`)
2. Sends tasks using A2A JSON-RPC methods (`message/send`, `message/stream`)
3. Receives artifacts (git branches, zip files, structured data)
4. Manages multi-step workflows across multiple ADK agents
5. Tracks task states and handles retry logic

## A2A JSON-RPC Methods Used by ftsfaf

### `message/send`
Send a message to an agent and get synchronous response:
```json
{
  "jsonrpc": "2.0",
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [{"type": "text", "text": "Implement authentication"}]
    },
    "contextId": "ctx-123",
    "taskId": "task-456"
  },
  "id": 1
}
```

### `message/stream`
Send a message and receive streaming updates via SSE:
```json
{
  "jsonrpc": "2.0",
  "method": "message/stream",
  "params": {
    "message": {
      "role": "user",
      "parts": [{"type": "text", "text": "Implement authentication"}]
    }
  },
  "id": 1
}
```

### `tasks/get`
Query task status:
```json
{
  "jsonrpc": "2.0",
  "method": "tasks/get",
  "params": {
    "id": "task-456"
  },
  "id": 2
}
```

## ADK Agent Sample (from A2A docs)

The A2A repository includes examples of **Google ADK agents** exposing A2A endpoints:

```python
# Python sample: ADK agent with A2A interface
from google.adk.agents import LlmAgent
from a2a import A2AServer

# Build agent with ADK
agent = LlmAgent(
    name="expense-reporter",
    model="gemini-2.0-flash",
    # ... agent config
)

# Expose via A2A protocol
server = A2AServer(agent)
server.run()  # Exposes JSON-RPC endpoints
```

This is exactly the pattern ftsfaf agents will follow!

## Integration Architecture

```
┌──────────────────────────────────────────────────────┐
│                      ftsfaf                          │
│                (A2A Host/Orchestrator)                │
│                                                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐   │
│  │ Workflow   │→ │   Graph    │→ │  Executor  │   │
│  │  Loader    │  │ Validator  │  │            │   │
│  └────────────┘  └────────────┘  └──────┬─────┘   │
│                                          │         │
└──────────────────────────────────────────┼─────────┘
                                           │
                           A2A JSON-RPC    │
                           (HTTP/SSE)      │
                                           │
         ┌─────────────────┬───────────────┼──────────┐
         │                 │               │          │
         ▼                 ▼               ▼          ▼
    ┌────────┐       ┌──────────┐   ┌──────────┐  ┌──────┐
    │  ADK   │       │   ADK    │   │   ADK    │  │ ADK  │
    │ Agent  │       │  Agent   │   │  Agent   │  │Agent │
    │  (SWE) │       │(Verifier)│   │ (Tester) │  │ ... │
    └────────┘       └──────────┘   └──────────┘  └──────┘
         │                 │               │          │
         └─────────────────┴───────────────┴──────────┘
              Each agent built with Google ADK
              Each exposes A2A JSON-RPC interface
              ftsfaf orchestrates them via A2A protocol
```

## Key A2A Concepts for ftsfaf

### 1. AgentCard Discovery
Each ADK agent exposes metadata at `/.well-known/agent-card.json`:
```json
{
  "protocolVersion": "1.0",
  "name": "swe-agent",
  "description": "Software engineering agent",
  "url": "http://localhost:50001",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false
  },
  "skills": [
    {
      "id": "coding",
      "name": "Code Generation",
      "description": "Implements features and writes code"
    }
  ]
}
```

### 2. Task Lifecycle
A2A defines standard task states:
- `submitted` → `working` → `completed`
- `submitted` → `working` → `failed`
- `submitted` → `working` → `input-required` → `working` → ...

ftsfaf tracks these states in SQLite.

### 3. Artifacts
A2A artifacts can contain:
- **TextPart**: Plain text responses
- **FilePart**: File references or inline bytes
- **DataPart**: Structured JSON data

Perfect for our git branch/zip file artifacts!

### 4. Streaming
Long-running tasks can stream updates:
- `TaskStatusUpdateEvent`: Status changes
- `TaskArtifactUpdateEvent`: Incremental artifact updates
- `SendStreamingMessageResponse`: Agent messages

## Next Steps

1. Add `@a2a-js/sdk` to package.json
2. Update agent schemas to include AgentCard structure
3. Implement A2A client for JSON-RPC communication
4. Create mock ADK agents that expose A2A endpoints
5. Test full workflow with A2A message passing
