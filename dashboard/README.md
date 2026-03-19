# ftsfaf Dashboard

Real-time dashboard for visualizing workflow execution.

## Features

- 📊 **Statistics**: View total workflows, runs, active/completed/failed jobs
- 📋 **Kanban Board**: Visualize workflow steps as columns with jobs moving through them
- 👷 **Worker Avatars**: Animated avatars showing worker status (idle, working, completed, failed)
- 📡 **Real-time Updates**: Server-Sent Events (SSE) for live data streaming
- 🎨 **Minimalist UI**: Clean TailwindCSS design

## Architecture

**Backend**: Hono server (port 9482)
- API routes for stats, workflows, agents, runs
- SSE endpoint for real-time updates
- Read-only SQLite database access

**Frontend**: React + Vite (dev port 3000)
- TypeScript components
- TailwindCSS styling
- Custom hooks for data fetching and SSE

## Development

```bash
# Start both server and client in dev mode
cd dashboard && bun run dev

# Or start separately:
bun run server:dev  # Backend on port 9482
bun run client:dev  # Frontend on port 3000 (proxies to 9482)
```

## Production

```bash
# Build frontend
bun run build

# Start server (serves built frontend)
bun run server

# Or use justfile from parent directory:
just dashboard           # Start in foreground
just dashboard-start     # Start in background (daemon)
just dashboard-stop      # Stop daemon
just dashboard-status    # Check if running
```

## Access

- **Development**: http://localhost:3000 (Vite dev server)
- **Production**: http://localhost:9482 (Hono server)
- **API**: http://localhost:9482/api
- **SSE**: http://localhost:9482/api/stream

## Database

Dashboard reads from `../data/ftsfaf.sqlite` (managed by ftsfaf engine).
Database is refreshed every 500ms for SSE updates.

## Components

- **StatCard**: Statistics display card
- **WorkerAvatar**: Animated worker with status indicators
- **JobCard**: Run card in Kanban columns
- **WorkerColumn**: Step column containing job cards
- **WorkflowKanban**: Full Kanban board with all steps
- **Dashboard**: Main page with stats + Kanban
- **Settings**: Placeholder for future features

## Future Features

- Upload workflow files
- Create/edit agents
- Trigger workflows from UI
- Streaming AI output (character-by-character)
- Advanced animations and transitions
