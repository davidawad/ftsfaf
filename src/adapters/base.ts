/**
 * Base Adapter Interface
 * All agent framework adapters must implement this interface
 */

import { Effect } from "effect";
import type { AgentConfig } from "../config/schema.js";

export interface SandboxInfo {
  readonly sandboxDir: string;  // e.g., /tmp/ftsfaf/run-abc123/swe-agent/.nullclaw
  readonly port: number;
  readonly url: string;
  readonly pid?: number;        // Process ID (for CLI agents)
  readonly containerId?: string; // Container ID (for Docker agents)
}

export interface AgentInstance {
  readonly agentId: string;
  readonly url: string;
  readonly sandbox: SandboxInfo;
  readonly metadata: Record<string, unknown>;
}

export interface AgentTaskResult {
  readonly content: string;
  readonly metadata?: Record<string, unknown>;
}

export class AdapterError extends Error {
  constructor(
    message: string,
    public readonly adapterType: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "AdapterError";
  }
}

/**
 * Base interface that all agent adapters must implement
 */
export interface AgentAdapter {
  /**
   * The agent type this adapter handles (e.g., "openclaw", "nullclaw", "hermes", "adk")
   */
  readonly agentType: string;

  /**
   * Create sandbox directory for an agent instance
   * Populates it with framework-specific config files from templates
   */
  createSandbox(
    runId: string,
    agentConfig: AgentConfig
  ): Effect.Effect<SandboxInfo, AdapterError>;

  /**
   * Get command to start agent (without env vars)
   */
  getStartCommand(sandbox: SandboxInfo): string[];

  /**
   * Get environment variables for agent process
   */
  getEnvironment(sandbox: SandboxInfo): Record<string, string>;

  /**
   * Start an agent instance
   * For managed agents (openclaw, nullclaw), this creates sandbox and starts the process/container
   * For external agents, this is a no-op that just validates connectivity
   */
  startAgent(
    runId: string,
    config: AgentConfig
  ): Effect.Effect<AgentInstance, AdapterError>;

  /**
   * Stop an agent instance
   * For managed agents, this stops and cleans up the container/process
   * For external agents, this is a no-op
   */
  stopAgent(agentId: string): Effect.Effect<void, AdapterError>;

  /**
   * Execute a task on an agent and poll for completion
   * This should:
   * 1. Send the task to the agent (via A2A protocol)
   * 2. Poll for completion (checking status every N seconds)
   * 3. Return the result only when status is "completed"
   * 4. Throw error if task fails or times out
   */
  executeTask(
    agentId: string,
    systemPrompt: string,
    userPrompt: string,
    pollIntervalSeconds?: number
  ): Effect.Effect<AgentTaskResult, AdapterError>;

  /**
   * Get information about a running agent instance
   */
  getInstance(agentId: string): AgentInstance | undefined;

  /**
   * Check if an agent is currently running
   */
  isRunning(agentId: string): boolean;

  /**
   * Stop all agents managed by this adapter
   */
  stopAll(): Effect.Effect<void, AdapterError>;
}
