# ftsfaf — Engineering Spec

## System Prompt

You are an expert TypeScript engineer. You write clean, minimal, well-typed code. You do not over-engineer. You ask clarifying questions before writing code when requirements are ambiguous.

---

## Overview

Build a TypeScript orchestration service called **ftsfaf**. It is a workflow engine that coordinates tasks across multiple AI agents using the A2A protocol (Linux Foundation, Apache-2.0). ftsfaf is workflow-agnostic — it does not know or care what any agent does internally. It parses config, validates workflow graphs, manages run state, dispatches work to agents in dependency order, and exposes a web dashboard + REST API for monitoring.

### What this is NOT

- Not an agent framework. Agents are opaque A2A servers.
- Not a model router. Models are configured inside each agent.
- Not a message broker. No Kafka, no pub/sub. Point-to-point HTTP via A2A JSON-RPC.
- Not responsible for agent-to-agent communication directly. Inter-agent comms flow through agentgateway (see Transport section).

---

## Mental Model

A **workflow** is a pipeline. Think of it like a medical intake process: "patent intake → triage → doctor visit → second-opinion → pharmacist check → discharge → billing". The pipeline is defined once in a workflow file.

A **task** is a JSON file submitted to a workflow run. It is the patient: "this is Deb, she has these symptoms." The task supplies the input context. Each agent in the pipeline sees that context and applies its own role/perspective to it, as defined by its system prompt.

A **run** is one execution of a workflow with one task as input. One task per run. One workflow per run. If one workflow's output needs to feed another workflow, that's just one bigger workflow.

---

## Stack

- TypeScript, strict mode
- `@a2a-js/sdk` — official A2A protocol SDK (github.com/a2aproject/a2a-js)
- `bullmq` + Redis — job queue, backpressure, retry scheduling
- `better-sqlite3` — run state, artifact references, iteration tracking (sync API is intentional; SQLite is fast enough for this workload)
- `zod` — all config schema validation
- `dockerode` — Docker infrastructure provider
- `@aws-sdk/client-ec2` — EC2 infrastructure provider (stub only for now)
- `vitest` — tests
- `express` — web dashboard API server

Config files are strict JSON. Parse with `JSON.parse`. No comments, no trailing commas.

---

## Transport: agentgateway

