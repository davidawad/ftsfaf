/**
 * OpenHands Adapter
 *
 * Manages OpenHands agents running as Docker containers.
 * Each agent instance gets its own:
 *   - state directory  → mounted as /.openhands-state
 *   - workspace folder → mounted as /workspace (this is the artifact folder)
 *
 * The adapter communicates with the running container via the OpenHands REST API.
 * Conversation status is polled via GET /api/conversations/{id}/events.
 */

import { Effect } from "effect";
import { promises as fs } from "fs";
import * as path from "path";
import { createDockerClient } from "../../infrastructure/docker/client.js";
import type { AgentConfig } from "../../config/schema.js";
import type { AgentAdapter, AgentInstance, AgentTaskResult, SandboxInfo } from "../base.js";
import { AdapterError } from "../base.js";
import { logger } from "../../utils/logger.js";
import { SANDBOX_BASE_PATH } from "../../utils/constants.js";

/** OpenHands Docker image to use */
const OPENHANDS_IMAGE = "ghcr.io/all-hands-ai/openhands:0.39";
/** OpenHands runtime sandbox image */
const RUNTIME_IMAGE = "docker.io/all-hands-ai/runtime:0.39-nikolaik";
/** Port OpenHands listens on inside the container */
const CONTAINER_PORT = 3000;
/** Base host port for mapping (increments per instance) */
const BASE_HOST_PORT = 7843;

// ---------------------------------------------------------------------------
// OpenHands REST API types
// ---------------------------------------------------------------------------

interface CreateConversationResponse {
  conversation_id?: string;
  /** Some builds return `id` instead */
  id?: string;
  status?: string;
}

interface ConversationEvent {
  id?: string | number;
  kind?: string;
  /** Legacy format */
  type?: string;
  timestamp?: string;
  source?: string;
  agent_state?: string;
  message?: string;
  [key: string]: unknown;
}

type AgentState =
  | "stopped"
  | "finished"
  | "error"
  | "running"
  | "loading"
  | "init"
  | "awaiting_user_input"
  | "user_confirmed"
  | "user_rejected";

