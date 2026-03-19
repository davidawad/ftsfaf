import { Effect } from "effect";
import type { Database } from "sql.js";
import * as fs from "fs/promises";
import * as path from "path";
import dotenv from "dotenv";
import { validateWorkflow, checkSkillCapacity } from "../graph/validate.js";
import type { Workflow, AgentConfig, Task, Skill } from "../config/schema.js";
import {
  createRun,
  updateRunStatus,
  updateRunOutput,
  createStepExecution,
  updateStepStatus,
  saveArtifact,
  getRunDetails,
  type Run,
} from "./db/operations.js";
import { buildContext, interpolate } from "../prompts/interpolate.js";
import { getAgentSystemPrompt } from "../prompts/loader.js";
import { adapterRegistry } from "../adapters/registry.js";
import type { AdapterError } from "../adapters/base.js";
import { logger } from "../utils/logger.js";
import { SANDBOX_BASE_PATH, OUTPUTS_PATH } from "../utils/constants.js";

// ---------------------------------------------------------------------------
// Artifact folder path tracking helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the workspace dir (folder artifact host path) a step should use.
 * Returns `undefined` if the step does not consume any folder artifacts.
 */
function resolveWorkspaceDir(
  step: Workflow["steps"][number],
  artifactFolderPaths: Map<string, string>
): string | undefined {
  const consumed = step.consumes_artifacts ?? [];
  for (const artifactId of consumed) {
    const p = artifactFolderPaths.get(artifactId);
    if (p) return p;           // use first matched folder artifact
  }
  return undefined;
}

/**
 * Build a patched AgentConfig with workspaceDir injected into metadata.
 * This is used to pass the resolved artifact folder path to adapters that
 * need it (e.g., OpenHands) without mutating the original config.
 */
function withWorkspaceDir(
  agentConfig: AgentConfig,
  workspaceDir: string
): AgentConfig {
  return {
    ...agentConfig,
    metadata: {
      ...(agentConfig.metadata ?? {}),
      workspaceDir,
    },
  };
}

/**
 * Build a patched AgentConfig with task-level env vars injected into metadata.
 * The adapter reads `metadata.envVars` and forwards them into the container environment.
 */
function withEnvVars(
  agentConfig: AgentConfig,
  envVars: Record<string, string>
): AgentConfig {
  if (Object.keys(envVars).length === 0) return agentConfig;
  return {
    ...agentConfig,
    metadata: {
      ...(agentConfig.metadata ?? {}),
      envVars,
    },
  };
}

/**
 * Read and parse one or more .env-format files from disk, merging them into
 * a single flat Record<string, string>.
 *
 * - Paths are resolved relative to CWD at the time of the call.
 * - Missing or unreadable files are skipped with a warning (not a fatal error).
 * - Later files override keys from earlier files.
 */
