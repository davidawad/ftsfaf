import { describe, it, expect } from "vitest";
import {
  validateWorkflow,
  checkSkillCapacity,
  WorkflowValidationError,
} from "../../src/graph/validate.js";
import type { Workflow } from "../../src/config/schema.js";

describe("Workflow Validation", () => {
  describe("validateWorkflow", () => {
    it("validates a simple linear workflow", () => {
      const workflow: Workflow = {
        id: "simple",
        name: "Simple Workflow",
        steps: [
          {
            id: "step1",
            agent: "agent1",
            skill: "skill1",
            user_prompt: "Do step 1",
            depends_on: [],
          },
          {
            id: "step2",
            agent: "agent2",
            skill: "skill2",
            user_prompt: "Do step 2",
            depends_on: ["step1"],
          },
        ],
      };

      const validated = validateWorkflow(workflow);
      expect(validated.executionOrder).toHaveLength(2);
      expect(validated.executionOrder[0]).toContain("step1");
      expect(validated.executionOrder[1]).toContain("step2");
    });

    it("validates parallel steps", () => {
      const workflow: Workflow = {
        id: "parallel",
        name: "Parallel Workflow",
        steps: [
          {
            id: "start",
            agent: "agent1",
            skill: "skill1",
            user_prompt: "Start",
            depends_on: [],
          },
          {
            id: "parallel1",
            agent: "agent2",
            skill: "skill2",
            user_prompt: "Parallel 1",
            depends_on: ["start"],
          },
          {
            id: "parallel2",
            agent: "agent3",
            skill: "skill3",
            user_prompt: "Parallel 2",
            depends_on: ["start"],
          },
          {
            id: "end",
            agent: "agent4",
            skill: "skill4",
            user_prompt: "End",
            depends_on: ["parallel1", "parallel2"],
          },
        ],
      };

      const validated = validateWorkflow(workflow);
      expect(validated.executionOrder).toHaveLength(3);
      expect(validated.executionOrder[0]).toContain("start");
      expect(validated.executionOrder[1]).toHaveLength(2); // Both parallel steps
      expect(validated.executionOrder[2]).toContain("end");
    });

    it("rejects workflow with dead steps", () => {
      const workflow: Workflow = {
        id: "dead-step",
        name: "Dead Step Workflow",
        steps: [
          {
            id: "step1",
            agent: "agent1",
            skill: "skill1",
            user_prompt: "Step 1",
            depends_on: [],
          },
          {
            id: "dead",
            agent: "agent2",
            skill: "skill2",
            user_prompt: "Dead step",
            depends_on: ["nonexistent"],
          },
        ],
      };

      expect(() => validateWorkflow(workflow)).toThrow(WorkflowValidationError);
      expect(() => validateWorkflow(workflow)).toThrow(/unreachable/);
    });

    it("accepts bounded retry cycles", () => {
      const workflow: Workflow = {
        id: "retry",
        name: "Retry Workflow",
        steps: [
          {
            id: "implement",
            agent: "coder",
            skill: "coding",
            user_prompt: "Write code",
            depends_on: [],
          },
          {
            id: "review",
            agent: "reviewer",
            skill: "review",
            user_prompt: "Review code",
            depends_on: ["implement"],
            on_fail: {
              route_to: "implement",
              max_iterations: 3,
              inject_artifact: "feedback",
            },
          },
          {
            id: "deploy",
            agent: "deployer",
            skill: "deploy",
            user_prompt: "Deploy",
            depends_on: ["review"],
          },
        ],
      };

      const validated = validateWorkflow(workflow);
      expect(validated).toBeDefined();
      // Should have implement+review cycle plus deploy as separate tier
      expect(validated.executionOrder.length).toBeGreaterThan(0);
    });

    it("rejects unbounded cycles", () => {
      const workflow: Workflow = {
        id: "unbounded",
        name: "Unbounded Cycle",
        steps: [
          {
            id: "step1",
            agent: "agent1",
            skill: "skill1",
            user_prompt: "Step 1",
            depends_on: ["step2"],
          },
          {
            id: "step2",
            agent: "agent2",
            skill: "skill2",
            user_prompt: "Step 2",
            depends_on: ["step1"],
          },
        ],
      };

      expect(() => validateWorkflow(workflow)).toThrow(WorkflowValidationError);
    });

    it("rejects workflow with no terminal steps", () => {
      const workflow: Workflow = {
        id: "no-terminal",
        name: "No Terminal",
        steps: [
          {
            id: "step1",
            agent: "agent1",
            skill: "skill1",
            user_prompt: "Step 1",
            depends_on: [],
            on_fail: {
              route_to: "step1",
              max_iterations: 3,
              inject_artifact: "retry",
            },
          },
        ],
      };

      // This creates a self-loop with no exit
      expect(() => validateWorkflow(workflow)).toThrow(/terminal/);
    });

    it("validates complex workflow with retry and terminal", () => {
      const workflow: Workflow = {
        id: "complex",
        name: "Complex Workflow",
        steps: [
          {
            id: "plan",
            agent: "planner",
            skill: "planning",
            user_prompt: "Plan",
            depends_on: [],
          },
          {
            id: "implement",
            agent: "coder",
            skill: "coding",
            user_prompt: "Code",
            depends_on: ["plan"],
          },
          {
            id: "review",
            agent: "reviewer",
            skill: "review",
            user_prompt: "Review",
            depends_on: ["implement"],
            on_fail: {
              route_to: "implement",
              max_iterations: 3,
              inject_artifact: "feedback",
            },
          },
          {
            id: "deploy",
            agent: "deployer",
            skill: "deployment",
            user_prompt: "Deploy",
            depends_on: ["review"],
          },
        ],
      };

      const validated = validateWorkflow(workflow);
      expect(validated.executionOrder.length).toBeGreaterThan(0);
      expect(validated.executionOrder[validated.executionOrder.length - 1]).toContain("deploy");
    });
  });

  describe("checkSkillCapacity", () => {
    it("passes when agents have required skills", () => {
      const workflow: Workflow = {
        id: "test",
        name: "Test",
        steps: [
          {
            id: "step1",
            agent: "agent1",
            skill: "skill1",
            user_prompt: "Test",
            depends_on: [],
          },
        ],
      };

      const validated = validateWorkflow(workflow);
      const agents = new Map([["agent1", ["skill1", "skill2"]]]);

      expect(() => checkSkillCapacity(validated, agents)).not.toThrow();
    });

    it("fails when agent is not loaded", () => {
      const workflow: Workflow = {
        id: "test",
        name: "Test",
        steps: [
          {
            id: "step1",
            agent: "missing-agent",
            skill: "skill1",
            user_prompt: "Test",
            depends_on: [],
          },
        ],
      };

      const validated = validateWorkflow(workflow);
      const agents = new Map([["agent1", ["skill1"]]]);

      expect(() => checkSkillCapacity(validated, agents)).toThrow(WorkflowValidationError);
      expect(() => checkSkillCapacity(validated, agents)).toThrow(/not loaded/);
    });

    it("fails when agent lacks required skill", () => {
      const workflow: Workflow = {
        id: "test",
        name: "Test",
        steps: [
          {
            id: "step1",
            agent: "agent1",
            skill: "missing-skill",
            user_prompt: "Test",
            depends_on: [],
          },
        ],
      };

      const validated = validateWorkflow(workflow);
      const agents = new Map([["agent1", ["skill1", "skill2"]]]);

      expect(() => checkSkillCapacity(validated, agents)).toThrow(WorkflowValidationError);
      expect(() => checkSkillCapacity(validated, agents)).toThrow(/does not declare skill/);
    });
  });
});
