import { Effect } from "effect";
import type { Database } from "sql.js";
import * as fs from "fs/promises";
import * as path from "path";
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

/**
 * Execute a single workflow step
 */
const executeStep = (
  db: Database,
  workflow: Workflow,
  stepId: string,
  task: Task,
  runId: string,
  iteration: number,
  artifacts: Record<string, string>,
  agents: Map<string, AgentConfig>,
  globalDefaultPrompt?: string
): Effect.Effect<string, Error> =>
  Effect.gen(function* (_) {
    const step = workflow.steps.find((s) => s.id === stepId);
    if (!step) {
      return yield* _(
        Effect.fail(new Error(`Step not found: ${stepId}`))
      );
    }

    const agent = agents.get(step.agent);
    if (!agent) {
      return yield* _(
        Effect.fail(new Error(`Agent not found: ${step.agent}`))
      );
    }

    // Create step execution record
    const stepExecution = yield* _(
      createStepExecution(db, runId, stepId, iteration)
    );

    // Update status to running
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

      // Render user prompt
      const userPrompt = yield* _(interpolate(step.user_prompt, context));

      // Get system prompt
      const systemPrompt = yield* _(
        getAgentSystemPrompt(agent.system_prompt, globalDefaultPrompt)
      );

      // Get adapter for this agent's type
      const adapter = adapterRegistry.get(agent.agentType);
      if (!adapter) {
        return yield* _(
          Effect.fail(
            new Error(
              `No adapter registered for agent type: ${agent.agentType}. Available: ${adapterRegistry.getAgentTypes().join(", ")}`
            )
          )
        );
      }

      // Execute task with polling
      logger.info(
        { agentId: agent.id, agentType: agent.agentType },
        "Executing agent task"
      );

      const result = yield* _(
        adapter.executeTask(agent.id, systemPrompt, userPrompt, 30).pipe(
          Effect.mapError((e: AdapterError) => new Error(e.message))
        )
      );

      // Save artifact
      yield* _(
        saveArtifact(db, runId, stepId, iteration, {
          storage_type: "inline",
          mime_type: "text/plain",
          content: result.content,
        })
      );

      const output = result.content;

      // Update step status to completed
      yield* _(updateStepStatus(db, stepExecution.id, "completed"));

      return output;
    } catch (error) {
      // Update step status to failed
      yield* _(
        updateStepStatus(db, stepExecution.id, "failed", String(error))
      );

      // Check if we should retry
      if (step.on_fail && iteration < (step.on_fail.max_iterations ?? 0)) {
        logger.info({
          stepId,
          iteration,
          routeTo: step.on_fail.route_to,
        }, "Step failed, retrying");

        // Add failure feedback to artifacts
        artifacts[step.on_fail.inject_artifact ?? "failure_feedback"] =
          String(error);

        // Retry by executing the route_to step
        return yield* _(
          executeStep(
            db,
            workflow,
            step.on_fail.route_to,
            task,
            runId,
            iteration + 1,
            artifacts,
            agents,
            globalDefaultPrompt
          )
        );
      }

      return yield* _(Effect.fail(error as Error));
    }
  });

/**
 * Execute a complete workflow
 */
