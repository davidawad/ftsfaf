/**
 * Docker Client
 * Manages Docker containers via CLI
 */

import { Effect } from "effect";
import { exec } from "child_process";
import { promisify } from "util";
import type { ContainerConfig, ContainerInfo } from "./types.js";
import { logger } from "../../utils/logger.js";

const execAsync = promisify(exec);

export class DockerError extends Error {
  constructor(
    message: string,
    public readonly stderr?: string
  ) {
    super(message);
    this.name = "DockerError";
  }
}

/**
 * Docker client for container management
 */
export class DockerClient {
  /**
   * Execute a docker command
   */
  private execDocker(
    args: string[]
  ): Effect.Effect<string, DockerError> {
    return Effect.tryPromise({
      try: async () => {
        const { stdout, stderr } = await execAsync(`docker ${args.join(" ")}`);
        if (stderr && !stderr.includes("WARNING")) {
          throw new DockerError(`Docker command failed: ${args.join(" ")}`, stderr);
        }
        return stdout.trim();
      },
      catch: (error) => {
        if (error instanceof DockerError) {
          return error;
        }
        return new DockerError(
          `Failed to execute docker command: ${String(error)}`
        );
      },
    });
  }

  /**
   * Pull a Docker image
   */
  pullImage(image: string): Effect.Effect<void, DockerError> {
    return Effect.gen(this, function* (_) {
      logger.info({ image }, "Pulling Docker image");
      yield* _(this.execDocker(["pull", image]));
      logger.debug({ image }, "Image pulled");
    });
  }

  /**
   * Start a container
   */
  startContainer(
    config: ContainerConfig
  ): Effect.Effect<string, DockerError> {
    return Effect.gen(this, function* (_) {
      const args = ["run", "-d", "--name", config.name];

      // Add environment variables
      if (config.env) {
        Object.entries(config.env).forEach(([key, value]) => {
          args.push("-e", `${key}=${value}`);
        });
      }

      // Add port mappings
      if (config.ports) {
        Object.entries(config.ports).forEach(([containerPort, hostPort]) => {
          args.push("-p", `${hostPort}:${containerPort}`);
        });
      }

      // Add volume mounts
      if (config.volumes) {
        Object.entries(config.volumes).forEach(([hostPath, containerPath]) => {
          args.push("-v", `${hostPath}:${containerPath}`);
        });
      }

      args.push(config.image);

      logger.info({ containerName: config.name, image: config.image }, "Starting container");
      const containerId = yield* _(this.execDocker(args));
      logger.debug({
        containerName: config.name,
        containerId: containerId.substring(0, 12),
      }, "Container started");

      return containerId;
    });
  }

  /**
   * Stop a container
   */
  stopContainer(nameOrId: string): Effect.Effect<void, DockerError> {
    return Effect.gen(this, function* (_) {
      logger.info({ container: nameOrId }, "Stopping container");
      yield* _(this.execDocker(["stop", nameOrId]));
      logger.debug({ container: nameOrId }, "Container stopped");
    });
  }

  /**
   * Remove a container
   */
  removeContainer(
    nameOrId: string,
    force = false
  ): Effect.Effect<void, DockerError> {
    return Effect.gen(this, function* (_) {
      const args = ["rm"];
      if (force) {
        args.push("-f");
      }
      args.push(nameOrId);

      logger.info({ container: nameOrId, force }, "Removing container");
      yield* _(this.execDocker(args));
      logger.debug({ container: nameOrId }, "Container removed");
    });
  }

  /**
   * Get container info
   */
  inspectContainer(
    nameOrId: string
  ): Effect.Effect<ContainerInfo, DockerError> {
    return Effect.gen(this, function* (_) {
      const output = yield* _(
        this.execDocker([
          "inspect",
          "--format",
          "{{json .}}",
          nameOrId,
        ])
      );

      const data = JSON.parse(output);

      // Parse port mappings
      const ports: Record<string, string> = {};
      if (data.NetworkSettings?.Ports) {
        Object.entries(data.NetworkSettings.Ports).forEach(([containerPort, bindings]) => {
          if (Array.isArray(bindings) && bindings.length > 0) {
            ports[containerPort] = bindings[0].HostPort;
          }
        });
      }

      return {
        id: data.Id,
        name: data.Name.replace(/^\//, ""),
        status: data.State.Status,
        ports,
      };
    });
  }

  /**
   * Check if a container exists
   */
  containerExists(nameOrId: string): Effect.Effect<boolean, DockerError> {
    return Effect.gen(this, function* (_) {
      const result = yield* _(
        this.execDocker(["ps", "-a", "--filter", `name=${nameOrId}`, "--format", "{{.Names}}"])
      );
      return result.includes(nameOrId);
    });
  }

  /**
   * Wait for container to be healthy
   */
  waitForHealthy(
    nameOrId: string,
    maxWaitSeconds = 30
  ): Effect.Effect<void, DockerError> {
    return Effect.gen(this, function* (_) {
      const startTime = Date.now();

      while (true) {
        const info = yield* _(this.inspectContainer(nameOrId));

        if (info.status === "running") {
          logger.debug({ container: nameOrId }, "Container is healthy");
          return;
        }

        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed > maxWaitSeconds) {
          return yield* _(
            Effect.fail(
              new DockerError(
                `Container ${nameOrId} did not become healthy within ${maxWaitSeconds}s`
              )
            )
          );
        }

        // Wait 1 second before checking again
        yield* _(Effect.sleep("1 second"));
      }
    });
  }

  /**
   * Get container logs
   */
  getLogs(
    nameOrId: string,
    tail = 100
  ): Effect.Effect<string, DockerError> {
    return this.execDocker(["logs", "--tail", String(tail), nameOrId]);
  }
}

/**
 * Create a Docker client
 */
export const createDockerClient = (): DockerClient => {
  return new DockerClient();
};
