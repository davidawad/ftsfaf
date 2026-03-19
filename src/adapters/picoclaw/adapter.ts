/**
 * PicoClaw Adapter
 * Handles picoclaw agents (Go-based, ultra-lightweight, runs in Docker)
 * Runs via Docker container with volume-mounted config
 */

import { Effect } from "effect";
import { promises as fs } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { createDockerClient } from "../../infrastructure/docker/client.js";
import type { AgentConfig } from "../../config/schema.js";
import type { AgentAdapter, AgentInstance, AgentTaskResult, SandboxInfo } from "../base.js";
import { AdapterError } from "../base.js";
import { logger } from "../../utils/logger.js";
import { SANDBOX_BASE_PATH } from "../../utils/constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PICOCLAW_IMAGE = "docker.io/sipeed/picoclaw:latest";
const PICOCLAW_CONFIG_PATH = "/root/.picoclaw";

export class PicoClawAdapter implements AgentAdapter {
  readonly agentType = "picoclaw";
  
  private instances = new Map<string, AgentInstance>();
  private readonly basePort = 18790; // Default picoclaw gateway port
  private portCounter = 0;
  private readonly templatesDir = path.join(__dirname, "defaults");
  private readonly dockerClient = createDockerClient();

  /**
   * Create sandbox directory with picoclaw config
   */
  createSandbox(
    runId: string,
    agentConfig: AgentConfig
  ): Effect.Effect<SandboxInfo, AdapterError> {
    return Effect.gen(this, function* (_) {
      const sandboxDir = `${SANDBOX_BASE_PATH}/run-${runId}/${agentConfig.id}/.${this.agentType}`;
      const port = this.basePort + this.portCounter++;

      logger.info({ agentId: agentConfig.id, sandboxDir }, "Creating picoclaw sandbox");

      // Create directory structure (matching ~/.picoclaw structure)
      yield* _(
        Effect.tryPromise({
          try: async () => {
            await fs.mkdir(path.join(sandboxDir, "workspace"), { recursive: true });
          },
          catch: (error) =>
            new AdapterError(
              `Failed to create sandbox directory: ${String(error)}`,
              this.agentType,
              error
            ),
        })
      );

      // Copy all workspace .md files
      const workspaceFiles = ['AGENTS.md', 'IDENTITY.md', 'SOUL.md', 'USER.md'];
      
      for (const file of workspaceFiles) {
        yield* _(
          Effect.tryPromise({
            try: async () => {
              const templatePath = path.join(this.templatesDir, file);
              const content = await fs.readFile(templatePath, 'utf-8');
              
              // Special handling for USER.md - interpolate system_prompt
              if (file === 'USER.md' && agentConfig.system_prompt) {
                const interpolated = content.includes('${SYSTEM_PROMPT}')
                  ? content.replace(/\$\{SYSTEM_PROMPT\}/g, agentConfig.system_prompt)
                  : `${agentConfig.system_prompt}\n\n${content}`;
                await fs.writeFile(
                  path.join(sandboxDir, 'workspace', file),
                  interpolated
                );
              } else {
                await fs.copyFile(
                  templatePath,
                  path.join(sandboxDir, 'workspace', file)
                );
              }
            },
            catch: (error) =>
              new AdapterError(
                `Failed to copy workspace file ${file}: ${String(error)}`,
                this.agentType,
                error
              ),
          })
        );
      }

      // Load and interpolate config.json template
      const configTemplate = yield* _(
        Effect.tryPromise({
          try: () => fs.readFile(path.join(this.templatesDir, 'config.json'), 'utf-8'),
          catch: (error) =>
            new AdapterError(
              `Failed to read config template: ${String(error)}`,
              this.agentType,
              error
            ),
        })
      );

      // Parse and update config
      const config = JSON.parse(configTemplate);
      
      // Update model if specified in agent metadata
      const model = agentConfig.metadata?.model as string;
      if (model) {
        config.agents.defaults.model_name = "custom";
        // Add custom model to model_list if not exists
        const existingModel = config.model_list.find((m: any) => m.model_name === "custom");
        if (!existingModel) {
          config.model_list.unshift({
            model_name: "custom",
            model: model,
            api_key: process.env.OPENROUTER_KEY || process.env.OPENAI_API_KEY || "",
            api_base: "https://openrouter.ai/api/v1"
          });
        }
      }

      // Update gateway settings
      config.gateway.host = "0.0.0.0"; // Allow container access
      config.gateway.port = port;

      // Disable all channels (we're using agent mode, not gateway)
      Object.keys(config.channels).forEach(channel => {
        config.channels[channel].enabled = false;
      });

      // Write interpolated config
      yield* _(
        Effect.tryPromise({
          try: () => fs.writeFile(
            path.join(sandboxDir, 'config.json'),
            JSON.stringify(config, null, 2)
          ),
          catch: (error) =>
            new AdapterError(
              `Failed to write config.json: ${String(error)}`,
              this.agentType,
              error
            ),
        })
      );

      logger.info({ agentId: agentConfig.id, sandboxDir, port }, "Sandbox created");

      return {
        sandboxDir,
        port,
        url: `http://localhost:${port}`,
      };
    });
  }