ftsfaf does not implement the A2A wire protocol itself. Instead, it sends A2A `tasks/send` calls to the endpoint defined in each agent config. By default that endpoint is expected to be an **agentgateway** instance (https://agentgateway.dev) sitting in front of the agent. agentgateway is an open-source Rust proxy that handles A2A and MCP protocol routing, auth, observability, and session management.

**agentgateway is optional and per-agent.** Some agents may be contacted directly without a proxy in front. The agent config's `endpoint` field is always "what ftsfaf talks to" — ftsfaf does not know or care what is behind it.

```
ftsfaf worker
  → POST tasks/send to agent.endpoint  (agentgateway, or direct agent address)
  → agentgateway proxies to actual agent (if present)
  → agent processes task, streams or returns A2A response
  → ftsfaf receives artifact, writes to SQLite, unblocks downstream steps
```

To use agentgateway locally: install via `curl https://raw.githubusercontent.com/agentgateway/agentgateway/refs/heads/main/common/scripts/get-agentgateway | bash`, configure it with a `config.yaml`, run `agentgateway -f config.yaml`. ftsfaf just needs the resulting endpoint address.

---

## ftsfaf.config.json

Global service configuration. Lives at the project root. Most users should never need to touch this — defaults work out of the box for local development.

```json
{
  "server": {
    "port": 4852
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

All paths are resolved relative to the location of `ftsfaf.config.json`. Redis and SQLite are expected to be running locally (use `brew services start redis` for local dev). Fail startup with a clear error if Redis or SQLite cannot be reached.

---

## Config Files

### Skills (`skills/skill-*.json`)

Each skill is its own file with a `skill-` prefix (e.g. `skills/skill-coding.json`, `skills/skill-review.json`). Skills map directly to the A2A skill abstraction.

```json
{
  "id": "code-generation",
  "name": "Code Generation",
  "description": "Generates TypeScript/JavaScript code from a specification.",
  "tags": ["coding", "typescript"],
  "examples": ["Write a REST API endpoint", "Implement a binary search function"]
}
```

Fields map 1:1 to the A2A Agent Card skill schema. Any agent can reference any skill by its `id`.

---

### Agent definition (`agents/*.json`)

Each agent definition describes one agent: where it lives, how to contact it, how to authenticate, how to start it if not remote, and which skills it offers.

**`endpoint`** is always "what ftsfaf sends A2A messages to" — either a direct agent address or an agentgateway address. ftsfaf does not distinguish.

**`system_prompt`** is optional. If provided, it overrides the global default system prompt (`default_system_prompt` in ftsfaf.config.json) for this agent. Value is a path to a `.md` file, resolved relative to `ftsfaf.config.json`.

**`proxy`** is optional. When present, documents that agentgateway (or another proxy) is in front of this agent. This field is informational for operators — ftsfaf always sends to `endpoint` regardless.

```json
{
  "id": "coder",
  "endpoint": "http://localhost:15000",
  "system_prompt": "./prompts/coder-system.md",
  "proxy": {
    "type": "agentgateway",
    "note": "agentgateway running on port 15000, forwarding to agent on 41241"
  },
  "auth": {
    "type": "bearer",
    "token": "${CODER_API_KEY}"
  },
  "infrastructure": {
    "type": "docker",
    "image": "my-openclaw-agent:latest",
    "port": 41241,
    "env": {
      "MODEL_NAME": "openai/gpt-4o"
    }
  },
  "skills": ["code-generation", "code-review"]
}
```

Skills are referenced by ID only. The full skill definition lives in `skills/skill-{id}.json`. Fail startup if any referenced skill file does not exist.

**Remote HTTPS agent (no local startup):**
```json
{
  "id": "reviewer",
  "endpoint": "https://my-reviewer.example.com",
  "auth": {
    "type": "bearer",
    "token": "${REVIEWER_API_KEY}"
  },
  "infrastructure": {
    "type": "remote",
    "health_check_path": "/health"
  },
  "skills": ["code-review"]
}
```

**Local process agent:**
```json
{
  "id": "planner",
  "endpoint": "http://localhost:55210",
  "system_prompt": "./prompts/planner-system.md",
  "auth": {
    "type": "none"
  },
  "infrastructure": {
    "type": "process",
    "command": "node dist/planner/index.js",
    "cwd": "./agents/planner",
    "env": {
      "PORT": "55210"
    }
  },
  "skills": ["task-planning"]
}
```

### Infrastructure types

| Type | Behavior |
|------|----------|
| `docker` | Start container via dockerode. Addressable at `endpoint` once running. |
| `process` | Spawn local process via `child_process`. Runs `command` in `cwd` with `env` merged into `process.env`. |
| `ec2` | **Stub only.** Throws `NotImplementedError`. Defined in `infrastructure/ec2.ts` with same interface as other providers. |
| `remote` | No startup. Assumed always running. Health-check only. |

**For `remote`**: after config load, verify reachability via `health_check_path` (default `/health`).
**For all others**: after starting the process/container, poll `GET /.well-known/agent.json` until it responds 200 or until `startup_timeout_ms` is reached. Validate the returned A2A Agent Card lists every skill ID declared in the agent definition. Reject startup if any declared skill is missing from the Agent Card.

### Auth types

| Type | Behavior |
|------|----------|
| `bearer` | Inject `Authorization: Bearer <token>` on all outbound A2A calls |
| `basic` | Inject `Authorization: Basic <base64(user:pass)>` on all outbound A2A calls |
| `none` | No auth header injected |

All `${ENV_VAR}` references in any config field are resolved from `process.env` at startup. Fail startup with a clear error listing every missing env var if any are unresolved.

---

### Workflow definition (`workflows/*.json`)

A workflow defines the pipeline: which agents run, in what order, with what dependencies.

```json
{
  "id": "feature-dev",
  "name": "Feature Development Workflow",
  "steps": [
    {
      "id": "plan",
      "agent": "planner",
      "skill": "task-planning",
      "user_prompt": "Analyze the following task and produce a detailed implementation plan:\n\n{{task.input}}",
      "depends_on": []
    },
    {
      "id": "implement",
      "agent": "coder",
      "skill": "code-generation",
      "user_prompt": "Implement the following plan:\n\n{{artifacts.plan}}\n\nOriginal task:\n{{task.input}}",
      "depends_on": ["plan"]
    },
    {
      "id": "review",
      "agent": "reviewer",
      "skill": "code-review",
      "user_prompt": "Review the following implementation:\n\n{{artifacts.implement}}\n\nOriginal task:\n{{task.input}}",
      "depends_on": ["implement"],
      "on_fail": {
        "route_to": "implement",
        "max_iterations": 3,
        "inject_artifact": "review_feedback"
      }
    }
  ]
}
```

**Step fields:**

- `agent` — references an agent by its `id` in `agents/*.json`
- `skill` — references a skill by its `id` in `skills/skill-*.json`. The named agent must declare this skill.
- `user_prompt` — the user-turn message sent to this agent. Supports `{{variable}}` interpolation (see Prompt Interpolation below). This is defined in the workflow file, not the agent config.
- `depends_on` — step IDs that must complete successfully before this step runs. Empty array = start node. Steps with no dependents = terminal nodes. Multiple steps with empty `depends_on` run in parallel.
- `on_fail.route_to` — on step failure, re-route to this step ID. Creates an intentional bounded back-edge. `max_iterations` is required when this is set.
- `on_fail.inject_artifact` — the failure artifact key injected into the re-routed step's interpolation context as `{{artifacts.review_feedback}}` (or whatever the key is named).

---

## Prompt Interpolation

Every step's `user_prompt` field supports `{{variable}}` placeholders. Before dispatching a step, ftsfaf renders the prompt by interpolating the following context:

| Variable | Value |
|----------|-------|
| `{{task.input}}` | The raw input string from the task JSON file submitted to this run |
| `{{task.id}}` | The task file's `id` field |
| `{{task.*}}` | Any top-level field from the task JSON |
| `{{artifacts.<step_id>}}` | The text content of the artifact produced by a completed step with that ID. Only available if that step is in `depends_on` for the current step. |
| `{{run.id}}` | The current run's UUID |
| `{{step.id}}` | The current step's ID |
| `{{step.iteration}}` | The current retry iteration count (0 on first attempt) |

**System prompt layering:**

1. Agent's `system_prompt` file (if defined in agent config), otherwise the global `default_system_prompt` file.
2. Step's rendered `user_prompt` string.

These are sent as the A2A message to the agent: system prompt as the system instruction, user prompt as the user message content. The A2A SDK handles wire format.

**On retry with `inject_artifact`:** the failure artifact is made available as `{{artifacts.<inject_artifact_key>}}` in the re-routed step's context. The re-routed step's `user_prompt` should reference it explicitly if the author wants the agent to see it.

---

## Task file format

A task is a JSON file submitted to start a workflow run.

```json
{
  "id": "task-001",
  "workflow": "feature-dev",
  "input": "Build a user authentication module with JWT support and refresh tokens.",
  "metadata": {
    "requestedBy": "alice",
    "priority": "high"
  }
}
```

- `workflow` — must match a workflow `id` in `workflows/*.json`
- `input` — the primary user-facing input string, available as `{{task.input}}`
- Any other top-level field is available as `{{task.<field>}}`

Tasks are submitted via `POST /runs` with the task JSON as the request body (see API section).

---

## Graph Validation

Runs at config load time, before any agents start. Implemented in `src/graph/`. Each check throws a descriptive `WorkflowValidationError` on failure.

Also runs at workflow runtime as a pre-flight check: validates that every agent referenced in the workflow is loaded, and that each agent declares the skill required by the step that references it.

### Step 1 — Build adjacency list

Include both `depends_on` forward edges and `on_fail.route_to` back-edges in a single adjacency list.

### Step 2 — Dead step detection

BFS/DFS from all start nodes (steps with empty `depends_on`). Any unreached step is a config bug.

Error: `Step '{id}' is unreachable from any start node.`

### Step 3 — SCC analysis

Run Tarjan's algorithm on the full graph. Any SCC with more than one node is a cycle. Implement in `src/graph/tarjan.ts` as a pure function — takes an adjacency list, returns a list of SCCs. No dependencies on the rest of the codebase. Unit test thoroughly with known graph fixtures before using it anywhere else.

### Step 4 — Bounded cycle validation

Every back-edge (from `on_fail.route_to`) within an SCC must have `max_iterations` set.

Error: `Cycle involving step '{id}' has no max_iterations bound. All cycles must be bounded.`

### Step 5 — Terminal reachability

At least one terminal step must exist and be reachable from every start node.

Error: `Workflow has no reachable terminal step.`

### Step 6 — Condensation topo-sort

Collapse each SCC into a single node. Topo-sort the resulting DAG. Store as `executionOrder: string[][]` on the validated workflow object — each inner array is a tier of steps that can execute in parallel.

### Step 7 — Runtime skill capacity check (pre-flight)

For every step in the workflow, verify the named agent is loaded and its `skills` array includes the step's `skill` ID.

Error: `Agent '{agent_id}' does not declare skill '{skill_id}' required by step '{step_id}'.`

### Exported interface

```ts
validateWorkflow(raw: unknown): ValidatedWorkflow
// Throws WorkflowValidationError on any failure.
// Returns typed ValidatedWorkflow on success.

checkSkillCapacity(workflow: ValidatedWorkflow, agents: AgentConfig[]): void
// Throws WorkflowValidationError if any step's agent/skill pairing is invalid.
```

---

## Runtime

### SQLite schema

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

### Startup sequence

1. Load and parse `ftsfaf.config.json`. Apply defaults for any missing optional fields.
2. Resolve all `${ENV_VAR}` tokens across all config files. Fail with a list of every missing var.
3. Load and validate all `skills/skill-*.json` files.
4. Load and validate all `agents/*.json` files. Verify all referenced skill IDs exist.
5. Load and validate all `workflows/*.json` files. Run graph validation (steps 1–6) on each.
6. Verify Redis is reachable. Verify SQLite file is writable (create if not exists, run migrations).
7. For each agent by infrastructure type:
   - `remote`: hit `health_check_path`, warn if unreachable but do not abort.
   - `docker` / `process`: validate sufficient config is present to start. Do not start yet — start on first run that needs them.
   - `ec2`: throw `NotImplementedError`.
8. Start BullMQ workers.
9. Start Express web server on configured port.
10. Log "ftsfaf ready" with loaded counts: N workflows, M agents, K skills.

### Worker behavior (BullMQ)

1. **Dequeue step job** — job payload contains `{ runId, stepId, iteration, taskContext }`
2. **Start infrastructure if needed** — if agent's infra type is `docker` or `process` and it is not yet running, start it now. Poll `/.well-known/agent.json` until healthy or timeout.
3. **Render prompts** — resolve system prompt (agent config or default). Interpolate `user_prompt` with task context + prior artifacts.
4. **Build A2A message** — construct `tasks/send` payload using `@a2a-js/sdk`. System prompt as system instruction, rendered user prompt as user message.
5. **Send to agent endpoint** — POST to `agent.endpoint` with auth header injected. Await response (A2A streaming or synchronous — use whatever the SDK makes easiest).
6. **On success** — extract artifact text from A2A response. Write to `artifacts` table. Update `step_executions` status to `completed`. Find all steps now unblocked (all `depends_on` satisfied). Enqueue them simultaneously.
7. **On failure** — check `on_fail`. If `route_to` is set and `iteration < max_iterations`: increment iteration, store failure artifact, re-enqueue the `route_to` step with updated context including the failure artifact. Otherwise: mark step and run as `failed`.
8. **Run completion** — when no more steps are pending and all terminal steps are `completed`, update run status to `completed`.

---

## Web Server (Express)

Runs on the port defined in `ftsfaf.config.json` (default `4852`). Serves both a REST API and a static web dashboard.

### REST API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/runs` | Submit a task JSON body to start a new run. Returns `{ runId }`. |
| `GET` | `/runs` | List all runs with status and timestamps. |
| `GET` | `/runs/:id` | Get full run detail: status, step executions, artifacts. |
| `GET` | `/runs/:id/artifacts` | List all artifacts for a run. |
| `GET` | `/workflows` | List loaded workflows with their step graphs. |
| `GET` | `/agents` | List loaded agents with health status. |
| `GET` | `/skills` | List all loaded skills. |
| `GET` | `/health` | Service health: Redis, SQLite, agent reachability summary. |

All responses are JSON. Errors use `{ error: string, code: string }` shape.

### Dashboard

Serve a minimal static HTML/JS dashboard from `src/dashboard/`. It should display:
- List of recent runs with live status (poll `/runs` every 3s)
- Run detail view: step-by-step execution status, iteration counts, artifact content
- Agent health status
- No external UI framework required. Vanilla HTML + fetch is fine.

---

## Project Structure

```
ftsfaf/
  src/
    config/
      agents.ts          # agent config loading, zod schema, env interpolation, skill ref validation
      workflows.ts       # workflow loading, calls graph validation + skill capacity check
      skills.ts          # skill file loading and zod schema
      ftsfaf.ts          # ftsfaf.config.json loading and defaults
    graph/
      tarjan.ts          # pure Tarjan SCC implementation, no external dependencies
      validate.ts        # 7 validation checks (steps 1-7 above)
      topo.ts            # condensation graph + topological sort
    infrastructure/
      docker.ts          # dockerode provider
      process.ts         # child_process provider
      ec2.ts             # stub: throws NotImplementedError, implements InfrastructureProvider interface
      remote.ts          # health-check only
      index.ts           # InfrastructureProvider interface + registry, dispatches by type
    prompts/
      loader.ts          # loads system.md from file path, interpolates {{variables}} in user_prompt strings
    runtime/
      state.ts           # SQLite schema init + CRUD helpers for runs, step_executions, artifacts
      worker.ts          # BullMQ worker: dequeue, start infra, render prompts, send A2A, handle result
      dispatcher.ts      # enqueue initial steps for a run, unblock downstream steps after completion
    server/
      index.ts           # Express app setup
      routes/
        runs.ts
        workflows.ts
        agents.ts
        skills.ts
        health.ts
    dashboard/           # static HTML/JS dashboard
    index.ts             # startup sequence (steps 1-10 above)
  agents/                # agent .json config files
  workflows/             # workflow .json files
  skills/                # skill-*.json files
  prompts/               # system prompt .md files
  tests/
    graph/               # tarjan fixtures, validate fixtures (good and bad workflows)
    config/              # zod schema validation tests for all config types
    runtime/             # worker logic tests with mocked A2A responses
  ftsfaf.config.json     # global service config (tracked in repo with local defaults)
  todo.txt               # build order + future work
```

---

## Build Order

Do not skip ahead. Each step should pass its tests before moving to the next.

1. Zod schemas for all config types: skill, agent, workflow, ftsfaf.config
2. `graph/tarjan.ts` — pure function, fully unit tested against known graph fixtures
3. `graph/validate.ts` + `graph/topo.ts` — tested against good and bad workflow fixtures
4. `config/skills.ts` + `config/agents.ts` + `config/workflows.ts` + `config/ftsfaf.ts` — file loading, validation, env interpolation
5. `runtime/state.ts` — SQLite schema init, migrations, CRUD helpers
6. `prompts/loader.ts` — system prompt file loading, `{{variable}}` interpolation
7. `infrastructure/` — all four providers implementing `InfrastructureProvider` interface + registry
8. `runtime/worker.ts` + `runtime/dispatcher.ts` — BullMQ worker logic, A2A dispatch
9. `server/` — Express routes + dashboard
10. `src/index.ts` — full startup sequence
11. `todo.txt` — written alongside step 1, updated as scope is deferred

---

## todo.txt

This file is written by the SWE agent and maintained throughout the build. It contains two sections:

**IN SCOPE / BUILD ORDER** — the 10 steps above, checked off as completed.

**FUTURE / OUT OF SCOPE** — parking lot for deferred work, including:
- Local Docker support for agent infrastructure (needs dockerode integration testing)
- Local Kubernetes support with Helm chart
- EC2 provider full implementation (currently stubbed)
- Inbound authentication on the ftsfaf API server
- Multi-instance clustering
- Langfuse / OpenTelemetry observability integration
- Workflow visualization beyond the basic dashboard
- CLI interface (`ftsfaf run --workflow X --input "..."`) in addition to HTTP API

---

## Explicitly Out of Scope (for initial build)

- Agent implementations (separate projects entirely)
- Inbound auth on the ftsfaf web server
- Multi-node clustering
- EC2 full implementation
- Kubernetes / Helm
- Langfuse observability
- CLI entrypoint (HTTP API only for now)