const TERMINAL_STATES: AgentState[] = ["stopped", "finished", "error"];

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class OpenHandsAdapter implements AgentAdapter {
  readonly agentType = "openhands";

  private docker = createDockerClient();
  private instances = new Map<string, AgentInstance>();
  private portCounter = 0;

  // -------------------------------------------------------------------------
  // createSandbox
  // -------------------------------------------------------------------------

  /**
   * Creates the per-agent filesystem sandbox:
   *   {SANDBOX_BASE_PATH}/run-{runId}/{agentId}/.openhands-state/
   *   {workspaceDir}  (provided via agentConfig.metadata.workspaceDir or created fresh)
   */
  createSandbox(
    runId: string,
    agentConfig: AgentConfig
  ): Effect.Effect<SandboxInfo, AdapterError> {
    return Effect.gen(this, function* (_) {
      const port = BASE_HOST_PORT + this.portCounter++;
      const agentSandboxRoot = path.join(SANDBOX_BASE_PATH, `run-${runId}`, agentConfig.id);
      const stateDir = path.join(agentSandboxRoot, ".openhands-state");

      // Workspace dir can be injected by the executor when handing off a folder artifact.
      // If not set we create a fresh empty workspace for this agent.
      const workspaceDir =
        (agentConfig.metadata?.workspaceDir as string | undefined) ??
        path.join(agentSandboxRoot, "workspace");

      yield* _(
        Effect.tryPromise({
          try: async () => {
            await fs.mkdir(stateDir, { recursive: true });
            await fs.mkdir(workspaceDir, { recursive: true });
          },
          catch: (err) =>
            new AdapterError(
              `Failed to create openhands sandbox dirs: ${String(err)}`,
              this.agentType,
              err
            ),
        })
      );

      logger.info(
        { agentId: agentConfig.id, stateDir, workspaceDir, port },
        "OpenHands sandbox created"
      );

      return {
        sandboxDir: agentSandboxRoot,
        port,
        url: `http://localhost:${port}`,
        // Carry extra paths in the SandboxInfo via the containerId / pid slots being unused here
        // We store them as extra metadata via getStartCommand / getEnvironment contract;
        // actual paths are persisted in instance.metadata below.
      } satisfies SandboxInfo;
    });
  }

  // -------------------------------------------------------------------------
  // getStartCommand / getEnvironment (part of AgentAdapter interface)
  // -------------------------------------------------------------------------

  getStartCommand(_sandbox: SandboxInfo): string[] {
    // Docker run is handled entirely in startAgent; this is a no-op.
    return [];
  }

  getEnvironment(_sandbox: SandboxInfo): Record<string, string> {
    return {};
  }

  // -------------------------------------------------------------------------
  // startAgent
  // -------------------------------------------------------------------------

  startAgent(
    runId: string,
    agentConfig: AgentConfig
  ): Effect.Effect<AgentInstance, AdapterError> {
    return Effect.gen(this, function* (_) {
      logger.info({ agentId: agentConfig.id }, "Starting OpenHands agent");

      // Build sandbox paths
      const port = BASE_HOST_PORT + this.portCounter++;
      const agentSandboxRoot = path.join(SANDBOX_BASE_PATH, `run-${runId}`, agentConfig.id);
      const stateDir = path.join(agentSandboxRoot, ".openhands-state");
      const workspaceDir =
        (agentConfig.metadata?.workspaceDir as string | undefined) ??
        path.join(agentSandboxRoot, "workspace");

      yield* _(
        Effect.tryPromise({
          try: async () => {
            await fs.mkdir(stateDir, { recursive: true });
            await fs.mkdir(workspaceDir, { recursive: true });
          },
          catch: (err) =>
            new AdapterError(
              `Failed to create sandbox directories: ${String(err)}`,
              this.agentType,
              err
            ),
        })
      );

      // Resolve LLM configuration
      const model =
        (agentConfig.metadata?.model as string | undefined) ??
        "openrouter/anthropic/claude-sonnet-4-5";
      const llmApiKey =
        process.env.OPENROUTER_API_KEY ??
        process.env.OPENROUTER_KEY ??
        "";
      const llmBaseUrl = "https://openrouter.ai/api/v1";

      // Extra env vars injected from task env_files (parsed and merged by the executor)
      const extraEnvVars =
        (agentConfig.metadata?.envVars as Record<string, string> | undefined) ?? {};

      const containerName = `openhands-${runId}-${agentConfig.id}`;

      // Remove any stale container with the same name
      const exists = yield* _(
        this.docker.containerExists(containerName).pipe(
          Effect.mapError(
            (e) =>
              new AdapterError(
                `Failed to check container existence: ${e.message}`,
                this.agentType,
                e
              )
          )
        )
      );

      if (exists) {
        logger.info({ containerName }, "Removing stale OpenHands container");
        yield* _(
          this.docker.removeContainer(containerName, true).pipe(
            Effect.mapError(
              (e) =>
                new AdapterError(
                  `Failed to remove stale container: ${e.message}`,
                  this.agentType,
                  e
                )
            )
          )
        );
      }

      // Start the container
      const containerId = yield* _(
        this.docker
          .startContainer({
            image: OPENHANDS_IMAGE,
            name: containerName,
            ports: {
              [`${CONTAINER_PORT}`]: `127.0.0.1:${port}`,
            },
            env: {
              SANDBOX_RUNTIME_CONTAINER_IMAGE: RUNTIME_IMAGE,
              LOG_ALL_EVENTS: "true",
              LLM_MODEL: model,
              LLM_API_KEY: llmApiKey,
              LLM_BASE_URL: llmBaseUrl,
              ...extraEnvVars,
            },
            volumes: {
              "/var/run/docker.sock": "/var/run/docker.sock",
              [stateDir]: "/.openhands-state",
              [workspaceDir]: "/workspace",
            },
          })
          .pipe(
            Effect.mapError(
              (e) =>
                new AdapterError(
                  `Failed to start OpenHands container: ${e.message}`,
                  this.agentType,
                  e
                )
            )
          )
      );

      // Wait for the HTTP server to come up (poll /api/options/models)
      yield* _(this.waitForReady(`http://localhost:${port}`, 60));

      const instance: AgentInstance = {
        agentId: agentConfig.id,
        url: `http://localhost:${port}`,
        sandbox: {
          sandboxDir: agentSandboxRoot,
          port,
          url: `http://localhost:${port}`,
          containerId,
        },
        metadata: {
          containerId,
          containerName,
          port,
          stateDir,
          workspaceDir,
          agentType: this.agentType,
        },
      };

      this.instances.set(agentConfig.id, instance);

      logger.info(
        {
          agentId: agentConfig.id,
          url: instance.url,
          workspaceDir,
          containerId: containerId.substring(0, 12),
        },
        "OpenHands agent started"
      );

      return instance;
    });
  }

  // -------------------------------------------------------------------------
  // waitForReady — poll until the OpenHands HTTP API is responding
  // -------------------------------------------------------------------------

  private waitForReady(
    url: string,
    maxWaitSeconds: number
  ): Effect.Effect<void, AdapterError> {
    return Effect.gen(this, function* (_) {
      const start = Date.now();
      const probe = `${url}/api/options/models`;

      while (true) {
        const elapsed = (Date.now() - start) / 1000;
        if (elapsed > maxWaitSeconds) {
          return yield* _(
            Effect.fail(
              new AdapterError(
                `OpenHands server at ${url} did not become ready within ${maxWaitSeconds}s`,
                this.agentType
              )
            )
          );
        }

        // Use Effect.promise (never fails) so we don't pollute the error type
        const ok = yield* _(
          Effect.promise(async () => {
            try {
              const res = await fetch(probe, { signal: AbortSignal.timeout(3000) });
              return res.ok || res.status === 401;
            } catch {
              return false;
            }
          })
        );

        if (ok) {
          logger.debug({ url }, "OpenHands server is ready");
          return;
        }

        logger.debug({ url, elapsed: elapsed.toFixed(1) }, "Waiting for OpenHands to be ready…");
        yield* _(Effect.sleep("3 seconds"));
      }
    });
  }

  // -------------------------------------------------------------------------
  // stopAgent
  // -------------------------------------------------------------------------

  stopAgent(agentId: string): Effect.Effect<void, AdapterError> {
    return Effect.gen(this, function* (_) {
      const instance = this.instances.get(agentId);
      if (!instance) {
        return yield* _(
          Effect.fail(
            new AdapterError(`No instance found for agent: ${agentId}`, this.agentType)
          )
        );
      }

      const containerName = instance.metadata.containerName as string;

      yield* _(
        this.docker.stopContainer(containerName).pipe(
          Effect.mapError(
            (e) =>
              new AdapterError(`Failed to stop container: ${e.message}`, this.agentType, e)
          ),
          Effect.catchAll((e) => {
            logger.warn({ agentId, error: e.message }, "Ignoring stop error");
            return Effect.void;
          })
        )
      );

      yield* _(
        this.docker.removeContainer(containerName, true).pipe(
          Effect.mapError(
            (e) =>
              new AdapterError(`Failed to remove container: ${e.message}`, this.agentType, e)
          ),
          Effect.catchAll((e) => {
            logger.warn({ agentId, error: e.message }, "Ignoring remove error");
            return Effect.void;
          })
        )
      );

      this.instances.delete(agentId);
      logger.info({ agentId }, "OpenHands agent stopped");
    });
  }

  // -------------------------------------------------------------------------
  // executeTask
  // -------------------------------------------------------------------------

  /**
   * 1. POST /api/conversations → get conversation_id
   * 2. Poll GET /api/conversations/{id}/events every pollIntervalSeconds
   * 3. Watch for AgentStateChangedObservation with a terminal agent_state
   * 4. Return the workspace dir path as the artifact result (for folder artifacts)
   *    and the final agent message as the text content.
   */
  executeTask(
    agentId: string,
    systemPrompt: string,
    userPrompt: string,
    pollIntervalSeconds = 30
  ): Effect.Effect<AgentTaskResult, AdapterError> {
    return Effect.gen(this, function* (_) {
      const instance = this.instances.get(agentId);
      if (!instance) {
        return yield* _(
          Effect.fail(
            new AdapterError(`Agent ${agentId} is not running`, this.agentType)
          )
        );
      }

      const baseUrl = instance.url;
      const workspaceDir = instance.metadata.workspaceDir as string;

      const initialQuery = systemPrompt
        ? `${systemPrompt}\n\n${userPrompt}`
        : userPrompt;

      logger.info({ agentId, baseUrl }, "Creating OpenHands conversation");

      // Create conversation
      const createRes = yield* _(
        Effect.tryPromise({
          try: async () => {
            const res = await fetch(`${baseUrl}/api/conversations`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ initial_query: initialQuery }),
              signal: AbortSignal.timeout(30_000),
            });
            if (!res.ok) {
              const body = await res.text();
              throw new Error(`POST /api/conversations failed (${res.status}): ${body}`);
            }
            return res.json() as Promise<CreateConversationResponse>;
          },
          catch: (err) =>
            new AdapterError(
              `Failed to create conversation: ${String(err)}`,
              this.agentType,
              err
            ),
        })
      );

      const conversationId = createRes.conversation_id ?? createRes.id;
      if (!conversationId) {
        return yield* _(
          Effect.fail(
            new AdapterError(
              "OpenHands did not return a conversation_id",
              this.agentType
            )
          )
        );
      }

      logger.info({ agentId, conversationId }, "Conversation created, polling for completion");

      // Poll events
      const maxAttempts = Math.ceil((60 * 60) / pollIntervalSeconds); // 1 hour max
      let attempts = 0;
      let lastSeenEventCount = 0;

      while (attempts < maxAttempts) {
        yield* _(Effect.sleep(`${pollIntervalSeconds} seconds`));
        attempts++;

        const events = yield* _(
          this.fetchEvents(baseUrl, conversationId)
        );

        // Log new events since last poll
        const newEvents = events.slice(lastSeenEventCount);
        lastSeenEventCount = events.length;
        for (const ev of newEvents) {
          logger.debug(
            { agentId, conversationId, kind: ev.kind ?? ev.type, agent_state: ev.agent_state },
            "OpenHands event"
          );
        }

        // Check for terminal agent state
        const terminalEvent = events.find(
          (ev) =>
            (ev.kind === "AgentStateChangedObservation" ||
              ev.type === "agent_state_changed") &&
            TERMINAL_STATES.includes(ev.agent_state as AgentState)
        );

        if (terminalEvent) {
          const state = terminalEvent.agent_state as AgentState;

          if (state === "error") {
            const msg = terminalEvent.message ?? "Unknown error from OpenHands agent";
            logger.error({ agentId, conversationId, msg }, "OpenHands agent errored");
            return yield* _(
              Effect.fail(
                new AdapterError(`OpenHands agent failed: ${msg}`, this.agentType)
              )
            );
          }

          // Extract last assistant/agent message as text content
          const lastMessage = this.extractLastAgentMessage(events);

          logger.info(
            { agentId, conversationId, state, attempts },
            "OpenHands task completed"
          );

          return {
            content: lastMessage ?? `Task completed. Workspace: ${workspaceDir}`,
            metadata: {
              conversationId,
              attempts,
              workspaceDir,
              agentState: state,
            },
          } satisfies AgentTaskResult;
        }

        logger.debug(
          { agentId, conversationId, attempt: attempts, eventCount: events.length },
          "OpenHands task still running"
        );
      }

      return yield* _(
        Effect.fail(
          new AdapterError(
            `OpenHands task timed out after ${attempts * pollIntervalSeconds}s`,
            this.agentType
          )
        )
      );
    });
  }

  // -------------------------------------------------------------------------
  // fetchEvents
  // -------------------------------------------------------------------------

  private fetchEvents(
    baseUrl: string,
    conversationId: string
  ): Effect.Effect<ConversationEvent[], AdapterError> {
    return Effect.tryPromise({
      try: async () => {
        const res = await fetch(
          `${baseUrl}/api/conversations/${conversationId}/events`,
          { signal: AbortSignal.timeout(15_000) }
        );
        if (!res.ok) {
          throw new Error(`GET /api/conversations/${conversationId}/events failed (${res.status})`);
        }
        const data: unknown = await res.json();
        // API may return { events: [...] } or a plain array
        if (Array.isArray(data)) return data as ConversationEvent[];
        const asRecord = data as Record<string, unknown>;
        if (Array.isArray(asRecord["events"])) return asRecord["events"] as ConversationEvent[];
        return [] as ConversationEvent[];
      },
      catch: (err) =>
        new AdapterError(
          `Failed to fetch conversation events: ${String(err)}`,
          this.agentType,
          err
        ),
    });
  }

  // -------------------------------------------------------------------------
  // extractLastAgentMessage — pull the last text message from the agent
  // -------------------------------------------------------------------------

  private extractLastAgentMessage(events: ConversationEvent[]): string | undefined {
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (!ev) continue;
      const isMessage =
        ev.kind === "MessageAction" ||
        ev.type === "message" ||
        ev.kind === "AgentMessageObservation";
      if (isMessage && typeof ev.message === "string" && ev.message.trim()) {
        return ev.message.trim();
      }
      // Some builds put content in `content`
      if (isMessage && typeof ev.content === "string" && (ev.content as string).trim()) {
        return (ev.content as string).trim();
      }
    }
    return undefined;
  }

  // -------------------------------------------------------------------------
  // getInstance / isRunning / stopAll
  // -------------------------------------------------------------------------

  getInstance(agentId: string): AgentInstance | undefined {
    return this.instances.get(agentId);
  }

  isRunning(agentId: string): boolean {
    return this.instances.has(agentId);
  }

  stopAll(): Effect.Effect<void, AdapterError> {
    return Effect.gen(this, function* (_) {
      const ids = Array.from(this.instances.keys());
      for (const agentId of ids) {
        yield* _(this.stopAgent(agentId));
      }
      logger.info({ count: ids.length }, "All OpenHands agents stopped");
    });
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const createOpenHandsAdapter = (): OpenHandsAdapter =>
  new OpenHandsAdapter();
