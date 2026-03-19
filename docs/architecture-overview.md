# ftsfaf Architecture Overview

## The Correct Understanding

**ftsfaf is an A2A-based workflow orchestrator** that can work with agents built on **ANY framework**, not just ADK.

### The Stack:

```
┌─────────────────────────────────────────────┐
│              ftsfaf                         │
│      (A2A Workflow Orchestrator)            │
│  • Graph validation                         │
│  • Multi-step workflows                     │
│  • Artifact routing                         │
│  • State tracking (SQLite)                  │
│  • Retry logic                              │
└──────────────────┬──────────────────────────┘
                   │
          A2A Protocol (JSON-RPC over HTTP)
                   │
     ┌─────────────┴──────────────┬──────────────┬─────────────┐
     │                            │              │             │
┌────▼─────┐  ┌────────────┐  ┌──▼─────┐  ┌────▼────┐  ┌─────▼────┐
│ OpenClaw │  │ Google ADK │  │LangGraph│  │ CrewAI  │  │  Custom  │
│  Agent   │  │   Agent    │  │  Agent  │  │  Agent  │  │  Agent   │
└────┬─────┘  └──────┬─────┘  └────┬────┘  └────┬────┘  └─────┬────┘
     │               │               │            │             │
     └───────────────┴───────────────┴────────────┴─────────────┘
           Each agent framework needs an A2A adapter
              to expose /.well-known/agent-card.json
                 and handle A2A JSON-RPC methods
```

## Key Points

### 1. ftsfaf is Framework-Agnostic

ftsfaf **only cares about A2A protocol**. It doesn't know or care if an agent is built with:
- OpenClaw (our primary framework)
- Google ADK
- LangGraph
- CrewAI
- Custom implementations

As long as the agent exposes A2A endpoints, ftsfaf can orchestrate it.

### 2. A2A is the Common Language

A2A provides the standard interface:
- **Discovery**: `GET /.well-known/agent-card.json`
- **Communication**: `POST /a2a` with JSON-RPC methods
- **Task Management**: `message/send`, `message/stream`, `tasks/get`
- **Artifacts**: Standard Part types (text, file, data)

### 3. Each Framework Needs an A2A Adapter

For each agent framework, we need to build or use an adapter that:
1. Wraps the native agent
2. Exposes A2A JSON-RPC endpoints
3. Translates A2A messages to framework-native format
4. Translates framework responses back to A2A format

Example:
```typescript
// OpenClaw agent
const openclawAgent = new OpenClawAgent({...});

// Wrap with A2A adapter
const a2aAdapter = new OpenClawA2AAdapter(openclawAgent);

// Expose HTTP server
const server = express();
server.get('/.well-known/agent-card.json', a2aAdapter.getAgentCard);
server.post('/a2a', a2aAdapter.handleJsonRpc);
server.listen(50001);
```

## OpenClaw as Primary Framework

### What is OpenClaw?

OpenClaw is an agent framework (needs research/documentation) that we'll use to build our primary agents:
- SWE agent (code generation)
- Verifier agent (code review)
- Tester agent (test generation)

### A2A Adapter for OpenClaw

**Priority #1**: Build an A2A adapter for OpenClaw agents.

This adapter needs to:
1. Accept A2A `message/send` requests
2. Convert A2A messages to OpenClaw's input format
3. Execute the OpenClaw agent
4. Convert OpenClaw output to A2A artifacts
5. Return A2A Task response

