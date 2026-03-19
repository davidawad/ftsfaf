import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { DatabaseService, InMemoryDatabaseLayer } from "../../src/runtime/db/layer.js";
import {
  createRun,
  updateRunStatus,
  getRun,
  listRuns,
  createStepExecution,
  updateStepStatus,
  getStepExecutions,
  saveArtifact,
  getArtifacts,
  getRunDetails,
  NotFoundError,
} from "../../src/runtime/db/operations.js";

describe("Database Operations", () => {
  describe("Runs", () => {
    it("should create a new run", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        const run = yield* _(createRun(db, "feature-dev", "task-001"));

        expect(run).toMatchObject({
          id: expect.any(String),
          workflow_id: "feature-dev",
          task_id: "task-001",
          status: "pending",
          created_at: expect.any(Number),
          updated_at: expect.any(Number),
        });

        return run;
      });

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryDatabaseLayer)));
    });

    it("should update run status", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        const run = yield* _(createRun(db, "feature-dev", "task-001"));

        yield* _(updateRunStatus(db, run.id, "running"));

        const updated = yield* _(getRun(db, run.id));
        expect(updated.status).toBe("running");
        expect(updated.updated_at).toBeGreaterThanOrEqual(run.updated_at);
      });

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryDatabaseLayer)));
    });

    it("should get run by ID", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        const run = yield* _(createRun(db, "feature-dev", "task-001"));

        const fetched = yield* _(getRun(db, run.id));
        expect(fetched).toEqual(run);
      });

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryDatabaseLayer)));
    });

    it("should fail with NotFoundError for non-existent run", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        return yield* _(getRun(db, "non-existent-id"));
      });

      const result = await Effect.runPromiseExit(
        program.pipe(Effect.provide(InMemoryDatabaseLayer))
      );

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.cause).toMatchObject({
          _tag: "Fail",
          error: expect.objectContaining({
            _tag: "NotFoundError",
          }),
        });
      }
    });

    it("should list all runs", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);

        yield* _(createRun(db, "feature-dev", "task-001"));
        yield* _(createRun(db, "feature-dev", "task-002"));
        yield* _(createRun(db, "another-workflow", "task-003"));

        const runs = yield* _(listRuns(db));
        expect(runs.length).toBe(3);
      });

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryDatabaseLayer)));
    });
  });

  describe("Step Executions", () => {
    it("should create a step execution", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        const run = yield* _(createRun(db, "feature-dev", "task-001"));

        const step = yield* _(createStepExecution(db, run.id, "implement"));

        expect(step).toMatchObject({
          id: expect.any(String),
          run_id: run.id,
          step_id: "implement",
          iteration: 0,
          status: "pending",
          started_at: null,
          completed_at: null,
          error: null,
        });
      });

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryDatabaseLayer)));
    });

    it("should update step status to running", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        const run = yield* _(createRun(db, "feature-dev", "task-001"));
        const step = yield* _(createStepExecution(db, run.id, "implement"));

        yield* _(updateStepStatus(db, step.id, "running"));

        const steps = yield* _(getStepExecutions(db, run.id));
        expect(steps[0].status).toBe("running");
        expect(steps[0].started_at).toBeGreaterThan(0);
      });

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryDatabaseLayer)));
    });

    it("should update step status to completed", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        const run = yield* _(createRun(db, "feature-dev", "task-001"));
        const step = yield* _(createStepExecution(db, run.id, "implement"));

        yield* _(updateStepStatus(db, step.id, "running"));
        yield* _(updateStepStatus(db, step.id, "completed"));

        const steps = yield* _(getStepExecutions(db, run.id));
        expect(steps[0].status).toBe("completed");
        expect(steps[0].completed_at).toBeGreaterThan(0);
      });

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryDatabaseLayer)));
    });

    it("should update step status to failed with error", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        const run = yield* _(createRun(db, "feature-dev", "task-001"));
        const step = yield* _(createStepExecution(db, run.id, "implement"));

        yield* _(updateStepStatus(db, step.id, "running"));
        yield* _(updateStepStatus(db, step.id, "failed", "Agent timeout"));

        const steps = yield* _(getStepExecutions(db, run.id));
        expect(steps[0].status).toBe("failed");
        expect(steps[0].error).toBe("Agent timeout");
        expect(steps[0].completed_at).toBeGreaterThan(0);
      });

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryDatabaseLayer)));
    });

    it("should get all step executions for a run", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        const run = yield* _(createRun(db, "feature-dev", "task-001"));

        yield* _(createStepExecution(db, run.id, "implement"));
        yield* _(createStepExecution(db, run.id, "verify"));
        yield* _(createStepExecution(db, run.id, "test"));

        const steps = yield* _(getStepExecutions(db, run.id));
        expect(steps.length).toBe(3);
        expect(steps.map((s) => s.step_id)).toEqual(["implement", "verify", "test"]);
      });

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryDatabaseLayer)));
    });
  });

  describe("Artifacts", () => {
    it("should save an inline artifact", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        const run = yield* _(createRun(db, "feature-dev", "task-001"));

        const artifact = yield* _(
          saveArtifact(db, run.id, "implement", 0, {
            storage_type: "inline",
            mime_type: "text/plain",
            content: "Generated code content",
          })
        );

        expect(artifact).toMatchObject({
          id: expect.any(String),
          run_id: run.id,
          step_id: "implement",
          iteration: 0,
          storage: {
            storage_type: "inline",
            mime_type: "text/plain",
            content: "Generated code content",
          },
          created_at: expect.any(Number),
        });
      });

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryDatabaseLayer)));
    });

    it("should save a filesystem artifact", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        const run = yield* _(createRun(db, "feature-dev", "task-001"));

        const artifact = yield* _(
          saveArtifact(db, run.id, "implement", 0, {
            storage_type: "filesystem",
            file_path: "/tmp/output.txt",
            file_size: 1024,
            file_checksum: "abc123",
          })
        );

        expect(artifact.storage).toMatchObject({
          storage_type: "filesystem",
          file_path: "/tmp/output.txt",
          file_size: 1024,
          file_checksum: "abc123",
        });
      });

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryDatabaseLayer)));
    });

    it("should save a git repo artifact", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        const run = yield* _(createRun(db, "feature-dev", "task-001"));

        const artifact = yield* _(
          saveArtifact(db, run.id, "implement", 0, {
            storage_type: "git_repo",
            git_remote: "git@github.com:user/repo.git",
            git_branch: "feature/auth",
            git_commit_sha: "abc123def456",
          })
        );

        expect(artifact.storage).toMatchObject({
          storage_type: "git_repo",
          git_remote: "git@github.com:user/repo.git",
          git_branch: "feature/auth",
          git_commit_sha: "abc123def456",
        });
      });

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryDatabaseLayer)));
    });

    it("should save a zip file artifact", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        const run = yield* _(createRun(db, "feature-dev", "task-001"));

        const artifact = yield* _(
          saveArtifact(db, run.id, "implement", 0, {
            storage_type: "zip_file",
            zip_path: "/tmp/output.zip",
            zip_size: 2048,
            zip_checksum: "def456",
          })
        );

        expect(artifact.storage).toMatchObject({
          storage_type: "zip_file",
          zip_path: "/tmp/output.zip",
          zip_size: 2048,
          zip_checksum: "def456",
        });
      });

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryDatabaseLayer)));
    });

    it("should get all artifacts for a run", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        const run = yield* _(createRun(db, "feature-dev", "task-001"));

        yield* _(
          saveArtifact(db, run.id, "implement", 0, {
            storage_type: "inline",
            mime_type: "text/plain",
            content: "Step 1 output",
          })
        );

        yield* _(
          saveArtifact(db, run.id, "verify", 0, {
            storage_type: "inline",
            mime_type: "text/plain",
            content: "Step 2 output",
          })
        );

        const artifacts = yield* _(getArtifacts(db, run.id));
        expect(artifacts.length).toBe(2);
      });

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryDatabaseLayer)));
    });

    it("should get artifacts for a specific step", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        const run = yield* _(createRun(db, "feature-dev", "task-001"));

        yield* _(
          saveArtifact(db, run.id, "implement", 0, {
            storage_type: "inline",
            mime_type: "text/plain",
            content: "Implementation output",
          })
        );

        yield* _(
          saveArtifact(db, run.id, "verify", 0, {
            storage_type: "inline",
            mime_type: "text/plain",
            content: "Verification output",
          })
        );

        const artifacts = yield* _(getArtifacts(db, run.id, "implement"));
        expect(artifacts.length).toBe(1);
        expect(artifacts[0].step_id).toBe("implement");
      });

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryDatabaseLayer)));
    });
  });

  describe("Run Details", () => {
    it("should get complete run details", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        const run = yield* _(createRun(db, "feature-dev", "task-001"));

        // Create steps
        const step1 = yield* _(createStepExecution(db, run.id, "implement"));
        yield* _(updateStepStatus(db, step1.id, "completed"));

        const step2 = yield* _(createStepExecution(db, run.id, "verify"));
        yield* _(updateStepStatus(db, step2.id, "running"));

        // Create artifacts
        yield* _(
          saveArtifact(db, run.id, "implement", 0, {
            storage_type: "inline",
            mime_type: "text/plain",
            content: "Code output",
          })
        );

        // Update run status
        yield* _(updateRunStatus(db, run.id, "running"));

        // Get full details
        const details = yield* _(getRunDetails(db, run.id));

        expect(details.run.status).toBe("running");
        expect(details.steps.length).toBe(2);
        expect(details.artifacts.length).toBe(1);
        expect(details.steps[0].status).toBe("completed");
        expect(details.steps[1].status).toBe("running");
      });

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryDatabaseLayer)));
    });
  });
});
