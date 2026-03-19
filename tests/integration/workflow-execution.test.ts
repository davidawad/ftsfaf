import { describe, it, expect, beforeAll } from "vitest";
import { Effect } from "effect";
import { InMemoryDatabaseLayer } from "../../src/runtime/db/layer.js";
import {
  loadAllConfigs,
  loadTask,
} from "../../src/config/loader.js";
import { executeWorkflow } from "../../src/runtime/executor.js";
import { adapterRegistry } from "../../src/adapters/registry.js";
import type { AgentAdapter, AgentTaskResult } from "../../src/adapters/base.js";

// Mock adapter for integration testing
class MockIntegrationAdapter implements AgentAdapter {
  private running = new Set<string>();

  startAgent = (runId: string) =>
    Effect.gen(this, function* (_) {
      // Simulate agent startup
      yield* _(Effect.sleep("10 millis"));
      this.running.add(runId);
    });

  stopAgent = (agentId: string) =>
    Effect.gen(this, function* (_) {
      // Simulate agent shutdown
      yield* _(Effect.sleep("10 millis"));
      this.running.delete(agentId);
    });

  executeTask = (
    _agentId: string,
    _systemPrompt: string,
    userPrompt: string,
    _timeoutSeconds: number
  ) =>
    Effect.gen(this, function* (_) {
      // Simulate task execution with delay
      yield* _(Effect.sleep("50 millis"));

      // Generate mock response based on prompt
      const result: AgentTaskResult = {
        content: `Completed: ${userPrompt.substring(0, 50)}...`,
        metadata: {
          model: "mock-model",
          tokensUsed: 100,
        },
      };

      return result;
    });

  isRunning = (agentId: string) => this.running.has(agentId);
}

