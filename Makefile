.PHONY: help test test-integration demo clean install build lint typecheck start stop engine-start engine-stop dashboard-start dashboard-stop

help:
	@echo "ftsfaf - Workflow Orchestration Engine"
	@echo ""
	@echo "Available targets:"
	@echo "  make install          Install dependencies"
	@echo "  make build           Build TypeScript"
	@echo "  make test            Run unit tests"
	@echo "  make test-integration Run integration tests"
	@echo "  make demo            Run full demo (start services + workflow)"
	@echo "  make demo-poem TASK='your poem topic'  Run poem workflow demo"
	@echo "  make start           Start engine + dashboard"
	@echo "  make stop            Stop all services"
	@echo "  make engine-start    Start engine server only"
	@echo "  make engine-stop     Stop engine server"
	@echo "  make dashboard-start Start dashboard only"
	@echo "  make dashboard-stop  Stop dashboard"
	@echo "  make lint            Run linter"
	@echo "  make typecheck       Type check without building"
	@echo "  make clean           Clean build artifacts and tmp folders"

install:
	bun install

build:
	bun run build

test:
	bun test

test-integration:
	bun run test:integration

# Engine server commands
engine-start:
	@echo "Starting workflow engine server..."
	@bun src/cli.ts server . > engine.log 2>&1 &
	@echo "Engine starting on port 4852 (logs: engine.log)"
	@sleep 2
	@echo "Engine started!"

engine-stop:
	@echo "Stopping engine server..."
	@pkill -f "bun.*cli.ts server" || echo "Engine not running"
	@echo "Engine stopped"

# Dashboard commands
dashboard-start:
	@echo "Starting dashboard server..."
	@cd dashboard && bun run server > ../dashboard.log 2>&1 &
	@echo "Dashboard starting on port 9482 (logs: dashboard.log)"
	@sleep 2
	@echo "Dashboard started!"

dashboard-stop:
	@echo "Stopping dashboard..."
	@pkill -f "bun.*dashboard.*server" || echo "Dashboard not running"
	@echo "Dashboard stopped"

# Start/stop full stack
start: engine-start dashboard-start
	@echo ""
	@echo "==================================="
	@echo "ftsfaf stack started!"
	@echo "Engine API: http://localhost:4852"
	@echo "Dashboard:  http://localhost:9482"
	@echo "==================================="

stop: engine-stop dashboard-stop
	@echo "ftsfaf stack stopped"

# Demo commands
demo-poem: start
	@echo ""
	@echo "Running poem workflow demo..."
	@echo "Task: $(TASK)"
	@echo ""
	@sleep 1
	@bun src/cli.ts run . --task "$(TASK)" --workflow poem-workflow --engine-url http://localhost:4852 --wait
	@echo ""
	@echo "Demo complete! View results at http://localhost:9482"

demo: 
	@$(MAKE) demo-poem TASK="a beautiful sunset over the ocean, painted in vibrant colors"

lint:
	bun run lint

typecheck:
	bun run typecheck

clean:
	@echo "Cleaning build artifacts..."
	@rm -rf dist/
	@rm -rf tmp/
	@rm -rf tests/integration/*/congress-browser.db
	@rm -f *.tsbuildinfo
	@echo "Clean complete!"

# Integration tests
test-congress:
	@echo "Running Congress browser integration test (mock mode)..."
	@bun src/cli.ts run tests/integration/congress-browser --mock

test-congress-real:
	@echo "Running Congress browser integration test (real agents)..."
	@bun src/cli.ts run tests/integration/congress-browser
