# Unified Architecture

## Overview

The ftsfaf system now uses a unified, client-server architecture with three main components:

1. **Workflow Engine API Server** - The core server that executes workflows and manages state
2. **Dashboard Web UI** - A read-only web interface for monitoring workflows
3. **CLI Client** - A thin client that submits tasks to the engine

## Architecture Diagram

```
┌─────────────────────────────────────┐
│  CLI (thin client)                  │
│  - Reads local ftsfaf.config.json   │
│  - POSTs tasks to engine_url        │
│  - Polls/streams results            │
└──────────────┬──────────────────────┘
               │ HTTP
               ▼
┌─────────────────────────────────────┐
│  Workflow Engine API Server         │
│  Port: 4852 (configurable)           │
│  Routes:                             │
│    POST /tasks                       │
│    GET  /tasks/:id                   │
│    GET  /runs                        │
│    GET  /runs/:id                    │
│    GET  /runs/stats                  │
│    GET  /config/workflows            │
│    GET  /config/agents               │
│    GET  /config/skills               │
│    GET  /stream (SSE)                │
│  Logic:                              │
│  - Load configs from disk            │
│  - Execute workflows                 │
│  - Write to SQLite                   │
└──────────────┬──────────────────────┘
               │ Writes
               ▼
         [ftsfaf.sqlite]
               ▲ Query via API
               │
┌──────────────┴──────────────────────┐
│  Dashboard Web UI                   │
│  Port: 9482 (server) + 8383 (dev)   │
│  - Queries Engine API only          │
│  - SSE from Engine for live updates │
│  - No direct DB access              │
└─────────────────────────────────────┘
```

## Benefits

1. **Single source of truth** - Only the Engine writes to the database
2. **Dashboard always in sync** - Reads from Engine API, no stale data
3. **CLI becomes thin client** - Just HTTP calls, no in-process execution
4. **Proper separation** - Engine = business logic, Dashboard = presentation
5. **Docker Compose ready** - Two services with shared volume for SQLite

## Usage

### Starting the Engine Server

```bash
# From project root
bun run src/cli.ts server .

# Or with custom config directory
bun run src/cli.ts server /path/to/config
```

The server will:
- Load configuration from ftsfaf.config.json
- Initialize the SQLite database
- Start the HTTP API on the configured port (default: 4852)
- Bootstrap adapters for agent types

### Submitting Tasks via CLI

```bash
# Submit a task (returns immediately)
bun run src/cli.ts run . --task "write a poem about coding"

# Submit and wait for completion
bun run src/cli.ts run . --task "write a poem about coding" --wait

# Specify workflow
bun run src/cli.ts run . --task "write a poem" --workflow poem-workflow

# Use custom engine URL
bun run src/cli.ts run . --task "write a poem" --engine-url http://remote-server:4852
```

### Running the Dashboard

```bash
# Development mode (with hot reload)
cd dashboard && bun run dev

# Production mode
cd dashboard && bun run build && bun run server
```

The dashboard will connect to the engine at the URL specified in `ENGINE_URL` environment variable (default: `http://localhost:4852`).

## Configuration

### ftsfaf.config.json

```json
{
  "server": {
    "port": 4852,
    "host": "0.0.0.0"
  },
  "engine": {
    "url": "http://localhost:4852"
  },
  "redis": {
    "host": "127.0.0.1",
    "port": 6379
  },
  "sqlite": {
    "path": "./ftsfaf.db"
  },
  "agents_dir": "./agents",
  "workflows_dir": "./workflows",
  "skills_dir": "./skills",
  "default_system_prompt": "./prompts/default-system.md",
  "startup_timeout_ms": 30000,
  "health_poll_interval_ms": 1000
}
```

- `server.port`: Port for the engine API server
- `server.host`: Host to bind to (default: 0.0.0.0)
- `engine.url`: URL where the engine is running (for CLI client mode)

## Docker Compose

Run the entire stack with Docker Compose:

```bash
docker-compose up
```

This will start:
- **engine** on port 4852
- **dashboard** on port 9482

Both containers share the same `data` volume for the SQLite database.

## API Reference

### Engine API

#### POST /tasks
Submit a new task for execution.

**Request:**
```json
{
  "workflow": "poem-workflow",
  "input": "write a poem about sunsets",
  "metadata": {
    "source": "cli",
    "priority": "high"
  }
}
```

**Response (202 Accepted):**
```json
{
  "task_id": "task-123",
  "status": "submitted",
  "message": "Task queued for execution"
}
```

#### GET /tasks/:id
Get task status and associated run.

**Response:**
```json
{
  "task_id": "task-123",
  "run_id": "run-456",
  "workflow_id": "poem-workflow",
  "status": "completed",
  "created_at": 1234567890,
  "updated_at": 1234567900
}
```

#### GET /runs
List recent runs.

**Query Parameters:**
- `limit`: Maximum number of runs to return (default: 20)

**Response:**
```json
[
  {
    "id": "run-456",
    "workflow_id": "poem-workflow",
    "task_id": "task-123",
    "status": "completed",
    "final_output": "...",
    "created_at": 1234567890,
    "updated_at": 1234567900
  }
]
```

#### GET /runs/:id
Get detailed information about a run.

**Response:**
```json
{
  "run": { /* run object */ },
  "steps": [ /* step executions */ ],
  "artifacts": [ /* artifacts */ ]
}
```

#### GET /runs/stats
Get overall statistics.

**Response:**
```json
{
  "totalRuns": 42,
  "activeRuns": 3,
  "completedRuns": 35,
  "failedRuns": 4
}
```

#### GET /config/workflows
List all available workflows.

#### GET /config/agents
List all configured agents.

#### GET /config/skills
List all available skills.

#### GET /stream
Server-Sent Events stream for live updates.

## Migration from Direct Execution

Previously, the CLI executed workflows in-process. Now it submits tasks to the engine API. To maintain backward compatibility, the old `run` command still works but executes in-process.

The new flow is:
1. Start the engine server: `ftsfaf server .`
2. Submit tasks: `ftsfaf run . --task "..." --engine-url http://localhost:4852`
3. Monitor via dashboard: `http://localhost:9482`

## Troubleshooting

### Engine not responding
- Check if the engine is running: `curl http://localhost:4852/health`
- Verify the port in ftsfaf.config.json matches
- Check logs for errors

### Dashboard shows no data
- Ensure ENGINE_URL environment variable points to the correct engine
- Check if engine is accessible: `curl http://localhost:4852/runs`
- Verify CORS settings allow dashboard origin

### Database issues
- The engine creates the database automatically on first run
- Database location: `data/ftsfaf.sqlite` (from config)
- Only the engine writes to the database
- Dashboard reads via API only
