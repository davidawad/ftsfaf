# ftsfaf Architecture Plan

## Critical Clarification

**ftsfaf is framework-agnostic!** It uses A2A protocol to communicate with agents built on **ANY framework**:
- **OpenClaw** (our primary framework)
- Google ADK (one of many frameworks)
- LangGraph, CrewAI, custom implementations, etc.

The ADK documentation in `docs/adk/` is kept as a **reference example** of how agents can expose A2A endpoints, but **OpenClaw is our primary agent framework**.

## Key Insights from ADK Documentation

### 1. ADK Agent Types
- **LLM Agents**: Powered by language models (Gemini, Claude, etc.)
- **Workflow Agents**: Sequential, Parallel, Loop agents that orchestrate sub-agents
- **Custom Agents**: User-defined agents with specialized logic

### 2. ADK Communication Patterns
- **Shared Session State**: Agents read/write to `session.state` to pass data
- **LLM-Driven Delegation**: Agents can `transfer_to_agent()` to route work
- **Explicit Invocation**: Agents can use `AgentTool` to call other agents
- **Events**: The basic unit of communication in ADK

### 3. ADK Multi-Agent Patterns
- **Coordinator/Dispatcher**: Central agent routes to specialists
- **Sequential Pipeline**: Agents execute in fixed order
- **Parallel Fan-Out/Gather**: Concurrent execution with aggregation
- **Hierarchical Task Decomposition**: Multi-level agent trees
- **Review/Critique**: Generator-Critic pattern
- **Iterative Refinement**: Loop-based improvement

## ftsfaf's Role: Framework-Agnostic Orchestration via A2A

### The Stack:
```
ftsfaf (A2A Workflow Orchestrator)
    ↕ A2A Protocol (JSON-RPC over HTTP)
Agent Frameworks (each with A2A adapter)
    ├─ OpenClaw (primary)
    ├─ Google ADK
    ├─ LangGraph
    ├─ CrewAI
    └─ Custom agents
```

### What ftsfaf IS:
 **Framework-agnostic A2A orchestrator** that:
- Discovers agents via AgentCard (`/.well-known/agent-card.json`)
- Sends tasks using A2A JSON-RPC methods (`message/send`, `message/stream`)
- Coordinates agents across different git repositories/projects
- Manages artifact storage and state passing between repos
- Provides workflow validation (cycle detection, dependency checks)
- Tracks A2A task states and handles retry logic with bounded cycles
- **Doesn't care which framework agents are built with!**

### What Each Layer Handles:
- **ftsfaf**: Multi-step workflows, graph validation, artifact routing, retry logic
- **A2A Protocol**: Agent discovery, task lifecycle, streaming, structured messages
- **A2A Adapters**: Framework-specific bridges (OpenClaw↔A2A, ADK↔A2A, etc.)
- **Agent Frameworks**: OpenClaw, ADK, LangGraph, CrewAI, etc. (build the agents)
- **LLMs**: Reasoning, code generation, analysis

### The Gap ftsfaf Fills:
Agent frameworks (OpenClaw, ADK, etc.) are designed for **building individual agents**.
A2A is designed for **agent-to-agent communication**.
ftsfaf adds **multi-agent workflow orchestration** where:
- Multiple agents (any framework) collaborate on multi-step pipelines
- Agents operate on different codebases/repositories
- State passes between agents as structured A2A artifacts
- Workflows have dependency graphs, retry logic, and validation
- Execution is tracked persistently in SQLite

## Integration Architecture

### ftsfaf → Agent Communication (via A2A)

**Important**: This shows communication with ANY agent framework (OpenClaw, ADK, etc.) via A2A.

