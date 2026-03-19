/**
 * ZeroClaw Adapter
 * Handles zeroclaw agents (Rust binary, <5MB RAM, zero overhead)
 * Runs via CLI with ZEROCLAW_HOME for sandbox isolation
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

export class ZeroClawAdapter implements AgentAdapter {
  readonly agentType = "zeroclaw";
  
  private instances = new Map<string, AgentInstance>();
  private readonly basePort = 42617; // ZeroClaw default port
  private portCounter = 0;
  private readonly templatesDir = path.join(__dirname, "defaults");

  /**
   * Create sandbox directory with zeroclaw config
   */
  createSandbox(
    runId: string,
    agentConfig: AgentConfig
  ): Effect.Effect<SandboxInfo, AdapterError> {
    return Effect.gen(this, function* (_) {
      const sandboxDir = `${SANDBOX_BASE_PATH}/run-${runId}/${agentConfig.id}/.${this.agentType}`;
      const port = this.basePort + this.portCounter++;

      logger.info({ agentId: agentConfig.id, sandboxDir }, "Creating zeroclaw sandbox");

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

      // Load and interpolate config.toml template
      const configTemplate = yield* _(
        Effect.tryPromise({
          try: () => fs.readFile(path.join(this.templatesDir, 'config.toml'), 'utf-8'),
          catch: (error) =>
            new AdapterError(
              `Failed to read config template: ${String(error)}`,
              this.agentType,
              error
            ),
        })
      );

      // Interpolate placeholders
      const model = (agentConfig.metadata?.model as string) || 'openrouter/openai-codex5.3';
      const openrouterKey = process.env.OPENROUTER_KEY || '';
      
      const interpolated = configTemplate
        .replace(/\$\{PORT\}/g, String(port))
        .replace(/\$\{MODEL\}/g, model);

      // Write interpolated config
      yield* _(
        Effect.tryPromise({
          try: () => fs.writeFile(path.join(sandboxDir, 'config.toml'), interpolated),
          catch: (error) =>
            new AdapterError(
              `Failed to write config.toml: ${String(error)}`,
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
   * Get command to start zeroclaw
   */
  getStartCommand(sandbox: SandboxInfo): string[] {
    return ['zeroclaw', 'gateway'];
  }

  /**
   * Get environment variables for zeroclaw process
   */
  getEnvironment(sandbox: SandboxInfo): Record<string, string> {
    return {
      ...process.env,
      ZEROCLAW_HOME: sandbox.sandboxDir,
      OPENROUTER_API_KEY: process.env.OPENROUTER_KEY || '',
    } as Record<string, string>;
  }

  /**
   * Start a zeroclaw agent via CLI
   */
  startAgent(
    runId: string,
    agentConfig: AgentConfig
  ): Effect.Effect<AgentInstance, AdapterError> {
    return Effect.gen(this, function* (_) {
      logger.info({ agentId: agentConfig.id }, "Starting zeroclaw agent");

      // Create sandbox
      const sandbox = yield* _(this.createSandbox(runId, agentConfig));

      // Get command and environment
      const command = this.getStartCommand(sandbox);
      const env = this.getEnvironment(sandbox);

      // Spawn zeroclaw process
      const childProcess = yield* _(
        Effect.try({
          try: () => {
            const proc = spawn(command[0], command.slice(1), {
              env,
              stdio: 'pipe',
              detached: false,
            });

            proc.stdout?.on('data', (data) => {
              logger.debug({ agentId: agentConfig.id, output: data.toString().trim() }, 'zeroclaw stdout');
            });

            proc.stderr?.on('data', (data) => {
              logger.debug({ agentId: agentConfig.id, output: data.toString().trim() }, 'zeroclaw stderr');
            });

            proc.on('error', (error) => {
              logger.error({ agentId: agentConfig.id, error }, 'zeroclaw process error');
            });

            proc.on('exit', (code, signal) => {
              logger.info({ agentId: agentConfig.id, code, signal }, 'zeroclaw process exited');
            });

            return proc;
          },
          catch: (error) =>
            new AdapterError(
              `Failed to spawn zeroclaw process: ${String(error)}`,
              this.agentType,
              error
            ),
        })
      );

      // Wait for zeroclaw to be ready
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
        "ZeroClaw agent started"
      );

      return instance;
    });
  }

  /**
   * Stop a zeroclaw agent
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
      logger.info({ agentId, pid }, "ZeroClaw agent stopped");
    });
  }

  /**
   * Execute task via zeroclaw CLI
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
      logger.info({ agentId, sandboxDir }, "Executing task via zeroclaw CLI");

      // Combine system and user prompts
      const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;

      // Execute zeroclaw agent command
      const result = yield* _(
        Effect.tryPromise({
          try: () =>
            new Promise<string>((resolve, reject) => {
              const proc = spawn('zeroclaw', ['agent', '-m', combinedPrompt], {
                cwd: sandboxDir,
                env: {
                  ...process.env,
                  ZEROCLAW_HOME: sandboxDir,
                  OPENROUTER_API_KEY: process.env.OPENROUTER_KEY || '',
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
                  reject(new Error(`zeroclaw exited with code ${code}: ${stderr}`));
                }
              });

              proc.on('error', (error) => {
                reject(error);
              });
            }),
          catch: (error) =>
            new AdapterError(
              `Failed to execute zeroclaw: ${String(error)}`,
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

      logger.info({ count: agentIds.length }, "All ZeroClaw agents stopped");
    });
  }
}

/**
 * Create a zeroclaw adapter
 */
export const createZeroClawAdapter = (): ZeroClawAdapter => {
  return new ZeroClawAdapter();
};
