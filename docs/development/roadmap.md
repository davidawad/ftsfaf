# ftsfaf Development Roadmap

## Completed Phases 

### Phase 0: Project Scaffold
**Status:**  Complete

- [x] npm package setup with TypeScript
- [x] ESLint with functional programming rules (eslint-plugin-functional)
- [x] Vitest test framework configured
- [x] All dependencies installed
- [x] TypeScript strict mode compilation working

**Deliverables:**
- `package.json` with all dependencies
- `tsconfig.json` with strict settings
- `.eslintrc.json` with functional rules
- `vitest.config.ts`

---

### Phase 1: Effect Schema for All Config Types
**Status:**  Complete

- [x] Skill schema definition
- [x] Agent schema with all infrastructure types
- [x] Workflow schema with retry/on_fail support
- [x] Task schema
- [x] ftsfaf.config.json schema
- [x] Full TypeScript type inference

**Deliverables:**
- `src/config/schema.ts` - All schemas using Effect Schema
- `tests/config/schema.test.ts` - 8 passing tests

**Key Types:**
- Infrastructure: Kubernetes, Docker, Process, Remote, EC2 (stub)
- Auth: Bearer, Basic, None
- Workflow steps with `depends_on` and `on_fail` support

---

### Phase 2: Tarjan's SCC Algorithm
**Status:**  Complete

- [x] Pure functional implementation
- [x] No side effects, immutable data structures
- [x] Helper functions: `hasCycles()`, `findCycles()`
- [x] Comprehensive test coverage

**Deliverables:**
- `src/graph/tarjan.ts` - Pure algorithm implementation
- `tests/graph/tarjan.test.ts` - 14 passing tests

**Capabilities:**
- Detect all strongly connected components
- Identify cycles in directed graphs
- Handle self-loops, disconnected components, empty graphs

---

### Phase 3: Graph Validation
**Status:**  Complete

- [x] 7-step validation pipeline
- [x] Dead step detection (BFS)
- [x] Cycle detection with bounded retry validation
- [x] Terminal reachability verification
- [x] Condensation graph construction
- [x] Topological sort for execution order
- [x] Skill capacity checking

**Deliverables:**
- `src/graph/validate.ts` - Complete validation logic
- `tests/graph/validate.test.ts` - 10 passing tests

**Validation Steps:**
1. Build adjacency list (forward + back edges)
2. Find unreachable steps
3. Detect cycles via SCC
4. Verify cycles have `max_iterations`
5. Check terminal step reachability
6. Compute execution order tiers
7. Runtime skill capacity verification

---

## Remaining Phases 

### Phase 4: Config Loading as Effect Layers
**Status:**  Not Started

**Objectives:**
- Load and parse JSON config files
- Environment variable interpolation (`${VAR}` resolution)
- Effect Layer-based dependency injection
- Skill reference validation

**Tasks:**
- [ ] Create `src/config/loader.ts`
  - [ ] `loadFtsfafConfig()` - Parse and validate ftsfaf.config.json
  - [ ] `loadSkills()` - Load all `skills/skill-*.json` files
  - [ ] `loadAgents()` - Load all `agents/*.json` files
  - [ ] `loadWorkflows()` - Load all `workflows/*.json` files
  - [ ] Environment variable resolution with error reporting
  
- [ ] Create Effect Layers
  - [ ] `FtsfafConfigLayer` - Global config
  - [ ] `SkillsLayer` - Map of skill ID → Skill
  - [ ] `AgentsLayer` - Map of agent ID → AgentConfig
  - [ ] `WorkflowsLayer` - Map of workflow ID → ValidatedWorkflow

- [ ] Validation
  - [ ] Verify all skill references exist
  - [ ] Verify all agent references in workflows exist
  - [ ] Cross-validate agent skills with workflow requirements

**Deliverables:**
- `src/config/loader.ts`
- `src/config/layers.ts`
- `tests/config/loader.test.ts`

**Example Usage:**
```typescript
import { Effect } from "effect";
import { ConfigLayers } from "./config/layers.js";

const program = Effect.gen(function* (_) {
  const config = yield* _(FtsfafConfig);
  const skills = yield* _(Skills);
  const agents = yield* _(Agents);
  const workflows = yield* _(Workflows);
  // ... use loaded config
});

Effect.runPromise(program.pipe(Effect.provide(ConfigLayers)));
```

---

### Phase 5: SQLite State Management
**Status:**  Not Started

**Note:** Using `sql.js` (WebAssembly SQLite) instead of `better-sqlite3` due to Node 25 C++20 compatibility issues.

**Objectives:**
- Database schema for runs, steps, artifacts
- CRUD operations for runtime state
- Migration system