async function loadEnvFiles(envFilePaths: readonly string[]): Promise<Record<string, string>> {
  const merged: Record<string, string> = {};
  for (const filePath of envFilePaths) {
    const resolved = path.resolve(filePath);
    try {
      const content = await fs.readFile(resolved, "utf-8");
      const parsed = dotenv.parse(content);
      const count = Object.keys(parsed).length;
      Object.assign(merged, parsed);
      logger.info({ path: resolved, count }, "Loaded env_file");
    } catch {
      logger.warn({ path: resolved }, "env_file not found or unreadable — skipping");
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// validateWorkflowInputs
// ---------------------------------------------------------------------------

/**
 * Verify that all required workflow inputs declared in `workflow.inputs`
 * are present and well-formed in `task.inputs`.
 * Throws a descriptive Error on the first violation.
 */
function validateWorkflowInputs(workflow: Workflow, task: Task): void {
  const declaredInputs = workflow.inputs ?? [];
  if (declaredInputs.length === 0) return;

  for (const inputDef of declaredInputs) {
    const isRequired = inputDef.required !== false; // default: required
    const provided = task.inputs?.[inputDef.id];

    if (!provided) {
      if (isRequired) {
        throw new Error(
          `Workflow '${workflow.id}' requires input artifact '${inputDef.id}' ` +
            `(${inputDef.type}) but it was not provided in the task. ` +
            `Add an "inputs" object to your task.json with key '${inputDef.id}'.`
        );
      }
      continue;
    }

    // Type check
    if (provided.type !== inputDef.type) {
      throw new Error(
        `Workflow input '${inputDef.id}' declared as type '${inputDef.type}' ` +
          `but task supplied type '${provided.type}'.`
      );
    }

    // Folder/file/git_repo inputs must supply a path
    if (
      (inputDef.type === "folder" || inputDef.type === "file" || inputDef.type === "git_repo") &&
      !provided.path
    ) {
      throw new Error(
        `Workflow input '${inputDef.id}' is of type '${inputDef.type}' ` +
          `and requires a 'path' field, but none was provided.`
      );
    }

    // Text inputs must supply content or path
    if (inputDef.type === "text" && !provided.content && !provided.path) {
      throw new Error(
        `Workflow input '${inputDef.id}' is of type 'text' ` +
          `and requires either a 'content' or 'path' field, but neither was provided.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// executeStep
// ---------------------------------------------------------------------------

const executeStep = (
  db: Database,
  workflow: Workflow,
  stepId: string,
  task: Task,
  runId: string,
  iteration: number,
  artifacts: Record<string, string>,
  artifactFolderPaths: Map<string, string>,
  startedAgentIds: Set<string>,
  agents: Map<string, AgentConfig>,
  taskEnvVars: Record<string, string>,
  globalDefaultPrompt?: string
): Effect.Effect<string, Error> =>
  Effect.gen(function* (_) {
    const step = workflow.steps.find((s) => s.id === stepId);
    if (!step) {
      return yield* _(Effect.fail(new Error(`Step not found: ${stepId}`)));
    }

    const agentConfig = agents.get(step.agent);
    if (!agentConfig) {
      return yield* _(Effect.fail(new Error(`Agent not found: ${step.agent}`)));
    }

    // ------------------------------------------------------------------
    // Resolve workspace dir for folder-artifact-consuming steps
    // ------------------------------------------------------------------
    const workspaceDir = resolveWorkspaceDir(step, artifactFolderPaths);

    // Build the effective agent config (with workspaceDir + env vars injected)
    let effectiveAgentConfig: AgentConfig =
      workspaceDir ? withWorkspaceDir(agentConfig, workspaceDir) : agentConfig;
    effectiveAgentConfig = withEnvVars(effectiveAgentConfig, taskEnvVars);

    // ------------------------------------------------------------------
    // Start agent if not already running (lazy per-step startup)
    // ------------------------------------------------------------------
    const adapter = adapterRegistry.get(agentConfig.agentType);
    if (!adapter) {
      return yield* _(
        Effect.fail(
          new Error(
            `No adapter registered for agent type: ${agentConfig.agentType}. ` +
              `Available: ${adapterRegistry.getAgentTypes().join(", ")}`
          )
        )
      );
    }

    if (!adapter.isRunning(agentConfig.id)) {
      logger.info(
        { agentId: agentConfig.id, agentType: agentConfig.agentType, stepId },
        "Starting agent for step"
      );
      yield* _(
        adapter.startAgent(runId, effectiveAgentConfig).pipe(
          Effect.mapError((e: AdapterError) => new Error(e.message))
        )
      );
      startedAgentIds.add(agentConfig.id);
    }

    // ------------------------------------------------------------------
    // Create step execution record
    // ------------------------------------------------------------------
    const stepExecution = yield* _(
      createStepExecution(db, runId, stepId, iteration)
    );
    yield* _(updateStepStatus(db, stepExecution.id, "running"));

    try {
      // Build interpolation context
      const context = buildContext(
        task as unknown as Record<string, unknown>,
        artifacts,
        runId,
        stepId,
        iteration
      );

      const userPrompt = yield* _(interpolate(step.user_prompt, context));
      const systemPrompt = yield* _(
        getAgentSystemPrompt(agentConfig.system_prompt, globalDefaultPrompt)
      );

      logger.info(
        { agentId: agentConfig.id, agentType: agentConfig.agentType, stepId },
        "Executing agent task"
      );

      const result = yield* _(
        adapter.executeTask(agentConfig.id, systemPrompt, userPrompt, 30).pipe(
          Effect.mapError((e: AdapterError) => new Error(e.message))
        )
      );

      // ------------------------------------------------------------------
      // Handle produced folder artifact
      // ------------------------------------------------------------------
      if (step.produces_artifact) {
        const produced = step.produces_artifact;
        if (produced.type === "folder") {
          // The workspace dir is the produced artifact folder.
          // It may have been passed in (from a consumed artifact) or live in
          // the result metadata (from the adapter).
          const producedPath =
            (result.metadata?.workspaceDir as string | undefined) ??
            workspaceDir ??
            path.join(SANDBOX_BASE_PATH, `run-${runId}`, "artifacts", produced.id);

          artifactFolderPaths.set(produced.id, producedPath);
          logger.info(
            { stepId, artifactId: produced.id, path: producedPath },
            "Folder artifact produced"
          );

          // Save folder artifact reference to DB
          yield* _(
            saveArtifact(db, runId, stepId, iteration, {
              storage_type: "filesystem",
              file_path: producedPath,
              file_size: 0, // approximate — don't stat the whole dir
              file_checksum: null,
            })
          );
        } else if (produced.type === "text") {
          // Save inline text artifact
          yield* _(
            saveArtifact(db, runId, stepId, iteration, {
              storage_type: "inline",
              mime_type: "text/plain",
              content: result.content,
            })
          );
        } else {
          // Generic inline fallback
          yield* _(
            saveArtifact(db, runId, stepId, iteration, {
              storage_type: "inline",
              mime_type: "text/plain",
              content: result.content,
            })
          );
        }
      } else {
        // Original behaviour — save inline
        yield* _(
          saveArtifact(db, runId, stepId, iteration, {
            storage_type: "inline",
            mime_type: "text/plain",
            content: result.content,
          })
        );
      }

      const output = result.content;
      yield* _(updateStepStatus(db, stepExecution.id, "completed"));
      return output;
    } catch (error) {
      yield* _(
        updateStepStatus(db, stepExecution.id, "failed", String(error))
      );

      if (step.on_fail && iteration < (step.on_fail.max_iterations ?? 0)) {
        logger.info(
          { stepId, iteration, routeTo: step.on_fail.route_to },
          "Step failed, retrying"
        );
        artifacts[step.on_fail.inject_artifact ?? "failure_feedback"] = String(error);
        return yield* _(
          executeStep(
            db,
            workflow,
            step.on_fail.route_to,
            task,
            runId,
            iteration + 1,
            artifacts,
            artifactFolderPaths,
            startedAgentIds,
            agents,
            taskEnvVars,
            globalDefaultPrompt
          )
        );
      }

      return yield* _(Effect.fail(error as Error));
    }
  });

// ---------------------------------------------------------------------------
// executeWorkflow
// ---------------------------------------------------------------------------

export const executeWorkflow = (
  db: Database,
  workflow: Workflow,
  task: Task,
  agents: Map<string, AgentConfig>,
  _skills: Map<string, Skill>,
  globalDefaultPrompt?: string
): Effect.Effect<Run, Error> =>
  Effect.gen(function* (_) {
    // ------------------------------------------------------------------
    // Validate workflow inputs (fail-fast before starting anything)
    // ------------------------------------------------------------------
    yield* _(
      Effect.try({
        try: () => validateWorkflowInputs(workflow, task),
        catch: (err) => new Error(String(err)),
      })
    );

    // ------------------------------------------------------------------
    // Validate DAG + skill capacity
    // ------------------------------------------------------------------
    const validated = yield* _(
      Effect.try({
        try: () => validateWorkflow(workflow),
        catch: (error) => new Error(`Workflow validation failed: ${String(error)}`),
      })
    );

    const agentSkills = new Map(
      Array.from(agents.entries()).map(([id, config]) => [id, config.skills])
    );
    yield* _(
      Effect.try({
        try: () => checkSkillCapacity(validated, agentSkills),
        catch: (error) => new Error(`Skill capacity check failed: ${String(error)}`),
      })
    );

    // ------------------------------------------------------------------
    // Create run
    // ------------------------------------------------------------------
    const run = yield* _(createRun(db, workflow.id, task.id));
    logger.info({ runId: run.id, workflowId: workflow.id }, "Starting run");
    yield* _(updateRunStatus(db, run.id, "running"));

    // ------------------------------------------------------------------
    // Build artifact folder path map from task inputs
    // ------------------------------------------------------------------
    const artifactFolderPaths = new Map<string, string>();
    if (task.inputs) {
      for (const [artifactId, inputVal] of Object.entries(task.inputs)) {
        if (
          (inputVal.type === "folder" || inputVal.type === "file" || inputVal.type === "git_repo") &&
          inputVal.path
        ) {
          artifactFolderPaths.set(artifactId, path.resolve(inputVal.path));
          logger.info(
            { artifactId, path: path.resolve(inputVal.path) },
            "Task input artifact registered"
          );
        }
      }
    }

    // Track which agents were started by this execution so we can stop them
    const startedAgentIds = new Set<string>();

    // Required agents map (for validation + cleanup)
    const requiredAgents = new Map<string, AgentConfig>();
    for (const step of workflow.steps) {
      const agentConfig = agents.get(step.agent);
      if (!agentConfig) {
        return yield* _(Effect.fail(new Error(`Agent ${step.agent} not found`)));
      }
      requiredAgents.set(step.agent, agentConfig);
    }

    logger.info(
      { agents: Array.from(requiredAgents.keys()) },
      "Required agents identified (will start lazily per step)"
    );

    // ------------------------------------------------------------------
    // Load env vars from task env_files (once, shared across all steps)
    // ------------------------------------------------------------------
    const taskEnvVars = yield* _(
      Effect.tryPromise({
        try: () => loadEnvFiles(task.env_files ?? []),
        catch: (err) => new Error(`Failed to load task env_files: ${String(err)}`),
      })
    );

    if (Object.keys(taskEnvVars).length > 0) {
      logger.info(
        { count: Object.keys(taskEnvVars).length, keys: Object.keys(taskEnvVars) },
        "Task env vars loaded — will be injected into every agent container"
      );
    }

    try {
      const artifacts: Record<string, string> = {};

      // Execute tiers in topological order
      for (const tier of validated.executionOrder) {
        logger.info({ tier }, "Executing tier");

        for (const stepId of tier) {
          logger.info({ stepId }, "Executing step");

          const output = yield* _(
            executeStep(
              db,
              workflow,
              stepId,
              task,
              run.id,
              0,
              artifacts,
              artifactFolderPaths,
              startedAgentIds,
              agents,
              taskEnvVars,
              globalDefaultPrompt
            )
          );

          artifacts[stepId] = output;
          logger.info({ stepId }, "Step completed");
        }
      }

      // ------------------------------------------------------------------
      // Capture final output from the designated step
      // ------------------------------------------------------------------
      const outputStepId = workflow.output.source;
      const finalOutput = artifacts[outputStepId];

      if (finalOutput) {
        const getFileExtension = (outputType: string): string => {
          switch (outputType) {
            case "string": return "txt";
            case "file":   return "txt";
            case "git_url": return "url";
            default:       return "txt";
          }
        };

        const fileExtension = getFileExtension(workflow.output.type);
        const runDir = path.join(SANDBOX_BASE_PATH, `run-${run.id}`);
        const outputFileName = `output.${fileExtension}`;
        const outputFilePath = path.join(runDir, outputFileName);

        yield* _(
          Effect.tryPromise({
            try: async () => {
              await fs.mkdir(runDir, { recursive: true });
              await fs.writeFile(outputFilePath, finalOutput, "utf-8");
            },
            catch: (error) => new Error(`Failed to write output file: ${String(error)}`),
          })
        );

        logger.info({ runId: run.id, outputFilePath }, "Output file written");

        yield* _(
          Effect.tryPromise({
            try: async () => {
              await fs.mkdir(OUTPUTS_PATH, { recursive: true });
            },
            catch: (error) => new Error(`Failed to create outputs directory: ${String(error)}`),
          })
        );

        const symlinkName = `${workflow.id}-${run.id}.${fileExtension}`;
        const symlinkPath = path.join(OUTPUTS_PATH, symlinkName);
        const latestSymlinkName = `${workflow.id}-latest.${fileExtension}`;
        const latestSymlinkPath = path.join(OUTPUTS_PATH, latestSymlinkName);

        yield* _(
          Effect.tryPromise({
            try: async () => {
              try { await fs.unlink(symlinkPath); } catch (_) { /* ignore */ }
              await fs.symlink(outputFilePath, symlinkPath);
              try { await fs.unlink(latestSymlinkPath); } catch (_) { /* ignore */ }
              await fs.symlink(outputFilePath, latestSymlinkPath);
            },
            catch: (error) => new Error(`Failed to create output symlinks: ${String(error)}`),
          })
        );

        yield* _(updateRunOutput(db, run.id, finalOutput, workflow.output.type, outputFilePath));
        logger.info({ runId: run.id, outputType: workflow.output.type }, "Final output captured");
      } else {
        logger.warn({ runId: run.id, outputStepId }, "Output step did not produce artifact");
      }

      yield* _(updateRunStatus(db, run.id, "completed"));
      logger.info({ runId: run.id }, "Run completed successfully");
      return run;
    } catch (error) {
      yield* _(updateRunStatus(db, run.id, "failed"));
      logger.error({ runId: run.id, error }, "Run failed");
      return yield* _(Effect.fail(error as Error));
    } finally {
      // Stop all agents that were started for this run
      logger.info({ count: startedAgentIds.size }, "Stopping agents");
      for (const agentId of startedAgentIds) {
        const agentConfig = requiredAgents.get(agentId);
        if (!agentConfig) continue;
        const adapter = adapterRegistry.get(agentConfig.agentType);
        if (adapter && adapter.isRunning(agentId)) {
          yield* _(
            adapter.stopAgent(agentId).pipe(
              Effect.mapError((e: AdapterError) => new Error(e.message)),
              Effect.catchAll((e) => {
                logger.warn({ agentId, error: e }, "Failed to stop agent");
                return Effect.void;
              })
            )
          );
        }
      }
      logger.info("All agents stopped");
    }
  });

// ---------------------------------------------------------------------------
// getRunResults
// ---------------------------------------------------------------------------

export const getRunResults = (
  db: Database,
  runId: string
): Effect.Effect<
  {
    readonly run: Run;
    readonly steps: readonly any[];
    readonly artifacts: readonly any[];
  },
  Error
> =>
  Effect.gen(function* (_) {
    const details = yield* _(getRunDetails(db, runId));
    return details;
  }).pipe(
    Effect.mapError((error) => new Error(`Failed to get run details: ${String(error)}`))
  );