export const executeWorkflow = (
  db: Database,
  workflow: Workflow,
  task: Task,
  agents: Map<string, AgentConfig>,
  _skills: Map<string, Skill>,
  globalDefaultPrompt?: string
): Effect.Effect<Run, Error> =>
  Effect.gen(function* (_) {
    // Validate workflow
    const validated = yield* _(
      Effect.try({
        try: () => validateWorkflow(workflow),
        catch: (error) => new Error(`Workflow validation failed: ${String(error)}`),
      })
    );

    // Check skill capacity
    // Transform Map<string, AgentConfig> to Map<string, string[]>
    const agentSkills = new Map(
      Array.from(agents.entries()).map(([id, config]) => [id, config.skills])
    );
    
    yield* _(
      Effect.try({
        try: () => checkSkillCapacity(validated, agentSkills),
        catch: (error) => new Error(`Skill capacity check failed: ${String(error)}`),
      })
    );

    // Create run
    const run = yield* _(createRun(db, workflow.id, task.id));
    logger.info({ runId: run.id, workflowId: workflow.id }, "Starting run");

    yield* _(updateRunStatus(db, run.id, "running"));

    // Collect unique agent IDs and tool types needed for this workflow
    const requiredAgents = new Map<string, AgentConfig>();
    for (const step of workflow.steps) {
      const agentConfig = agents.get(step.agent);
      if (!agentConfig) {
        return yield* _(
          Effect.fail(new Error(`Agent ${step.agent} not found`))
        );
      }
      requiredAgents.set(step.agent, agentConfig);
    }

    // Start all required agents
    logger.info(
      { agents: Array.from(requiredAgents.keys()) },
      "Starting required agents"
    );

    for (const [agentId, agentConfig] of requiredAgents) {
      const adapter = adapterRegistry.get(agentConfig.agentType);
      if (!adapter) {
        return yield* _(
          Effect.fail(
            new Error(
              `No adapter registered for agent type: ${agentConfig.agentType}`
            )
          )
        );
      }

      // Check if agent is already running
      if (!adapter.isRunning(agentId)) {
        logger.info({ agentId, agentType: agentConfig.agentType }, "Starting agent");
        yield* _(
          adapter.startAgent(run.id, agentConfig).pipe(
            Effect.mapError((e: AdapterError) => new Error(e.message))
          )
        );
      } else {
        logger.info({ agentId }, "Agent already running");
      }
    }

    logger.info("All agents started, beginning workflow execution");

    try {
      const artifacts: Record<string, string> = {};

      // Execute tiers in topological order
      for (const tier of validated.executionOrder) {
        logger.info({ tier }, "Executing tier");

        // Execute all steps in this tier (could be parallel, but sequential for now)
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
              agents,
              globalDefaultPrompt
            )
          );

          artifacts[stepId] = output;
          logger.info({ stepId }, "Step completed");
        }
      }

      // Capture final output from the designated step
      const outputStepId = workflow.output.source;
      const finalOutput = artifacts[outputStepId];
      
      if (finalOutput) {
        // Determine file extension based on output type
        const getFileExtension = (outputType: string): string => {
          switch (outputType) {
            case "string":
              return "txt";
            case "file":
              return "txt";
            case "git_url":
              return "url";
            default:
              return "txt";
          }
        };

        const fileExtension = getFileExtension(workflow.output.type);
        
        // Write output to file in run directory
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

        // Create outputs directory if it doesn't exist
        yield* _(
          Effect.tryPromise({
            try: async () => {
              await fs.mkdir(OUTPUTS_PATH, { recursive: true });
            },
            catch: (error) => new Error(`Failed to create outputs directory: ${String(error)}`),
          })
        );

        // Create symlinks in outputs directory
        const symlinkName = `${workflow.id}-${run.id}.${fileExtension}`;
        const symlinkPath = path.join(OUTPUTS_PATH, symlinkName);
        const latestSymlinkName = `${workflow.id}-latest.${fileExtension}`;
        const latestSymlinkPath = path.join(OUTPUTS_PATH, latestSymlinkName);

        yield* _(
          Effect.tryPromise({
            try: async () => {
              // Remove existing symlink if it exists
              try {
                await fs.unlink(symlinkPath);
              } catch (e) {
                // Ignore if symlink doesn't exist
              }
              
              // Create new symlink
              await fs.symlink(outputFilePath, symlinkPath);
              
              // Update latest symlink
              try {
                await fs.unlink(latestSymlinkPath);
              } catch (e) {
                // Ignore if symlink doesn't exist
              }
              
              await fs.symlink(outputFilePath, latestSymlinkPath);
            },
            catch: (error) => new Error(`Failed to create output symlinks: ${String(error)}`),
          })
        );

        logger.info(
          { 
            runId: run.id, 
            symlinkPath, 
            latestSymlinkPath 
          }, 
          "Output symlinks created"
        );

        // Update database with output and file path
        yield* _(updateRunOutput(db, run.id, finalOutput, workflow.output.type, outputFilePath));
        logger.info({ runId: run.id, outputType: workflow.output.type }, "Final output captured");
      } else {
        logger.warn({ runId: run.id, outputStepId }, "Output step did not produce artifact");
      }

      // Mark run as completed
      yield* _(updateRunStatus(db, run.id, "completed"));
      logger.info({ runId: run.id }, "Run completed successfully");

      return run;
    } catch (error) {
      yield* _(updateRunStatus(db, run.id, "failed"));
      logger.error({ runId: run.id, error }, "Run failed");
      return yield* _(Effect.fail(error as Error));
    } finally {
      // Stop all agents that were started for this run
      logger.info("Stopping agents");
      for (const [agentId, agentConfig] of requiredAgents) {
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

/**
 * Get full run results
 */
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
