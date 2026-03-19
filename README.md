# ftsfaf - Fast Task Sequencing For AI Agents

A TypeScript workflow orchestration engine for AI agents using the A2A (Agent-to-Agent) protocol.

## Quick Start

### Installation

```bash
bun install
```

### Running the Demo

The easiest way to get started:

```bash
# Start engine + dashboard and run a demo workflow
just demo

# Or with make
make demo
```

This will:
1. Start the workflow engine API server on port 4852
2. Start the dashboard web UI on port 9482
3. Submit a sample poem workflow task
4. Wait for completion and show results

**View the dashboard:** http://localhost:9482

### Manual Setup

Start the services individually:

```bash
# Start the engine server
just engine-start
# Or: make engine-start

# Start the dashboard
just dashboard-start
# Or: make dashboard-start

# Submit a task
bun src/cli.ts run . --task "write a poem about coding" --engine-url http://localhost:4852 --wait
```

Stop services:

```bash
just stop
# Or: make stop
```

### Docker Compose

Run the entire stack with Docker:

```bash
docker-compose up
```

This exposes:
- **Engine API:** http://localhost:4852
- **Dashboard:** http://localhost:9482

Submit tasks to the engine:

```bash
curl -X POST http://localhost:4852/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": "poem-workflow",
    "input": "write a poem about the ocean"
  }'
```

## Architecture

ftsfaf uses a unified client-server architecture:

```
CLI → Engine API Server (port 4852) → SQLite Database
                ↑
            Dashboard (port 9482)
```

- **Engine API Server**: Executes workflows, manages state, writes to database
- **Dashboard**: Web UI for monitoring (reads via API, no direct DB access)
- **CLI**: Thin client that submits tasks via HTTP

See [docs/architecture-unified.md](docs/architecture-unified.md) for details.

## Commands

### Using Just

```bash
just demo                    # Run full demo
just demo-poem "topic"       # Run poem workflow with custom topic
just start                   # Start engine + dashboard
just stop                    # Stop all services
just engine-start            # Start engine only
just dashboard-dev           # Start dashboard in dev mode
just test                    # Run tests
just clean                   # Clean build artifacts
```

### Using Make

```bash
make demo                    # Run full demo
make demo-poem TASK="topic"  # Run poem workflow with custom topic
make start                   # Start engine + dashboard
make stop                    # Stop all services
make engine-start            # Start engine only
make test                    # Run tests
make clean                   # Clean build artifacts
```

## Configuration

Create or modify `ftsfaf.config.json`:

```json
{
  "server": {
    "port": 4852,
    "host": "0.0.0.0"
  },
  "engine": {
    "url": "http://localhost:4852"
  },
  "agents_dir": "./agents",
  "workflows_dir": "./workflows",
  "skills_dir": "./skills",
  "default_system_prompt": "./prompts/default-system.md",
  "startup_timeout_ms": 30000,
  "health_poll_interval_ms": 1000
}
```

## Project Structure

```
ftsfaf/
├── src/
│   ├── server/          # Engine API server
│   ├── runtime/         # Workflow execution
│   ├── adapters/        # Agent type adapters
│   ├── config/          # Configuration schemas
│   └── cli.ts           # CLI entry point
├── dashboard/           # Web UI
│   ├── src/             # React frontend
│   └── server/          # Dashboard backend
├── agents/              # Agent configurations
├── workflows/           # Workflow definitions
├── skills/              # Skill definitions
└── data/                # SQLite database
```

## API Reference

### Engine API

- `POST /tasks` - Submit a task
- `GET /tasks/:id` - Get task status
- `GET /runs` - List runs
- `GET /runs/:id` - Get run details
- `GET /runs/stats` - Get statistics
- `GET /config/workflows` - List workflows
- `GET /config/agents` - List agents
- `GET /stream` - SSE stream for updates

See [docs/architecture-unified.md](docs/architecture-unified.md) for full API documentation.

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type check
bun run typecheck

# Lint
bun run lint

# Start engine in dev mode
bun --watch src/cli.ts server .

# Start dashboard in dev mode
cd dashboard && bun run dev
```

## License

MIT
