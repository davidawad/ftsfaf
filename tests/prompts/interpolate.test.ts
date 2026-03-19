import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import {
  interpolate,
  buildContext,
  interpolateAll,
  InterpolationError,
  type InterpolationContext,
} from "../../src/prompts/interpolate.js";

describe("Prompt Interpolation", () => {
  const mockContext: InterpolationContext = {
    task: {
      id: "task-001",
      workflow: "feature-dev",
      input: "Build authentication module",
      metadata: { priority: "high" },
    },
    artifacts: {
      implement: "Code implementation completed",
      verify: "Verification passed",
    },
    run: {
      id: "run-123",
    },
    step: {
      id: "current-step",
      iteration: 0,
    },
  };

  describe("interpolate", () => {
    it("should interpolate task variables", async () => {
      const template = "Task {{task.id}}: {{task.input}}";
      const result = await Effect.runPromise(
        interpolate(template, mockContext)
      );

      expect(result).toBe("Task task-001: Build authentication module");
    });

    it("should interpolate artifact variables", async () => {
      const template =
        "Implementation: {{artifacts.implement}}\nVerification: {{artifacts.verify}}";
      const result = await Effect.runPromise(
        interpolate(template, mockContext)
      );

      expect(result).toBe(
        "Implementation: Code implementation completed\nVerification: Verification passed"
      );
    });

    it("should interpolate run and step variables", async () => {
      const template =
        "Run {{run.id}}, Step {{step.id}}, Iteration {{step.iteration}}";
      const result = await Effect.runPromise(
        interpolate(template, mockContext)
      );

      expect(result).toBe("Run run-123, Step current-step, Iteration 0");
    });

    it("should interpolate nested task properties", async () => {
      const template = "Priority: {{task.metadata.priority}}";
      const result = await Effect.runPromise(
        interpolate(template, mockContext)
      );

      expect(result).toBe("Priority: high");
    });

    it("should handle templates with no variables", async () => {
      const template = "This is a plain text prompt with no variables.";
      const result = await Effect.runPromise(
        interpolate(template, mockContext)
      );

      expect(result).toBe(template);
    });

    it("should handle templates with multiple occurrences of same variable", async () => {
      const template =
        "{{task.id}} is important. Process {{task.id}} carefully.";
      const result = await Effect.runPromise(
        interpolate(template, mockContext)
      );

      expect(result).toBe(
        "task-001 is important. Process task-001 carefully."
      );
    });

    it("should handle whitespace in variable names", async () => {
      const template = "Task: {{ task.id }} Input: {{ task.input }}";
      const result = await Effect.runPromise(
        interpolate(template, mockContext)
      );

      expect(result).toBe("Task: task-001 Input: Build authentication module");
    });

    it("should fail with InterpolationError for missing variables", async () => {
      const template = "Missing: {{artifacts.nonexistent}}";
      const result = await Effect.runPromiseExit(
        interpolate(template, mockContext)
      );

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.cause).toMatchObject({
          _tag: "Fail",
          error: expect.objectContaining({
            _tag: "InterpolationError",
            missingVariables: ["artifacts.nonexistent"],
          }),
        });
      }
    });

    it("should fail for multiple missing variables", async () => {
      const template =
        "{{artifacts.missing1}} and {{artifacts.missing2}} and {{task.invalid}}";
      const result = await Effect.runPromiseExit(
        interpolate(template, mockContext)
      );

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        const error = result.cause as any;
        expect(error.error.missingVariables).toEqual([
          "artifacts.missing1",
          "artifacts.missing2",
          "task.invalid",
        ]);
      }
    });

    it("should handle empty string values", async () => {
      const contextWithEmpty: InterpolationContext = {
        ...mockContext,
        task: { ...mockContext.task, input: "" },
      };

      const template = "Input: '{{task.input}}'";
      const result = await Effect.runPromise(
        interpolate(template, contextWithEmpty)
      );

      expect(result).toBe("Input: ''");
    });
  });

  describe("buildContext", () => {
    it("should build context from task data", () => {
      const task = {
        id: "task-001",
        workflow: "feature-dev",
        input: "Build auth module",
        metadata: { priority: "high" },
      };

      const artifacts = {
        step1: "Output 1",
        step2: "Output 2",
      };

      const context = buildContext(task, artifacts, "run-123", "step-2", 1);

      expect(context).toEqual({
        task: {
          id: "task-001",
          workflow: "feature-dev",
          input: "Build auth module",
          metadata: { priority: "high" },
        },
        artifacts: {
          step1: "Output 1",
          step2: "Output 2",
        },
        run: {
          id: "run-123",
        },
        step: {
          id: "step-2",
          iteration: 1,
        },
      });
    });

    it("should handle task with missing required fields", () => {
      const task = {
        custom: "value",
      };

      const context = buildContext(task, {}, "run-1", "step-1", 0);

      expect(context.task.id).toBe("");
      expect(context.task.workflow).toBe("");
      expect(context.task.input).toBe("");
      expect(context.task.custom).toBe("value");
    });

    it("should preserve all task fields", () => {
      const task = {
        id: "task-001",
        workflow: "wf",
        input: "test",
        extra1: "value1",
        extra2: { nested: "value2" },
      };

      const context = buildContext(task, {}, "run-1", "step-1", 0);

      expect(context.task.extra1).toBe("value1");
      expect(context.task.extra2).toEqual({ nested: "value2" });
    });
  });

  describe("interpolateAll", () => {
    it("should interpolate multiple templates", async () => {
      const templates = [
        "Task: {{task.id}}",
        "Input: {{task.input}}",
        "Run: {{run.id}}",
      ];

      const results = await Effect.runPromise(
        interpolateAll(templates, mockContext)
      );

      expect(results).toEqual([
        "Task: task-001",
        "Input: Build authentication module",
        "Run: run-123",
      ]);
    });

    it("should handle empty template array", async () => {
      const results = await Effect.runPromise(
        interpolateAll([], mockContext)
      );

      expect(results).toEqual([]);
    });

    it("should fail if any template has missing variables", async () => {
      const templates = [
        "Valid: {{task.id}}",
        "Invalid: {{artifacts.missing}}",
      ];

      const result = await Effect.runPromiseExit(
        interpolateAll(templates, mockContext)
      );

      expect(result._tag).toBe("Failure");
    });
  });

  describe("Complex interpolation scenarios", () => {
    it("should handle workflow with retry feedback", async () => {
      const contextWithFeedback: InterpolationContext = {
        ...mockContext,
        artifacts: {
          ...mockContext.artifacts,
          review_feedback: "Please add error handling",
        },
        step: {
          id: "implement",
          iteration: 1,
        },
      };

      const template = `Implement the following:

Original request: {{task.input}}

Previous attempt: {{artifacts.implement}}

Feedback from review (iteration {{step.iteration}}):
{{artifacts.review_feedback}}

Please address the feedback and improve the implementation.`;

      const result = await Effect.runPromise(
        interpolate(template, contextWithFeedback)
      );

      expect(result).toContain("Build authentication module");
      expect(result).toContain("Code implementation completed");
      expect(result).toContain("Please add error handling");
      expect(result).toContain("iteration 1");
    });

    it("should handle multi-step workflow context", async () => {
      const template = `You are in step {{step.id}} of run {{run.id}}.

Original task ({{task.id}}): {{task.input}}

Previous steps completed:
- Implementation: {{artifacts.implement}}
- Verification: {{artifacts.verify}}

Now proceed with your task.`;

      const result = await Effect.runPromise(
        interpolate(template, mockContext)
      );

      expect(result).toContain("step current-step");
      expect(result).toContain("run run-123");
      expect(result).toContain("task-001");
      expect(result).toContain("Code implementation completed");
      expect(result).toContain("Verification passed");
    });
  });
});
