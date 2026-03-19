import { describe, it, expect } from "vitest";
import { Schema as S } from "effect";
import {
  SkillSchema,
  AgentConfigSchema,
  WorkflowSchema,
  FtsfafConfigSchema,
  TaskSchema,
} from "../../src/config/schema.js";

describe("Config Schemas", () => {
  describe("SkillSchema", () => {
    it("validates a valid skill", () => {
      const validSkill = {
        id: "code-generation",
        name: "Code Generation",
        description: "Generates code from specs",
        tags: ["coding", "typescript"],
        examples: ["Write a REST API", "Implement binary search"],
      };

      const result = S.decodeUnknownSync(SkillSchema)(validSkill);
      expect(result.id).toBe("code-generation");
    });

    it("rejects invalid skill", () => {
      const invalidSkill = {
        id: "test",
        // missing required fields
      };

      expect(() => S.decodeUnknownSync(SkillSchema)(invalidSkill)).toThrow();
    });
  });

  describe("AgentConfigSchema", () => {
    it("validates agent with kubernetes infrastructure", () => {
      const validAgent = {
        id: "coder",
        agentType: "openclaw",
        endpoint: "http://localhost:8080",
        auth: { type: "none" },
        infrastructure: {
          type: "kubernetes",
          namespace: "default",
          image: "openclaw-agent:latest",
          port: 8080,
        },
        skills: ["code-generation"],
      };

      const result = S.decodeUnknownSync(AgentConfigSchema)(validAgent);
      expect(result.id).toBe("coder");
      expect(result.agentType).toBe("openclaw");
      expect(result.infrastructure?.type).toBe("kubernetes");
    });

    it("validates agent with bearer auth", () => {
      const validAgent = {
        id: "reviewer",
        agentType: "a2a",
        endpoint: "https://api.example.com",
        auth: {
          type: "bearer",
          token: "secret-token",
        },
        infrastructure: {
          type: "remote",
        },
        skills: ["code-review"],
      };

      const result = S.decodeUnknownSync(AgentConfigSchema)(validAgent);
      expect(result.auth.type).toBe("bearer");
      expect(result.agentType).toBe("a2a");
    });
  });

  describe("WorkflowSchema", () => {
    it("validates a simple workflow", () => {
      const validWorkflow = {
        id: "test-flow",
        name: "Test Workflow",
        output: {
          type: "string",
          source: "step1",
          description: "Generated code output",
        },
        steps: [
          {
            id: "step1",
            agent: "coder",
            skill: "code-generation",
            user_prompt: "Generate code for {{task.input}}",
            depends_on: [],
          },
        ],
      };

      const result = S.decodeUnknownSync(WorkflowSchema)(validWorkflow);
      expect(result.steps).toHaveLength(1);
      expect(result.output.type).toBe("string");
      expect(result.output.source).toBe("step1");
    });

    it("validates workflow with on_fail retry", () => {
      const validWorkflow = {
        id: "retry-flow",
        name: "Retry Workflow",
        output: {
          type: "file",
          source: "review",
          description: "Reviewed code",
        },
        steps: [
          {
            id: "implement",
            agent: "coder",
            skill: "code-generation",
            user_prompt: "Code: {{task.input}}",
            depends_on: [],
          },
          {
            id: "review",
            agent: "reviewer",
            skill: "code-review",
            user_prompt: "Review: {{artifacts.implement}}",
            depends_on: ["implement"],
            on_fail: {
              route_to: "implement",
              max_iterations: 3,
              inject_artifact: "review_feedback",
            },
          },
        ],
      };

      const result = S.decodeUnknownSync(WorkflowSchema)(validWorkflow);
      expect(result.steps[1]?.on_fail?.max_iterations).toBe(3);
      expect(result.output.source).toBe("review");
    });
  });

  describe("FtsfafConfigSchema", () => {
    it("validates ftsfaf config", () => {
      const validConfig = {
        server: { port: 4852 },
        redis: { host: "localhost", port: 6379 },
        sqlite: { path: "./test.db" },
        agents_dir: "./agents",
        workflows_dir: "./workflows",
        skills_dir: "./skills",
        default_system_prompt: "./prompts/default.md",
        startup_timeout_ms: 30000,
        health_poll_interval_ms: 1000,
      };

      const result = S.decodeUnknownSync(FtsfafConfigSchema)(validConfig);
      expect(result.server.port).toBe(4852);
    });
  });

  describe("TaskSchema", () => {
    it("validates a task", () => {
      const validTask = {
        id: "task-001",
        workflow: "feature-dev",
        input: "Build an auth module",
        metadata: { priority: "high" },
      };

      const result = S.decodeUnknownSync(TaskSchema)(validTask);
      expect(result.workflow).toBe("feature-dev");
    });
  });
});
