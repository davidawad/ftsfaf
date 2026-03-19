/**
 * NullClaw Adapter
 * Handles nullclaw agents (678KB Zig binary, ultra-lightweight)
 * Runs via CLI with NULLCLAW_HOME for sandbox isolation
 */

import { Effect } from "effect";
import { spawn, ChildProcess } from "child_process";
import { promises as fs } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createA2AClient } from "../a2a/client.js";
import type { AgentConfig } from "../../config/schema.js";
import type { AgentAdapter, AgentInstance, AgentTaskResult, SandboxInfo } from "../base.js";
import { AdapterError } from "../base.js";
import { logger } from "../../utils/logger.js";
import { SANDBOX_BASE_PATH } from "../../utils/constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class NullClawAdapter implements AgentAdapter {
  readonly agentType = "nullclaw";
  
  private instances = new Map<string, AgentInstance>();
  private readonly basePort = 9000;
  private portCounter = 0;
  private readonly templatesDir = path.join(__dirname, "defaults");

  /**
   * Create sandbox directory with nullclaw config
   */
  createSandbox(
    runId: string,
    agentConfig: AgentConfig
  ): Effect.Effect<SandboxInfo, AdapterError> {
    return Effect.gen(this, function* (_) {
      const sandboxDir = `${SANDBOX_BASE_PATH}/run-${runId}/${agentConfig.id}/.${this.agentType}`;
      const port = this.basePort + this.portCounter++;

      logger.info({ agentId: agentConfig.id, sandboxDir }, "Creating nullclaw sandbox");

      // Create directory structure
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

      // Copy all .md template files
      const templateFiles = yield* _(
        Effect.tryPromise({
          try: async () => {
            const files = await fs.readdir(this.templatesDir);
            return files.filter(f => f.endsWith('.md'));
          },
          catch: (error) =>
            new AdapterError(
              `Failed to read template directory: ${String(error)}`,
              this.agentType,
              error
            ),
        })
      );

      for (const file of templateFiles) {
        yield* _(
          Effect.tryPromise({
            try: async () => {
              const content = await fs.readFile(
                path.join(this.templatesDir, file),
                'utf-8'
              );
              
              // Special handling for USER.md - interpolate system_prompt
              if (file === 'USER.md' && agentConfig.system_prompt) {
                const interpolated = content.includes('${SYSTEM_PROMPT}')
                  ? content.replace(/\$\{SYSTEM_PROMPT\}/g, agentConfig.system_prompt)
                  : `${agentConfig.system_prompt}\n\n${content}`;
                await fs.writeFile(path.join(sandboxDir, file), interpolated);
              } else {
                await fs.copyFile(
                  path.join(this.templatesDir, file),
                  path.join(sandboxDir, file)
                );
              }
            },
            catch: (error) =>
              new AdapterError(
                `Failed to copy template ${file}: ${String(error)}`,
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

      // Interpolate placeholders
      const model = (agentConfig.metadata?.model as string) || 'openrouter/openai/gpt-5.3-codex';
      const openrouterKey = process.env.OPENROUTER_KEY || '';
      
      const interpolated = configTemplate
        .replace(/\$\{PORT\}/g, String(port))
        .replace(/\$\{MODEL\}/g, model)
        .replace(/\$\{OPENROUTER_KEY\}/g, openrouterKey);

      // Write interpolated config
      yield* _(
        Effect.tryPromise({
          try: () => fs.writeFile(path.join(sandboxDir, 'config.json'), interpolated),
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
   * Get command to start nullclaw
   */
  getStartCommand(sandbox: SandboxInfo): string[] {
    return ['nullclaw', 'gateway'];
  }

  /**
   * Get environment variables for nullclaw process
   */
  getEnvironment(sandbox: SandboxInfo): Record<string, string> {
    return {
      ...process.env,
      NULLCLAW_HOME: sandbox.sandboxDir,
    } as Record<string, string>;
  }

  /**
   * Start a nullclaw agent via CLI
   */
  startAgent(
    runId: string,
    agentConfig: AgentConfig
  ): Effect.Effect<AgentInstance, AdapterError> {
    return Effect.gen(this, function* (_) {
      logger.info({ agentId: agentConfig.id }, "Starting nullclaw agent");

      // Create sandbox
      const sandbox = yield* _(this.createSandbox(runId, agentConfig));

      // Get command and environment
      const command = this.getStartCommand(sandbox);
      const env = this.getEnvironment(sandbox);

      // Spawn nullclaw process
      const childProcess = yield* _(
        Effect.try({
          try: () => {
            const proc = spawn(command[0], command.slice(1), {
              env,
              stdio: 'pipe',
              detached: false,
            });

            proc.stdout?.on('data', (data) => {
              logger.debug({ agentId: agentConfig.id, output: data.toString().trim() }, 'nullclaw stdout');
            });

            proc.stderr?.on('data', (data) => {
              logger.debug({ agentId: agentConfig.id, output: data.toString().trim() }, 'nullclaw stderr');
            });

            proc.on('error', (error) => {
              logger.error({ agentId: agentConfig.id, error }, 'nullclaw process error');
            });

            proc.on('exit', (code, signal) => {
              logger.info({ agentId: agentConfig.id, code, signal }, 'nullclaw process exited');
            });

            return proc;
          },
          catch: (error) =>
            new AdapterError(
              `Failed to spawn nullclaw process: ${String(error)}`,
              this.agentType,
              error
            ),
        })
      );

      // Wait for nullclaw to be ready
      yield* _(Effect.sleep("5 seconds"));

      const instance: AgentInstance = {
        agentId: agentConfig.id,
        url: sandbox.url,
        sandbox: {
          ...sandbox,
          pid: childProcess.pid,
        },
        metadata: {
          pid: childProcess.pid,
          sandboxDir: sandbox.sandboxDir,
          agentType: this.agentType,
        },
      };

      this.instances.set(agentConfig.id, instance);

      logger.info(
        {
          agentId: agentConfig.id,
          url: instance.url,
          pid: childProcess.pid,
          sandboxDir: sandbox.sandboxDir,
        },
        "NullClaw agent started"
      );

      return instance;
    });
  }

  /**
   * Stop a nullclaw agent
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

      const pid = instance.sandbox.pid;
      if (pid) {
        yield* _(
          Effect.try({
            try: () => {
              process.kill(pid, 'SIGTERM');
            },
            catch: (error) =>
              new AdapterError(
                `Failed to kill process: ${String(error)}`,
                this.agentType,
                error
              ),
          })
        );
      }

      this.instances.delete(agentId);
      logger.info({ agentId, pid }, "NullClaw agent stopped");
    });
  }

  /**
   * Execute task via nullclaw CLI
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

      const sandboxDir = instance.sandbox.sandboxDir;
      logger.info({ agentId, sandboxDir }, "Executing task via nullclaw CLI");

      // Combine system and user prompts
      const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;

      // Execute nullclaw agent command
      const result = yield* _(
        Effect.tryPromise({
          try: () =>
            new Promise<string>((resolve, reject) => {
              const proc = spawn('nullclaw', ['agent', '-m', combinedPrompt], {
                cwd: sandboxDir,
                env: {
                  ...process.env,
                  NULLCLAW_HOME: sandboxDir,
                },
                stdio: 'pipe',
              });

              let stdout = '';
              let stderr = '';

              proc.stdout?.on('data', (data) => {
                stdout += data.toString();
              });

              proc.stderr?.on('data', (data) => {
                stderr += data.toString();
              });

              proc.on('close', (code) => {
                if (code === 0) {
                  resolve(stdout);
                } else {
                  reject(new Error(`nullclaw exited with code ${code}: ${stderr}`));
                }
              });

              proc.on('error', (error) => {
                reject(error);
              });
            }),
          catch: (error) =>
            new AdapterError(
              `Failed to execute nullclaw: ${String(error)}`,
              this.agentType,
              error
            ),
        })
      );

      logger.info({ agentId }, "Task completed via CLI");

      return {
        content: result.trim(),
        metadata: {
          method: 'cli',
          sandboxDir,
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

      logger.info({ count: agentIds.length }, "All NullClaw agents stopped");
    });
  }
}

/**
 * Create a nullclaw adapter
 */
export const createNullClawAdapter = (): NullClawAdapter => {
  return new NullClawAdapter();
};
