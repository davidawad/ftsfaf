/**
 * OpenClaw A2A Adapter
 * Manages OpenClaw agents running in Docker containers
 */

import { Effect } from "effect";
import { createA2AClient, A2AClientError } from "../a2a/client.js";
import { createDockerClient, DockerError } from "../../infrastructure/docker/client.js";
import type { AgentConfig } from "../../config/schema.js";
import type { AgentAdapter, AgentInstance, AgentTaskResult } from "../base.js";
import { AdapterError } from "../base.js";
import { logger } from "../../utils/logger.js";

/**
 * OpenClaw Adapter
 * Manages lifecycle of OpenClaw agents in Docker containers
 */
export class OpenClawAdapter implements AgentAdapter {
  readonly agentType = "openclaw";
  
  private docker = createDockerClient();
  private instances = new Map<string, AgentInstance>();
  private readonly basePort = 8000;
  private portCounter = 0;

  /**
   * Start an OpenClaw agent in a Docker container
   */
  startAgent(
    agentConfig: AgentConfig
  ): Effect.Effect<AgentInstance, AdapterError> {
    return Effect.gen(this, function* (_) {
      const containerName = `ftsfaf-openclaw-${agentConfig.id}`;
      const port = this.basePort + this.portCounter++;

      // Check if container already exists
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
        logger.info({ containerName }, "Container already exists, removing");
        yield* _(
          this.docker.removeContainer(containerName, true).pipe(
            Effect.mapError(
              (e) =>
                new AdapterError(
                  `Failed to remove existing container: ${e.message}`,
                  this.agentType,
                  e
                )
            )
          )
        );
      }

      // Pull OpenClaw image if needed
      yield* _(
        this.docker.pullImage("alpine/openclaw:latest").pipe(
          Effect.mapError(
            (e) =>
              new AdapterError(
                `Failed to pull openclaw image: ${e.message}`,
                this.agentType,
                e
              )
          )
        )
      );

      // Start container
      const containerId = yield* _(
        this.docker
          .startContainer({
            image: "alpine/openclaw:latest",
            name: containerName,
            ports: {
              "8000": String(port), // OpenClaw default port
            },
            env: {
              OPENCLAW_AGENT_ID: agentConfig.id,
              // Pass any agent-specific environment variables
              ...(agentConfig.metadata as Record<string, string> | undefined),
            },
          })
          .pipe(
            Effect.mapError(
              (e) =>
                new AdapterError(
                  `Failed to start container: ${e.message}`,
                  this.agentType,
                  e
                )
            )
          )
      );

      // Wait for container to be healthy
      yield* _(
        this.docker.waitForHealthy(containerName, 30).pipe(
          Effect.mapError(
            (e) =>
              new AdapterError(
                `Container failed to become healthy: ${e.message}`,
                this.agentType,
                e
              )
          )
        )
      );

      // Wait a bit more for the A2A server to start
      yield* _(Effect.sleep("2 seconds"));

      const url = `http://localhost:${port}`;
      const instance: AgentInstance = {
        agentId: agentConfig.id,
        url,
        metadata: {
          containerId,
          containerName,
          port,
          toolType: this.agentType,
        },
      };

      this.instances.set(agentConfig.id, instance);

      logger.info(
        {
          agentId: agentConfig.id,
          url,
          containerId: containerId.substring(0, 12),
        },
        "OpenClaw agent started"
      );

      return instance;
    });
  }

  /**
   * Stop an OpenClaw agent
   */
  stopAgent(agentId: string): Effect.Effect<void, AdapterError> {
    return Effect.gen(this, function* (_) {
      const instance = this.instances.get(agentId);
      if (!instance) {
        return yield* _(
          Effect.fail(
            new AdapterError(
              `No instance found for agent: ${agentId}`,
              this.agentType
            )
          )
        );
      }

      const containerName = instance.metadata.containerName as string;

      yield* _(
        this.docker.stopContainer(containerName).pipe(
          Effect.mapError(
            (e) =>
              new AdapterError(
                `Failed to stop container: ${e.message}`,
                this.agentType,
                e
              )
          )
        )
      );

      yield* _(
        this.docker.removeContainer(containerName).pipe(
          Effect.mapError(
            (e) =>
              new AdapterError(
                `Failed to remove container: ${e.message}`,
                this.agentType,
                e
              )
          )
        )
      );

      this.instances.delete(agentId);
      logger.info({ agentId }, "OpenClaw agent stopped");
    });
  }

  /**
   * Execute task with polling for completion
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
            new AdapterError(
              `Agent ${agentId} is not running`,
              this.agentType
            )
          )
        );
      }

      const client = createA2AClient(instance.url);

      logger.info({ agentId, url: instance.url }, "Sending task to openclaw agent");

      // Send message via A2A protocol
      const taskResponse = yield* _(
        client
          .sendMessage({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          })
          .pipe(
            Effect.mapError(
              (e) =>
                new AdapterError(
                  `Failed to send message: ${e.message}`,
                  this.agentType,
                  e
                )
            )
          )
      );

      const taskId = taskResponse.taskId;
      logger.info({ agentId, taskId }, "Task submitted, polling for completion");

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 60; // 30 minutes max with 30s intervals

      while (attempts < maxAttempts) {
        yield* _(Effect.sleep(`${pollIntervalSeconds} seconds`));
        attempts++;

        const taskStatus = yield* _(
          client.getTask(taskId).pipe(
            Effect.mapError(
              (e) =>
                new AdapterError(
                  `Failed to get task status: ${e.message}`,
                  this.agentType,
                  e
                )
            )
          )
        );

        logger.debug(
          {
            agentId,
            taskId,
            state: taskStatus.status.state,
            attempt: attempts,
          },
          "Polling task status"
        );

        switch (taskStatus.status.state) {
          case "completed":
            logger.info({ agentId, taskId }, "Task completed");

            if (!taskStatus.artifacts || taskStatus.artifacts.length === 0) {
              return yield* _(
                Effect.fail(
                  new AdapterError(
                    "Task completed but no artifacts returned",
                    this.agentType
                  )
                )
              );
            }

            const artifact = taskStatus.artifacts[0];
            const content = artifact.parts
              .filter((p) => p.type === "text")
              .map((p) => p.content)
              .join("\n");

            return {
              content,
              metadata: {
                taskId,
                attempts,
                duration: `${attempts * pollIntervalSeconds}s`,
              },
            };

          case "failed":
            const errorMsg =
              taskStatus.status.message?.content || "Task failed";
            logger.error({ agentId, taskId, errorMsg }, "Task failed");
            return yield* _(
              Effect.fail(
                new AdapterError(`Agent task failed: ${errorMsg}`, this.agentType)
              )
            );

          case "working":
          case "submitted":
            logger.debug({ agentId, taskId, attempt: attempts }, "Task still in progress");
            break;

          default:
            logger.warn(
              {
                agentId,
                taskId,
                state: taskStatus.status.state,
              },
              "Unexpected task state"
            );
        }
      }

      // Timeout
      return yield* _(
        Effect.fail(
          new AdapterError(
            `Task timed out after ${maxAttempts * pollIntervalSeconds}s`,
            this.agentType
          )
        )
      );
    });
  }

  getInstance(agentId: string): AgentInstance | undefined {
    return this.instances.get(agentId);
  }

  isRunning(agentId: string): boolean {
    return this.instances.has(agentId);
  }

  stopAll(): Effect.Effect<void, AdapterError> {
    return Effect.gen(this, function* (_) {
      const agentIds = Array.from(this.instances.keys());

      for (const agentId of agentIds) {
        yield* _(this.stopAgent(agentId));
      }

      logger.info({ count: agentIds.length }, "All OpenClaw agents stopped");
    });
  }
}

/**
 * Create an OpenClaw adapter
 */
export const createOpenClawAdapter = (): OpenClawAdapter => {
  return new OpenClawAdapter();
};
