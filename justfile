default:
    @just --list

# Install dependencies
install:
    bun install

# Build TypeScript
build:
    bun run build

# Run unit tests
test:
    bun test

# Run integration tests
test-integration:
    bun run test:integration

# Start the engine server in the background
engine-start:
    @echo "Starting workflow engine server..."
    @bun src/cli.ts server . > engine.log 2>&1 &
    @echo "Engine starting on port 4852 (logs: engine.log)"
    @sleep 2
    @echo "Engine started!"

# Stop the engine server
engine-stop:
    @echo "Stopping engine server..."
    @pkill -f "bun.*cli.ts server" || echo "Engine not running"
    @echo "Engine stopped"

# Check engine status
engine-status:
    @curl -s http://localhost:4852/health > /dev/null && echo "Engine is running on port 4852" || echo "Engine is not running"

# Start full stack (engine + dashboard)
start: engine-start dashboard-start
    @echo ""
    @echo "==================================="
    @echo "ftsfaf stack started!"
    @echo "Engine API: http://localhost:4852"
    @echo "Dashboard:  http://localhost:9482"
    @echo "==================================="

# Stop full stack
stop: engine-stop dashboard-stop
    @echo "ftsfaf stack stopped"

# Run poem workflow demo (nullclaw + zeroclaw)
demo-poem task="a sunset over the ocean": start
    @echo ""
    @echo "Running poem workflow demo..."
    @echo "Task: {{task}}"
    @echo ""
    @sleep 1
    @bun src/cli.ts run . --task "{{task}}" --workflow poem-workflow --engine-url http://localhost:4852 --wait
    @echo ""
    @echo "Demo complete! View results at http://localhost:9482"

# Complete demo - start everything and run a workflow
demo: 
    @just demo-poem "a beautiful sunset over the ocean, painted in vibrant colors"

# List available demos
demos:
    @echo "Available demos:"
    @echo "  just demo                         - Full demo (start services + run poem workflow)"
    @echo "  just demo-poem 'your poem topic'  - Poem workflow (nullclaw + zeroclaw)"
    @echo "  just demo-poem                    - Poem workflow (default task)"
    @echo "  just start                        - Start engine + dashboard"
    @echo "  just stop                         - Stop all services"

# Run linter
lint:
    bun run lint

# Type check without building
typecheck:
    bun run typecheck

# Clean build artifacts and tmp folders
clean:
    @echo "Cleaning build artifacts..."
    @rm -rf dist/
    @rm -rf tmp/
    @rm -rf tests/integration/*/congress-browser.db
    @rm -f *.tsbuildinfo
    @echo "Clean complete!"

# Dashboard commands
dashboard-dev:
    @echo "Starting dashboard in development mode..."
    cd dashboard && bun run dev

dashboard-build:
    @echo "Building dashboard..."
    cd dashboard && bun run build

dashboard:
    @echo "Starting dashboard server..."
    cd dashboard && bun run server

dashboard-start:
    @echo "Starting dashboard in background..."
    cd dashboard && bun run server > /dev/null 2>&1 &
    @echo "Dashboard started at http://localhost:9482"

dashboard-stop:
    @echo "Stopping dashboard..."
    @pkill -f "bun.*dashboard.*server" || echo "Dashboard not running"

dashboard-status:
    @lsof -ti:9482 && echo "Dashboard is running on port 9482" || echo "Dashboard is not running"

# Integration tests
test-congress:
    @echo "Running Congress browser integration test (mock mode)..."
    @bun src/cli.ts run tests/integration/congress-browser --mock

test-congress-real:
    @echo "Running Congress browser integration test (real agents)..."
    @bun src/cli.ts run tests/integration/congress-browser

# Run all checks (lint + typecheck + test)
check: lint typecheck test
    @echo "All checks passed!"
