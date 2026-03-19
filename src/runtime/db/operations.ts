import { Effect, Schema as S } from "effect";
import type { Database } from "sql.js";
import { v4 as uuidv4 } from "uuid";

// Types for database records
export type RunStatus = "pending" | "running" | "completed" | "failed";
export type StepStatus = "pending" | "running" | "completed" | "failed";
export type StorageType = "inline" | "filesystem" | "git_repo" | "zip_file";

export interface Run {
  readonly id: string;
  readonly workflow_id: string;
  readonly task_id: string;
  readonly status: string;
  readonly final_output: string | null;
  readonly output_type: string | null;
  readonly output_file_path: string | null;
  readonly created_at: number;
  readonly updated_at: number;
}

export interface StepExecution {
  readonly id: string;
  readonly run_id: string;
  readonly step_id: string;
  readonly iteration: number;
  readonly status: StepStatus;
  readonly started_at: number | null;
  readonly completed_at: number | null;
  readonly error: string | null;
}

export interface InlineArtifact {
  readonly storage_type: "inline";
  readonly mime_type: string;
  readonly content: string;
}

export interface FilesystemArtifact {
  readonly storage_type: "filesystem";
  readonly file_path: string;
  readonly file_size: number;
  readonly file_checksum: string | null;
}

export interface GitRepoArtifact {
  readonly storage_type: "git_repo";
  readonly git_remote: string;
  readonly git_branch: string;
  readonly git_commit_sha: string;
}

export interface ZipFileArtifact {
  readonly storage_type: "zip_file";
  readonly zip_path: string;
  readonly zip_size: number;
  readonly zip_checksum: string;
}

export type ArtifactStorage =
  | InlineArtifact
  | FilesystemArtifact
  | GitRepoArtifact
  | ZipFileArtifact;

export interface Artifact {
  readonly id: string;
  readonly run_id: string;
  readonly step_id: string;
  readonly iteration: number;
  readonly storage: ArtifactStorage;
  readonly created_at: number;
}

// Custom error types
export class DatabaseError extends S.TaggedError<DatabaseError>("DatabaseError")(
  "DatabaseError",
  {
    message: S.String,
    cause: S.optional(S.Unknown),
  }
) {}

export class NotFoundError extends S.TaggedError<NotFoundError>("NotFoundError")(
  "NotFoundError",
  {
    message: S.String,
    id: S.String,
  }
) {}

/**
 * Create a new run
 */