```typescript
// src/adapters/openclaw-adapter.ts
export class OpenClawA2AAdapter {
  constructor(private openclawAgent: OpenClawAgent) {}
  
  async handleMessageSend(params: MessageSendParams): Promise<Task> {
    // Extract user message from A2A format
    const userMessage = extractTextFromParts(params.message.parts);
    const contextData = extractDataFromParts(params.message.parts);
    
    // Call OpenClaw agent
    const result = await this.openclawAgent.execute({
      input: userMessage,
      context: contextData
    });
    
    // Convert to A2A Task with artifacts
    return {
      id: params.taskId || uuidv4(),
      contextId: params.contextId || uuidv4(),
      status: {
        state: 'completed',
        timestamp: new Date().toISOString()
      },
      artifacts: [
        {
          parts: [
            {
              type: 'data',
              data: result.output // OpenClaw's structured output
            }
          ]
        }
      ],
      kind: 'task'
    };
  }
  
  getAgentCard(): AgentCard {
    return {
      protocolVersion: '1.0',
      name: this.openclawAgent.name,
      description: this.openclawAgent.description,
      url: this.openclawAgent.url,
      capabilities: {
        streaming: false,
        pushNotifications: false
      },
      skills: this.openclawAgent.skills.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description
      }))
    };
  }
}
```

## Documentation Structure

### docs/adk/
**Purpose**: Reference for understanding how ADK agents can expose A2A endpoints (one example framework).
**Not**: The primary framework we're using.

### docs/a2a/
**Purpose**: The core protocol that ftsfaf uses to communicate with ALL agents, regardless of framework.

### docs/openclaw/
**TODO**: Download OpenClaw documentation and understand its API.
**Priority**: HIGH - this is our primary agent framework.

## Revised Implementation Order

```
 1. Config schemas (DONE)
 2. Tarjan's algorithm (DONE)
 3. Graph validation (DONE)
 4. Test fixtures (DONE)
 5. A2A SDK installed (DONE)

 6. Research OpenClaw
   - Download OpenClaw documentation
   - Understand OpenClaw agent API
   - Identify how to build/run OpenClaw agents

 7. Build OpenClaw A2A Adapter
   - Wrap OpenClaw agents with A2A interface
   - Implement AgentCard generation
   - Implement message/send handler
   - Handle artifact conversion

 8. Create Mock OpenClaw Agents
   - SWE agent (code generation)
   - Verifier agent (code review)
   - Tester agent (test generation)
   - Each wrapped with A2A adapter

 9. Config loading
   - Load workflow/agent/skill JSON
   - Discover agents via AgentCard

 10. A2A Client
   - Use @a2a-js/sdk
   - Discover agents
   - Send messages
   - Receive tasks/artifacts

 11. SQLite state tracking
   - Map A2A task states to runs/steps
   - Store artifact references

 12. Process infrastructure
   - Spawn OpenClaw agents (wrapped with A2A adapter)
   - Health checks

 13. Synchronous executor
   - Walk workflow graph
   - Call agents via A2A
   - Route artifacts

 14. Run feature-dev workflow E2E
   - Start mock OpenClaw agents
   - Execute workflow
   - Verify artifact flow

 15. Express API
 16. Dashboard
```

## Why This Architecture?

### Framework Independence
ftsfaf can orchestrate agents built on **any framework**:
- Start with OpenClaw agents
- Add ADK agents later
- Mix LangGraph and CrewAI agents
- Use custom agents

All without changing ftsfaf's core code!

### Standard Protocol
A2A provides:
- Vendor-neutral communication
- Standard discovery mechanism
- Well-defined task lifecycle
- Rich artifact types
- Streaming support

### Adapter Pattern
Each framework gets its own adapter:
- OpenClaw ↔ A2A adapter
- ADK ↔ A2A adapter (already exists in A2A samples!)
- LangGraph ↔ A2A adapter (already exists in A2A samples!)
- CrewAI ↔ A2A adapter (already exists in A2A samples!)

ftsfaf just needs to speak A2A!

## Next Critical Steps

1. **Find OpenClaw documentation** - Do you have a URL or is it openclaw.ai?
2. **Understand OpenClaw's agent API** - How to create/run agents
3. **Build OpenClaw A2A adapter** - This is the bridge we need
4. **Create example OpenClaw agents** - SWE, Verifier, Tester
5. **Test A2A communication** - ftsfaf → A2A → OpenClaw adapter → OpenClaw agent

The ADK documentation is useful as a **reference example** of how one framework (Google's) can expose A2A endpoints, but **OpenClaw is our primary framework**.