```typescript
// ftsfaf sends A2A JSON-RPC request
POST http://localhost:50001/a2a
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [
        {
          "type": "text",
          "text": "Implement authentication module"
        },
        {
          "type": "data",
          "data": {
            "previous_artifact": {
              "type": "git_branch",
              "remote": "git@github.com:user/repo.git",
              "branch": "feature/step1-output",
              "commit_sha": "abc123"
            }
          }
        }
      ]
    },
    "taskId": "task-001",
    "contextId": "ctx-001"
  },
  "id": 1
}

// Agent (OpenClaw/ADK/any) returns A2A response with artifact
{
  "jsonrpc": "2.0",
  "result": {
    "id": "task-001",
    "contextId": "ctx-001",
    "status": {
      "state": "completed",
      "timestamp": "2024-03-09T19:15:00Z"
    },
    "artifacts": [
      {
        "parts": [
          {
            "type": "data",
            "data": {
              "type": "git_branch",
              "remote": "git@github.com:user/repo.git",
              "branch": "feature/step2-output",
              "commit_sha": "def456",
              "files_changed": ["src/auth.ts", "src/middleware.ts"]
            }
          }
        ]
      }
    ],
    "kind": "task"
  },
  "id": 1
}
```

### Artifact Types (Structured Schemas)

```typescript
// Git branch reference
interface GitBranchArtifact {
  type: 'git_branch';
  remote: string;
  branch: string;
  commit_sha: string;
  files_changed?: string[];
}

// Zip file reference
interface ZipFileArtifact {
  type: 'zip_file';
  path: string;  // Local filesystem path or S3 key
  size_bytes: number;
  checksum: string;
}

// JSON data
interface JsonDataArtifact {
  type: 'json_data';
  data: unknown;
}

// Verification result
interface VerificationArtifact {
  type: 'verification_result';
  passed: boolean;
  issues: string[];
  feedback?: string;
}
```

## Revised Architecture

### Current Spec Alignment

1. **Use A2A Protocol (as originally specified!)**
   -  Add `@a2a-js/sdk` dependency (keep it!)
   -  Use JSON-RPC methods: `message/send`, `message/stream`, `tasks/get`
   -  Discover agents via AgentCard at `/.well-known/agent-card.json`
   -  Each agent is built with ADK but exposes A2A endpoints

2. **Artifact Storage Strategy**
   - SQLite stores **artifact references** (git branches, file paths)
   - Large files stored on filesystem or S3
   - Artifact schema defined with Effect Schema

3. **Simplify Prompt Interpolation**
   - Remove complex `{{variable}}` templating from ftsfaf
   - ADK agents handle their own system prompts internally
   - ftsfaf passes context as structured A2A message parts

4. **Simplified State Management**
   - SQLite tracks run/step status
   - Artifacts stored as JSON references
   - No need for complex prompt rendering

## Implementation Order (Revised)

```
 1. Config schemas (DONE)
 2. Tarjan's algorithm (DONE)
 3. Graph validation (DONE)
 4. Test fixtures (DONE)

 5. Config loading (simplified)
   - Load JSON files from disk
   - Build in-memory maps
   - No env vars, no layers for now

 6. Artifact schemas
   - Define artifact types with Effect Schema
   - Validation functions

 7. SQLite state (minimal)
   - Run/step status tracking
   - Artifact references as JSON
   - No migrations initially

 8. Process infrastructure provider
   - Spawn local ADK agents
   - Health checks
   - Process lifecycle

 9. Synchronous executor (NO BULLMQ)
   - Walk execution order tiers
   - Execute steps sequentially
   - Direct HTTP calls to agents

 10. A2A client (JSON-RPC)
   - Use `@a2a-js/sdk` for protocol handling
   - Implement `message/send` for synchronous tasks
   - Implement `message/stream` for long-running tasks
   - Parse A2A Task responses
   - Store artifact references from Task.artifacts[]

 11. Run feature-dev workflow end-to-end
   - Load fixture configs
   - Start mock ADK agents
   - Execute workflow
   - Verify artifact flow

 12. Express API (minimal)
   - POST /runs to start workflows
   - GET /runs/:id for status

 13. Dashboard (last)
   - Show runs and status
```

## Mock ADK Agents for Testing

We need to create simple mock ADK agents that:
1. Listen on HTTP endpoints (localhost:50001, 50002, 50003)
2. Expose A2A JSON-RPC interface
3. Serve AgentCard at `/.well-known/agent-card.json`
4. Handle A2A `message/send` requests
5. Return A2A Task responses with artifacts
6. Simulate the feature-dev workflow