**Tasks:**
- [ ] Add `sql.js` dependency
- [ ] Create `src/runtime/db/schema.ts`
  - [ ] Define SQL schema (runs, step_executions, artifacts)
  - [ ] Migration runner
  
- [ ] Create `src/runtime/db/operations.ts`
  - [ ] `createRun()` - Insert new run
  - [ ] `updateRunStatus()` - Update run state
  - [ ] `createStepExecution()` - Track step execution
  - [ ] `updateStepExecution()` - Update step state
  - [ ] `saveArtifact()` - Store step output
  - [ ] `getArtifact()` - Retrieve artifact for interpolation
  - [ ] `getRunStatus()` - Query run details

- [ ] Effect integration
  - [ ] `DatabaseLayer` - Connection management
  - [ ] Scoped connection lifecycle

**Schema:**
```sql
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','running','completed','failed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE step_executions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  step_id TEXT NOT NULL,
  iteration INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('pending','running','completed','failed')),
  started_at INTEGER,
  completed_at INTEGER
);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  step_id TEXT NOT NULL,
  iteration INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

**Deliverables:**
- `src/runtime/db/schema.ts`
- `src/runtime/db/operations.ts`
- `src/runtime/db/layer.ts`
- `tests/runtime/db.test.ts`

---

### Phase 6: Prompt Loading and Interpolation
**Status:**  Not Started

**Objectives:**
- Load system prompt markdown files
- Template variable interpolation (`{{variable}}`)
- Context building from task and artifacts

**Tasks:**
- [ ] Create `src/prompts/loader.ts`
  - [ ] `loadSystemPrompt()` - Read .md file
  - [ ] Default prompt fallback
  - [ ] Agent-specific prompt override

- [ ] Create `src/prompts/interpolate.ts`
  - [ ] Parse `{{variable}}` placeholders
  - [ ] Build interpolation context
  - [ ] Render final prompt

**Interpolation Context:**
```typescript
{
  task: {
    id: string,
    input: string,
    workflow: string,
    [key: string]: unknown  // Any other task fields
  },
  artifacts: {
    [stepId: string]: string  // Completed step outputs
  },
  run: {
    id: string
  },
  step: {
    id: string,
    iteration: number
  }
}
```

**Supported Variables:**
- `{{task.input}}` - Main task input
- `{{task.id}}` - Task identifier
- `{{task.*}}` - Any task field
- `{{artifacts.stepId}}` - Output from completed step
- `{{run.id}}` - Current run UUID
- `{{step.id}}` - Current step identifier
- `{{step.iteration}}` - Retry iteration count

**Deliverables:**
- `src/prompts/loader.ts`
- `src/prompts/interpolate.ts`
- `tests/prompts/interpolate.test.ts`

---

### Phase 7: Infrastructure Providers
**Status:**  Not Started

**Objectives:**
- Abstract infrastructure lifecycle
- Kubernetes, Docker, Process, Remote implementations
- EC2 stub with NotImplementedError

**Tasks:**
- [ ] Create `src/infrastructure/types.ts`
  - [ ] `InfrastructureProvider` interface
  - [ ] Lifecycle methods: `start()`, `stop()`, `health()`

- [ ] Create `src/infrastructure/kubernetes.ts`  Priority
  - [ ] Use `@kubernetes/client-node`
  - [ ] Create Job/Pod for agent
  - [ ] Wait for readiness
  - [ ] Stream logs (optional)
  - [ ] Cleanup on completion
  - [ ] ConfigMap for configuration

- [ ] Create `src/infrastructure/docker.ts`
  - [ ] Use `dockerode`
  - [ ] Container lifecycle
  - [ ] Port mapping
  - [ ] Health checks

- [ ] Create `src/infrastructure/process.ts`
  - [ ] `child_process.spawn()`
  - [ ] Environment variable injection
  - [ ] Process monitoring

- [ ] Create `src/infrastructure/remote.ts`
  - [ ] Health check only
  - [ ] No lifecycle management

- [ ] Create `src/infrastructure/ec2.ts`
  - [ ] Stub implementation
  - [ ] Throw `NotImplementedError`

- [ ] Create `src/infrastructure/registry.ts`
  - [ ] Provider factory by type
  - [ ] Instance tracking

**Interface:**
```typescript
interface InfrastructureProvider {
  start(): Effect.Effect<void, InfraError>;
  stop(): Effect.Effect<void, InfraError>;
  health(): Effect.Effect<boolean, InfraError>;
  waitForReady(timeout: number): Effect.Effect<void, InfraError>;
}
```

**Deliverables:**
- `src/infrastructure/types.ts`
- `src/infrastructure/kubernetes.ts`
- `src/infrastructure/docker.ts`
- `src/infrastructure/process.ts`
- `src/infrastructure/remote.ts`
- `src/infrastructure/ec2.ts`
- `src/infrastructure/registry.ts`
- `tests/infrastructure/` - Unit tests for each provider

---

### Phase 8: BullMQ Worker + Dispatcher
**Status:**  Not Started

**Objectives:**
- Job queue for step execution
- Worker process with Effect runtime
- Artifact management
- Retry logic with iteration tracking

**Tasks:**
- [ ] Create `src/runtime/queue.ts`
  - [ ] BullMQ connection setup
  - [ ] Job type definitions
  - [ ] Queue creation

- [ ] Create `src/runtime/worker.ts`
  - [ ] Worker job handler
  - [ ] Step execution pipeline:
    1. Start infrastructure if needed
    2. Wait for agent readiness
    3. Load system prompt
    4. Render user prompt with interpolation
    5. Build A2A message
    6. Send to agent endpoint
    7. Parse response
    8. Save artifact
    9. Update step status
    10. Unblock dependent steps

- [ ] Create `src/runtime/dispatcher.ts`
  - [ ] Enqueue initial steps (no dependencies)
  - [ ] Enqueue steps when dependencies complete
  - [ ] Handle retry on failure

- [ ] Create `src/runtime/a2a.ts`
  - [ ] A2A protocol message builder
  - [ ] HTTP client with auth injection
  - [ ] Response parsing
  - [ ] Error handling

**Job Payload:**
```typescript
interface StepJob {
  runId: string;
  stepId: string;
  iteration: number;
  taskContext: {
    task: Task;
    artifacts: Record<string, string>;
  };
}
```

**Deliverables:**
- `src/runtime/queue.ts`
- `src/runtime/worker.ts`
- `src/runtime/dispatcher.ts`
- `src/runtime/a2a.ts`
- `tests/runtime/worker.test.ts`

---

### Phase 9: Express Server
**Status:**  Not Started

**Objectives:**
- REST API for run management
- Static dashboard for monitoring
- WebSocket for live updates (optional)

**Tasks:**
- [ ] Create `src/server/app.ts`
  - [ ] Express app setup
  - [ ] Middleware (CORS, JSON parsing)
  - [ ] Error handling

- [ ] Create `src/server/routes/runs.ts`
  - [ ] `POST /runs` - Submit task, start workflow
  - [ ] `GET /runs` - List all runs
  - [ ] `GET /runs/:id` - Get run details
  - [ ] `GET /runs/:id/artifacts` - List artifacts

- [ ] Create `src/server/routes/workflows.ts`
  - [ ] `GET /workflows` - List loaded workflows
  - [ ] `GET /workflows/:id` - Get workflow details

- [ ] Create `src/server/routes/agents.ts`
  - [ ] `GET /agents` - List loaded agents
  - [ ] `GET /agents/:id/health` - Check agent health

- [ ] Create `src/server/routes/skills.ts`
  - [ ] `GET /skills` - List all skills

- [ ] Create `src/server/routes/health.ts`
  - [ ] `GET /health` - Service health check

- [ ] Create `src/dashboard/index.html`
  - [ ] Vanilla HTML/CSS/JS
  - [ ] Run list with live polling
  - [ ] Run detail view
  - [ ] Agent status
  - [ ] No framework dependencies

**API Endpoints:**
```
POST   /runs                    # Submit new task
GET    /runs                    # List runs
GET    /runs/:id                # Run details
GET    /runs/:id/artifacts      # Run artifacts
GET    /workflows               # List workflows
GET    /workflows/:id           # Workflow details
GET    /agents                  # List agents
GET    /agents/:id/health       # Agent health
GET    /skills                  # List skills
GET    /health                  # Service health
```

**Deliverables:**
- `src/server/app.ts`
- `src/server/routes/*.ts`
- `src/dashboard/index.html`
- `src/dashboard/styles.css`
- `src/dashboard/app.js`
- `tests/server/api.test.ts`

---

### Phase 10: Startup Sequence + Integration
**Status:**  Not Started

**Objectives:**
- Complete application bootstrap
- Graceful shutdown
- End-to-end integration testing

**Tasks:**
- [ ] Create `src/index.ts`
  - [ ] Load all configurations
  - [ ] Validate all workflows
  - [ ] Check skill capacity
  - [ ] Initialize database
  - [ ] Connect to Redis
  - [ ] Start BullMQ workers
  - [ ] Start Express server
  - [ ] Log startup summary

**Startup Sequence:**
1. Load `ftsfaf.config.json`
2. Resolve environment variables
3. Load all skills from `skills/`
4. Load all agents from `agents/`
5. Validate agent skill references
6. Load all workflows from `workflows/`
7. Validate workflow graphs
8. Check agent/skill capacity for workflows
9. Initialize SQLite database
10. Connect to Redis
11. Start BullMQ workers
12. Start Express server
13. Log: "ftsfaf ready - X workflows, Y agents, Z skills"

**Shutdown:**
1. Stop accepting new requests
2. Drain BullMQ queues
3. Stop workers gracefully
4. Close database connections
5. Close Redis connections
6. Stop Express server

- [ ] Create integration tests
  - [ ] End-to-end workflow execution
  - [ ] Retry logic validation
  - [ ] Artifact flow
  - [ ] API integration

**Deliverables:**
- `src/index.ts`
- `tests/integration/e2e.test.ts`

---

### Phase 11: Sample Kubernetes Workflow
**Status:**  Not Started

**Objectives:**
- Working example with local Kubernetes
- OpenClaw agents as Jobs
- Complete feature-dev workflow

**Tasks:**
- [ ] Create example configs
  - [ ] `skills/skill-planning.json`
  - [ ] `skills/skill-coding.json`
  - [ ] `skills/skill-review.json`
  - [ ] `agents/planner.json` (Kubernetes)
  - [ ] `agents/coder.json` (Kubernetes)
  - [ ] `agents/reviewer.json` (Kubernetes)
  - [ ] `workflows/feature-dev.json`
  - [ ] `prompts/default-system.md`
  - [ ] `prompts/planner-system.md`
  - [ ] `prompts/coder-system.md`

- [ ] Create sample task
  - [ ] `examples/task-auth-module.json`

- [ ] Documentation
  - [ ] README with quickstart
  - [ ] Kubernetes setup guide
  - [ ] Agent configuration guide

**Example Workflow:**
```
plan → implement → review → deploy
          ↑          |
          └──────────┘ (retry on review failure, max 3x)
```

**Deliverables:**
- `skills/` - 3 skill definitions
- `agents/` - 3 agent configs (Kubernetes)
- `workflows/feature-dev.json`
- `prompts/` - System prompts
- `examples/task-auth-module.json`
- `docs/quickstart.md`
- `docs/kubernetes-setup.md`

---

## Testing Strategy

### Unit Tests
- Pure functions (Tarjan, interpolation)
- Schema validation
- Graph validation logic

### Integration Tests
- Config loading pipeline
- Database operations
- Worker job processing

### E2E Tests
- Complete workflow execution
- Retry mechanisms
- API endpoints

### Test Coverage Goals
- Core logic: >90%
- Infrastructure: >70%
- Integration: Key flows covered

---

## Development Environment

### Prerequisites
- Node.js 20+ (avoid 25.x due to better-sqlite3 issues)
- Docker Desktop (for Docker provider)
- Kubernetes (local cluster: Docker Desktop, Minikube, or k3d)
- Redis (via Homebrew or Docker)

### Local Setup
```bash
# Install dependencies
npm install

# Start Redis
brew services start redis
# OR
docker run -d -p 6379:6379 redis:alpine

# Run tests
npm test

# Type check
npm run typecheck

# Build
npm run build

# Start development server
npm run dev
```

---

## Performance Targets

- Workflow validation: <100ms for graphs with <100 nodes
- Step dispatch: <50ms
- API response time: <200ms (p95)
- Support 10+ concurrent workflow runs
- Handle workflows with 50+ steps

---

## Security Considerations

### Current (MVP)
- No inbound auth (localhost only)
- Environment variable injection for secrets
- Agent endpoints can use auth (bearer/basic)

### Future
- API key authentication
- RBAC for multi-tenant
- Encrypted artifact storage
- Audit logging
- Network policies for Kubernetes agents

---

## Monitoring & Observability

### Current
- Basic logging to stdout
- Dashboard polling
- Health endpoints

### Future
- Structured JSON logging
- OpenTelemetry traces
- Metrics export (Prometheus)
- Langfuse integration for LLM observability
- Alerting on failures

---

## Next Immediate Steps

1. **Phase 4: Config Loading** - Get configs reading from disk
2. **Phase 5: SQLite Setup** - State persistence foundation
3. **Phase 7: Kubernetes Provider** - Core infrastructure for your use case
4. **Phase 8: Worker** - Execution engine
5. **Phase 9: API** - External interface
6. **Phase 10-11: Integration** - Tie it all together

Estimated time to MVP: 15-20 hours of focused development.