describe("Workflow Execution Integration", () => {
  beforeAll(() => {
    // Register mock adapter for integration tests
    if (!adapterRegistry.has("a2a")) {
      adapterRegistry.register("a2a", new MockIntegrationAdapter());
    }
  });

  it("should execute a simple linear workflow", async () => {
    const program = Effect.gen(function* (_) {
      // Load configurations
      const { config, skills, agents, workflows } = yield* _(
        loadAllConfigs("./tests/fixtures/test.config.json")
      );

      // Load task
      const task = yield* _(
        loadTask("./tests/fixtures/tasks/example-task.json")
      );

      // Get workflow
      const workflow = workflows.get(task.workflow);
      if (!workflow) {
        return yield* _(
          Effect.fail(new Error(`Workflow not found: ${task.workflow}`))
        );
      }

      // Get database from context (will be provided by layer)
      const { DatabaseService } = await import("../../src/runtime/db/layer.js");
      const db = yield* _(DatabaseService);

      // Execute workflow
      const run = yield* _(
        executeWorkflow(
          db,
          workflow,
          task,
          agents,
          skills,
          config.default_system_prompt
        )
      );

      expect(run).toBeDefined();
      expect(run.status).toBe("completed");
      expect(run.workflow_id).toBe(task.workflow);
      expect(run.task_id).toBe(task.id);

      return run;
    });

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(InMemoryDatabaseLayer))
    );

    expect(result.status).toBe("completed");
  }, 30000); // Increase timeout for integration test

  it("should handle workflow with dependencies", async () => {
    const program = Effect.gen(function* (_) {
      const { config, skills, agents, workflows } = yield* _(
        loadAllConfigs("./tests/fixtures/test.config.json")
      );

      // Find a workflow with multiple steps
      const featureDevWorkflow = workflows.get("feature-dev");
      if (!featureDevWorkflow) {
        return yield* _(
          Effect.fail(new Error("feature-dev workflow not found"))
        );
      }

      // Create a test task
      const task = {
        id: "integration-test-001",
        workflow: "feature-dev",
        input: "Build a user authentication system",
        metadata: {},
      };

      const { DatabaseService } = await import("../../src/runtime/db/layer.js");
      const db = yield* _(DatabaseService);

      const run = yield* _(
        executeWorkflow(
          db,
          featureDevWorkflow,
          task,
          agents,
          skills,
          config.default_system_prompt
        )
      );

      expect(run).toBeDefined();
      expect(run.status).toBe("completed");

      return run;
    });

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(InMemoryDatabaseLayer))
    );

    expect(result).toBeDefined();
  }, 30000);

  it("should create artifacts for each step", async () => {
    const program = Effect.gen(function* (_) {
      const { config, skills, agents, workflows } = yield* _(
        loadAllConfigs("./tests/fixtures/test.config.json")
      );

      const task = yield* _(
        loadTask("./tests/fixtures/tasks/example-task.json")
      );

      const workflow = workflows.get(task.workflow);
      if (!workflow) {
        return yield* _(Effect.fail(new Error("Workflow not found")));
      }

      const { DatabaseService } = await import("../../src/runtime/db/layer.js");
      const db = yield* _(DatabaseService);

      const run = yield* _(
        executeWorkflow(db, workflow, task, agents, skills, config.default_system_prompt)
      );

      // Get run details with artifacts
      const { getRunDetails } = await import(
        "../../src/runtime/db/operations.js"
      );
      const details = yield* _(getRunDetails(db, run.id));

      // Should have artifacts for each completed step
      expect(details.artifacts.length).toBeGreaterThan(0);
      expect(details.steps.length).toBeGreaterThan(0);

      // Each step should have a corresponding artifact
      const completedSteps = details.steps.filter(
        (s) => s.status === "completed"
      );
      expect(details.artifacts.length).toBe(completedSteps.length);

      return details;
    });

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(InMemoryDatabaseLayer))
    );

    expect(result.artifacts).toBeDefined();
  }, 30000);

  it("should handle workflow validation errors", async () => {
    const program = Effect.gen(function* (_) {
      const { config, skills, agents } = yield* _(
        loadAllConfigs("./tests/fixtures/test.config.json")
      );

      // Create an invalid workflow (cycle without max_iterations)
      const invalidWorkflow = {
        id: "invalid-workflow",
        name: "Invalid Workflow",
        steps: [
          {
            id: "step1",
            agent: "swe-agent",
            skill: "coding",
            user_prompt: "Do step 1",
            depends_on: ["step2"], // Circular dependency
          },
          {
            id: "step2",
            agent: "swe-agent",
            skill: "coding",
            user_prompt: "Do step 2",
            depends_on: ["step1"], // Circular dependency
          },
        ],
        output: {
          type: "string",
          source: "step2",
        },
      };

      const task = {
        id: "test-task",
        workflow: "invalid-workflow",
        input: "Test input",
        metadata: {},
      };

      const { DatabaseService } = await import("../../src/runtime/db/layer.js");
      const db = yield* _(DatabaseService);

      // This should fail during validation
      return yield* _(
        executeWorkflow(
          db,
          invalidWorkflow as any,
          task,
          agents,
          skills,
          config.default_system_prompt
        )
      );
    });

    const result = await Effect.runPromiseExit(
      program.pipe(Effect.provide(InMemoryDatabaseLayer))
    );

    expect(result._tag).toBe("Failure");
  }, 10000);

  it("should track step execution order", async () => {
    const program = Effect.gen(function* (_) {
      const { config, skills, agents, workflows } = yield* _(
        loadAllConfigs("./tests/fixtures/test.config.json")
      );

      const task = yield* _(
        loadTask("./tests/fixtures/tasks/example-task.json")
      );

      const workflow = workflows.get(task.workflow);
      if (!workflow) {
        return yield* _(Effect.fail(new Error("Workflow not found")));
      }

      const { DatabaseService } = await import("../../src/runtime/db/layer.js");
      const db = yield* _(DatabaseService);

      const run = yield* _(
        executeWorkflow(db, workflow, task, agents, skills, config.default_system_prompt)
      );

      const { getStepExecutions } = await import(
        "../../src/runtime/db/operations.js"
      );
      const steps = yield* _(getStepExecutions(db, run.id));

      // Verify steps were executed
      expect(steps.length).toBeGreaterThan(0);

      // Check that completed steps have timing information
      steps.forEach((step) => {
        if (step.status === "completed") {
          expect(step.started_at).toBeGreaterThan(0);
          expect(step.completed_at).toBeGreaterThan(0);
          expect(step.completed_at).toBeGreaterThanOrEqual(step.started_at!);
        }
      });

      return steps;
    });

    const steps = await Effect.runPromise(
      program.pipe(Effect.provide(InMemoryDatabaseLayer))
    );

    expect(steps).toBeDefined();
  }, 30000);
});