export const createRun = (
  db: Database,
  workflowId: string,
  taskId: string
): Effect.Effect<Run, DatabaseError> =>
  Effect.gen(function* (_) {
    const id = uuidv4();
    const now = Date.now();

    const run: Run = {
      id,
      workflow_id: workflowId,
      task_id: taskId,
      status: "pending",
      final_output: null,
      output_type: null,
      output_file_path: null,
      created_at: now,
      updated_at: now,
    };

    yield* _(
      Effect.try({
        try: () => {
          db.run(
            `INSERT INTO runs (id, workflow_id, task_id, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, workflowId, taskId, "pending", now, now]
          );
        },
        catch: (error) =>
          new DatabaseError({
            message: `Failed to create run: ${String(error)}`,
            cause: error,
          }),
      })
    );

    return run;
  });

/**
 * Update run status
 */
export const updateRunStatus = (
  db: Database,
  runId: string,
  status: RunStatus
): Effect.Effect<void, DatabaseError> =>
  Effect.try({
    try: () => {
      const now = Date.now();
      db.run(
        `UPDATE runs SET status = ?, updated_at = ? WHERE id = ?`,
        [status, now, runId]
      );
    },
    catch: (error) =>
      new DatabaseError({
        message: `Failed to update run status: ${String(error)}`,
        cause: error,
      }),
  });

/**
 * Update run final output
 */
export const updateRunOutput = (
  db: Database,
  runId: string,
  finalOutput: string,
  outputType: string,
  outputFilePath?: string
): Effect.Effect<void, DatabaseError> =>
  Effect.try({
    try: () => {
      const now = Date.now();
      db.run(
        `UPDATE runs SET final_output = ?, output_type = ?, output_file_path = ?, updated_at = ? WHERE id = ?`,
        [finalOutput, outputType, outputFilePath || null, now, runId]
      );
    },
    catch: (error) =>
      new DatabaseError({
        message: `Failed to update run output: ${String(error)}`,
        cause: error,
      }),
  });

/**
 * Get run by ID
 */
export const getRun = (
  db: Database,
  runId: string
): Effect.Effect<Run, DatabaseError | NotFoundError> =>
  Effect.gen(function* (_) {
    const result = yield* _(
      Effect.try({
        try: () => {
          const stmt = db.prepare(
            `SELECT id, workflow_id, task_id, status, created_at, updated_at
             FROM runs WHERE id = ?`
          );
          stmt.bind([runId]);
          const hasRow = stmt.step();
          if (!hasRow) {
            stmt.free();
            return null;
          }
          const obj = stmt.getAsObject();
          stmt.free();
          return obj;
        },
        catch: (error) =>
          new DatabaseError({
            message: `Failed to get run: ${String(error)}`,
            cause: error,
          }),
      })
    );

    if (!result) {
      return yield* _(
        Effect.fail(
          new NotFoundError({
            message: `Run not found: ${runId}`,
            id: runId,
          })
        )
      );
    }

    return result as unknown as Run;
  });

/**
 * List all runs
 */
export const listRuns = (
  db: Database,
  limit = 100
): Effect.Effect<readonly Run[], DatabaseError> =>
  Effect.try({
    try: () => {
      const stmt = db.prepare(
        `SELECT id, workflow_id, task_id, status, created_at, updated_at
         FROM runs ORDER BY created_at DESC LIMIT ?`
      );
      stmt.bind([limit]);

      const runs: Run[] = [];
      while (stmt.step()) {
        runs.push(stmt.getAsObject() as unknown as Run);
      }
      return runs;
    },
    catch: (error) =>
      new DatabaseError({
        message: `Failed to list runs: ${String(error)}`,
        cause: error,
      }),
  });

/**
 * Create a step execution
 */
export const createStepExecution = (
  db: Database,
  runId: string,
  stepId: string,
  iteration = 0
): Effect.Effect<StepExecution, DatabaseError> =>
  Effect.gen(function* (_) {
    const id = uuidv4();

    const stepExecution: StepExecution = {
      id,
      run_id: runId,
      step_id: stepId,
      iteration,
      status: "pending",
      started_at: null,
      completed_at: null,
      error: null,
    };

    yield* _(
      Effect.try({
        try: () => {
          db.run(
            `INSERT INTO step_executions (id, run_id, step_id, iteration, status)
             VALUES (?, ?, ?, ?, ?)`,
            [id, runId, stepId, iteration, "pending"]
          );
        },
        catch: (error) =>
          new DatabaseError({
            message: `Failed to create step execution: ${String(error)}`,
            cause: error,
          }),
      })
    );

    return stepExecution;
  });

/**
 * Update step execution status
 */
export const updateStepStatus = (
  db: Database,
  stepExecutionId: string,
  status: StepStatus,
  error?: string
): Effect.Effect<void, DatabaseError> =>
  Effect.try({
    try: () => {
      const now = Date.now();
      const updates: string[] = ["status = ?"];
      const params: (string | number)[] = [status];

      if (status === "running") {
        updates.push("started_at = ?");
        params.push(now);
      }

      if (status === "completed" || status === "failed") {
        updates.push("completed_at = ?");
        params.push(now);
      }

      if (error) {
        updates.push("error = ?");
        params.push(error);
      }

      params.push(stepExecutionId);

      db.run(
        `UPDATE step_executions SET ${updates.join(", ")} WHERE id = ?`,
        params
      );
    },
    catch: (err) =>
      new DatabaseError({
        message: `Failed to update step status: ${String(err)}`,
        cause: err,
      }),
  });

/**
 * Get step executions for a run
 */
export const getStepExecutions = (
  db: Database,
  runId: string
): Effect.Effect<readonly StepExecution[], DatabaseError> =>
  Effect.try({
    try: () => {
      const stmt = db.prepare(
        `SELECT id, run_id, step_id, iteration, status, started_at, completed_at, error
         FROM step_executions WHERE run_id = ? ORDER BY started_at ASC`
      );
      stmt.bind([runId]);

      const executions: StepExecution[] = [];
      while (stmt.step()) {
        executions.push(stmt.getAsObject() as unknown as StepExecution);
      }
      return executions;
    },
    catch: (error) =>
      new DatabaseError({
        message: `Failed to get step executions: ${String(error)}`,
        cause: error,
      }),
  });

/**
 * Save an artifact
 */
export const saveArtifact = (
  db: Database,
  runId: string,
  stepId: string,
  iteration: number,
  storage: ArtifactStorage
): Effect.Effect<Artifact, DatabaseError> =>
  Effect.gen(function* (_) {
    const id = uuidv4();
    const now = Date.now();

    const artifact: Artifact = {
      id,
      run_id: runId,
      step_id: stepId,
      iteration,
      storage,
      created_at: now,
    };

    yield* _(
      Effect.try({
        try: () => {
          const baseParams = [id, runId, stepId, iteration, storage.storage_type];

          switch (storage.storage_type) {
            case "inline":
              db.run(
                `INSERT INTO artifacts (id, run_id, step_id, iteration, storage_type, mime_type, content, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [...baseParams, storage.mime_type, storage.content, now]
              );
              break;

            case "filesystem":
              db.run(
                `INSERT INTO artifacts (id, run_id, step_id, iteration, storage_type, file_path, file_size, file_checksum, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  ...baseParams,
                  storage.file_path,
                  storage.file_size,
                  storage.file_checksum,
                  now,
                ]
              );
              break;

            case "git_repo":
              db.run(
                `INSERT INTO artifacts (id, run_id, step_id, iteration, storage_type, git_remote, git_branch, git_commit_sha, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  ...baseParams,
                  storage.git_remote,
                  storage.git_branch,
                  storage.git_commit_sha,
                  now,
                ]
              );
              break;

            case "zip_file":
              db.run(
                `INSERT INTO artifacts (id, run_id, step_id, iteration, storage_type, zip_path, zip_size, zip_checksum, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  ...baseParams,
                  storage.zip_path,
                  storage.zip_size,
                  storage.zip_checksum,
                  now,
                ]
              );
              break;
          }
        },
        catch: (error) =>
          new DatabaseError({
            message: `Failed to save artifact: ${String(error)}`,
            cause: error,
          }),
      })
    );

    return artifact;
  });

/**
 * Get artifacts for a run
 */
export const getArtifacts = (
  db: Database,
  runId: string,
  stepId?: string
): Effect.Effect<readonly Artifact[], DatabaseError> =>
  Effect.try({
    try: () => {
      const query = stepId
        ? `SELECT * FROM artifacts WHERE run_id = ? AND step_id = ? ORDER BY created_at ASC`
        : `SELECT * FROM artifacts WHERE run_id = ? ORDER BY created_at ASC`;

      const stmt = db.prepare(query);
      stmt.bind(stepId ? [runId, stepId] : [runId]);

      const artifacts: Artifact[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject() as Record<string, unknown>;

        let storage: ArtifactStorage;
        switch (row.storage_type) {
          case "inline":
            storage = {
              storage_type: "inline",
              mime_type: row.mime_type as string,
              content: row.content as string,
            };
            break;

          case "filesystem":
            storage = {
              storage_type: "filesystem",
              file_path: row.file_path as string,
              file_size: row.file_size as number,
              file_checksum: row.file_checksum as string | null,
            };
            break;

          case "git_repo":
            storage = {
              storage_type: "git_repo",
              git_remote: row.git_remote as string,
              git_branch: row.git_branch as string,
              git_commit_sha: row.git_commit_sha as string,
            };
            break;

          case "zip_file":
            storage = {
              storage_type: "zip_file",
              zip_path: row.zip_path as string,
              zip_size: row.zip_size as number,
              zip_checksum: row.zip_checksum as string,
            };
            break;

          default:
            throw new Error(`Unknown storage type: ${row.storage_type}`);
        }

        artifacts.push({
          id: row.id as string,
          run_id: row.run_id as string,
          step_id: row.step_id as string,
          iteration: row.iteration as number,
          storage,
          created_at: row.created_at as number,
        });
      }

      return artifacts;
    },
    catch: (error) =>
      new DatabaseError({
        message: `Failed to get artifacts: ${String(error)}`,
        cause: error,
      }),
  });

/**
 * Get run details with all steps and artifacts
 */
export const getRunDetails = (
  db: Database,
  runId: string
): Effect.Effect<
  {
    readonly run: Run;
    readonly steps: readonly StepExecution[];
    readonly artifacts: readonly Artifact[];
  },
  DatabaseError | NotFoundError
> =>
  Effect.gen(function* (_) {
    const run = yield* _(getRun(db, runId));
    const steps = yield* _(getStepExecutions(db, runId));
    const artifacts = yield* _(getArtifacts(db, runId));

    return { run, steps, artifacts };
  });