### Example Mock Agent (TypeScript with A2A)

```typescript
// tests/fixtures/mock-agents/swe.ts
import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(express.json());

// Serve AgentCard for discovery
app.get('/.well-known/agent-card.json', (req, res) => {
  res.json({
    protocolVersion: '1.0',
    name: 'swe-agent',
    description: 'Software engineering agent',
    url: 'http://localhost:50001',
    capabilities: {
      streaming: false,
      pushNotifications: false
    },
    skills: [
      {
        id: 'coding',
        name: 'Code Generation',
        description: 'Implements features and writes code'
      }
    ]
  });
});

// Handle A2A JSON-RPC requests
app.post('/a2a', (req, res) => {
  const { jsonrpc, method, params, id } = req.body;
  
  if (method === 'message/send') {
    const { message, taskId, contextId } = params;
    
    // Simulate code generation
    const response = {
      jsonrpc: '2.0',
      result: {
        id: taskId || uuidv4(),
        contextId: contextId || uuidv4(),
        status: {
          state: 'completed',
          timestamp: new Date().toISOString()
        },
        artifacts: [
          {
            parts: [
              {
                type: 'data',
                data: {
                  type: 'git_branch',
                  remote: 'git@github.com:user/repo.git',
                  branch: `feature/swe-${Date.now()}`,
                  commit_sha: Math.random().toString(36).substring(7),
                  files_changed: ['src/auth.ts', 'src/middleware.ts']
                }
              }
            ]
          }
        ],
        kind: 'task'
      },
      id
    };
    
    res.json(response);
  } else {
    res.status(404).json({
      jsonrpc: '2.0',
      error: {
        code: -32601,
        message: 'Method not found'
      },
      id
    });
  }
});

const PORT = process.env.PORT || 50001;
app.listen(PORT, () => {
  console.log(`Mock SWE agent (A2A) listening on port ${PORT}`);
});
```

## Next Steps

1. **Add artifact schemas** to `src/config/schema.ts`
2. **Create mock ADK agents** in `tests/fixtures/mock-agents/`
3. **Implement config loader** - read JSON, build maps
4. **Implement SQLite setup** - minimal schema for runs/steps/artifacts
5. **Implement process provider** - spawn mock agents
6. **Implement synchronous executor** - walk workflow, call agents
7. **Run end-to-end test** - execute feature-dev workflow

## Questions Resolved

1.  **"google ADK"** = Google Agent Development Kit (for building agents)
2.  **"A2A"** = Agent2Agent Protocol (for agent communication)
3.  **Agent protocol** = A2A JSON-RPC over HTTP (as originally specified!)
4.  **Artifact storage** = A2A artifacts containing structured data (git branches, files)
5.  **State passing** = A2A message parts and task artifacts
6.  **ADK + A2A** = Agents built with ADK expose A2A endpoints (proven pattern from A2A samples!)

## Readiness Assessment

### Are we ready to continue? **YES!**

**What we have:**
-  Solid graph validation foundation
-  Effect schemas for all config types
-  Test fixtures for feature-dev workflow
-  Clear understanding of ADK integration
-  Simplified architecture (no prompt interpolation, no A2A)

**What we need to build:**
-  Config loader (simple JSON reading + AgentCard discovery)
-  Artifact schemas (aligned with A2A Part types)
-  Mock ADK agents exposing A2A endpoints
-  SQLite state tracking (mapping A2A task states)
-  Process provider (spawn ADK agents)
-  Synchronous executor (orchestrate A2A calls)
-  A2A client using `@a2a-js/sdk`

**Estimated time to working MVP:** 8-12 hours

The architecture **aligns with the original spec**:
-  Use A2A protocol (keep `@a2a-js/sdk`)
-  ADK agents expose A2A endpoints
-  Simplified: No BullMQ/Redis initially (synchronous execution)
-  Simplified: Agents handle their own prompts (remove complex interpolation)
-  Local-first (process infrastructure only for MVP)

We can now proceed with confidence!