  /**
   * Get command to start picoclaw (not used for Docker, but required by interface)
   */
  getStartCommand(sandbox: SandboxInfo): string[] {
    return ['docker', 'run', '-d', `--name=picoclaw-${sandbox.port}`];
  }

  /**
   * Get environment variables for picoclaw process
   */
  getEnvironment(sandbox: SandboxInfo): Record<string, string> {
    return {
      PICOCLAW_GATEWAY_HOST: '0.0.0.0',
      PICOCLAW_GATEWAY_PORT: String(sandbox.port),
    } as Record<string, string>;
  }

  /**
   * Start a picoclaw agent via Docker
   * Note: For picoclaw, we don't run a persistent container
   * We just prepare the sandbox and pull the image
   */
  startAgent(
    runId: string,
    agentConfig: AgentConfig
  ): Effect.Effect<AgentInstance, AdapterError> {
    return Effect.gen(this, function* (_) {
      logger.info({ agentId: agentConfig.id }, "Starting picoclaw agent");

      // Create sandbox
      const sandbox = yield* _(this.createSandbox(runId, agentConfig));

      // Pull Docker image if needed
      logger.info({ image: PICOCLAW_IMAGE }, "Ensuring Docker image is available");
      yield* _(
        Effect.tryPromise({
          try: async () => {
            // Try to pull the image (suppress errors if already exists)
            try {
              await this.dockerClient.pullImage(PICOCLAW_IMAGE).pipe(Effect.runPromise);
            } catch (error) {
              logger.debug({ error }, "Image may already exist locally");
            }
          },
          catch: (error) =>
            new AdapterError(
              `Failed to prepare Docker image: ${String(error)}`,
              this.agentType,
              error
            ),
        })
      );

      const instance: AgentInstance = {
        agentId: agentConfig.id,
        url: sandbox.url,
        sandbox: sandbox, // No persistent container, just sandbox info
        metadata: {
          sandboxDir: sandbox.sandboxDir,
          agentType: this.agentType,
          image: PICOCLAW_IMAGE,
        },
      };

      this.instances.set(agentConfig.id, instance);

      logger.info(
        {
          agentId: agentConfig.id,
          sandboxDir: sandbox.sandboxDir,
        },
        "PicoClaw agent ready (Docker one-shot mode)"
      );

      return instance;
    });
  }

  /**
   * Stop a picoclaw agent
   * Since we use one-shot containers, there's nothing persistent to stop
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

      this.instances.delete(agentId);
      logger.info({ agentId }, "PicoClaw agent stopped");
    });
  }

  /**
   * Execute task via picoclaw Docker container (one-shot mode)
   */
  executeTask(
    agentId: string,
    systemPrompt: string,
    userPrompt: string,
    _pollIntervalSeconds = 30
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

      const sandboxDir = instance.sandbox.sandboxDir;
      logger.info({ agentId, sandboxDir }, "Executing task via picoclaw Docker");

      // Combine system and user prompts
      const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;

      // Execute picoclaw agent in a one-shot container
      const result = yield* _(
        Effect.tryPromise({
          try: () =>
            new Promise<string>((resolve, reject) => {
              // docker run --rm -v <sandboxDir>:/root/.picoclaw --entrypoint picoclaw sipeed/picoclaw:latest agent -m "<prompt>"
              const proc = spawn('docker', [
                'run',
                '--rm',
                '-v', `${sandboxDir}:${PICOCLAW_CONFIG_PATH}`,
                '--entrypoint', 'picoclaw',
                PICOCLAW_IMAGE,
                'agent',
                '-m', combinedPrompt
              ], {
                stdio: 'pipe',
              });

              let stdout = '';
              let stderr = '';

              proc.stdout?.on('data', (data: Buffer) => {
                const output = data.toString();
                stdout += output;
                logger.debug({ agentId, output: output.trim() }, 'picoclaw stdout');
              });

              proc.stderr?.on('data', (data: Buffer) => {
                const output = data.toString();
                stderr += output;
                logger.debug({ agentId, output: output.trim() }, 'picoclaw stderr');
              });

              proc.on('close', (code: number) => {
                if (code === 0) {
                  resolve(stdout);
                } else {
                  reject(new Error(`picoclaw exited with code ${code}: ${stderr}`));
                }
              });

              proc.on('error', (error: Error) => {
                reject(error);
              });
            }),
          catch: (error) =>
            new AdapterError(
              `Failed to execute picoclaw: ${String(error)}`,
              this.agentType,
              error
            ),
        })
      );

      logger.info({ agentId }, "Task completed via Docker");

      return {
        content: result.trim(),
        metadata: {
          method: 'docker-oneshot',
          sandboxDir,
          image: PICOCLAW_IMAGE,
        },
      };
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

      logger.info({ count: agentIds.length }, "All PicoClaw agents stopped");
    });
  }
}

/**
 * Create a picoclaw adapter
 */
export const createPicoClawAdapter = (): PicoClawAdapter => {
  return new PicoClawAdapter();
};
