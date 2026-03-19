import { Effect, Schema as S } from "effect";
import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import { config as dotenvConfig } from "dotenv";
import { logger } from "../utils/logger.js";
import {
  type FtsfafConfig,
  FtsfafConfigSchema,
  type Skill,
  SkillSchema,
  type AgentConfig,
  AgentConfigSchema,
  type Workflow,
  WorkflowSchema,
  type Task,
  TaskSchema,
} from "./schema.js";

// Load .env file for local development
// Only logs debug message if .env file is not found
try {
  const result = dotenvConfig();
  if (result.error) {
    logger.debug(
      { error: result.error.message },
      "No .env file found (this is normal for production environments)"
    );
  } else {
    logger.debug({ path: result.parsed ? Object.keys(result.parsed) : [] }, "Loaded environment variables from .env");
  }
} catch (error) {
  logger.debug(
    { error: String(error) },
    "Could not load .env file (this is normal for production environments)"
  );
}

// Custom error types
export class ConfigLoadError extends S.TaggedError<ConfigLoadError>(
  "ConfigLoadError"
)("ConfigLoadError", {
  message: S.String,
  path: S.String,
  cause: S.optional(S.Unknown),
}) {}

export class ValidationError extends S.TaggedError<ValidationError>(
  "ValidationError"
)("ValidationError", {
  message: S.String,
  path: S.String,
  errors: S.Array(S.String),
}) {}

export class EnvVarError extends S.TaggedError<EnvVarError>("EnvVarError")(
  "EnvVarError",
  {
    message: S.String,
    missingVars: S.Array(S.String),
  }
) {}

/**
 * Interpolate environment variables in a string
 * Supports ${VAR_NAME} syntax
 */
const interpolateEnvVars = (
  value: string,
  missingVars: Set<string>
): string => {
  return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      missingVars.add(varName);
      return match; // Keep original placeholder
    }
    return envValue;
  });
};

/**
 * Recursively interpolate environment variables in an object
 */
const interpolateObjectEnvVars = (
  obj: unknown,
  missingVars: Set<string>
): unknown => {
  if (typeof obj === "string") {
    return interpolateEnvVars(obj, missingVars);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => interpolateObjectEnvVars(item, missingVars));
  }

  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateObjectEnvVars(value, missingVars);
    }
    return result;
  }

  return obj;
};

/**
 * Load and parse a JSON file with schema validation
 */
const loadJsonFile = <A, I, R>(
  filePath: string,
  schema: S.Schema<A, I, R>
): Effect.Effect<A, ConfigLoadError | ValidationError> =>
  Effect.gen(function* (_) {
    // Read file
    const content = yield* _(
      Effect.tryPromise({
        try: () => fs.readFile(filePath, "utf-8"),
        catch: (error) =>
          new ConfigLoadError({
            message: `Failed to read file: ${String(error)}`,
            path: filePath,
            cause: error,
          }),
      })
    );

    // Parse JSON
    const parsed = yield* _(
      Effect.try({
        try: () => JSON.parse(content) as unknown,
        catch: (error) =>
          new ConfigLoadError({
            message: `Failed to parse JSON: ${String(error)}`,
            path: filePath,
            cause: error,
          }),
      })
    );

    // Interpolate environment variables
    const missingVars = new Set<string>();
    const interpolated = interpolateObjectEnvVars(parsed, missingVars);

    if (missingVars.size > 0) {
      return yield* _(
        Effect.fail(
          new EnvVarError({
            message: `Missing environment variables in ${filePath}`,
            missingVars: Array.from(missingVars),
          })
        )
      );
    }

    // Validate with schema
    const decoded = yield* _(
      S.decodeUnknown(schema)(interpolated).pipe(
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: `Schema validation failed for ${filePath}`,
              path: filePath,
              errors: [String(error)],
            })
        )
      )
    );

    return decoded;
  });

/**
 * Load ftsfaf.config.json with defaults
 */
export const loadFtsfafConfig = (
  configPath: string = "./ftsfaf.config.json"
): Effect.Effect<FtsfafConfig, ConfigLoadError | ValidationError> =>
  Effect.gen(function* (_) {
    const config = yield* _(loadJsonFile(configPath, FtsfafConfigSchema));

    // Apply defaults
    return {
      server: {
        port: config.server?.port ?? 4852,
      },
      redis: {
        host: config.redis?.host ?? "127.0.0.1",
        port: config.redis?.port ?? 6379,
      },
      sqlite: {
        path: config.sqlite?.path ?? "./ftsfaf.db",
      },
      agents_dir: config.agents_dir ?? "./agents",
      workflows_dir: config.workflows_dir ?? "./workflows",
      skills_dir: config.skills_dir ?? "./skills",
      default_system_prompt:
        config.default_system_prompt ?? "./prompts/default-system.md",
      startup_timeout_ms: config.startup_timeout_ms ?? 30000,
      health_poll_interval_ms: config.health_poll_interval_ms ?? 1000,
    };
  });

/**
 * Load all skill files from skills directory
 */
export const loadSkills = (
  skillsDir: string
): Effect.Effect<
  Map<string, Skill>,
  ConfigLoadError | ValidationError
> =>
  Effect.gen(function* (_) {
    // Find all skill-*.json files
    const pattern = path.join(skillsDir, "skill-*.json");
    const files = yield* _(
      Effect.tryPromise({
        try: () => glob(pattern),
        catch: (error) =>
          new ConfigLoadError({
            message: `Failed to glob skills directory: ${String(error)}`,
            path: skillsDir,
            cause: error,
          }),
      })
    );

    if (files.length === 0) {
      return new Map();
    }

    // Load all skill files
    const skills = yield* _(
      Effect.all(
        files.map((file) => loadJsonFile(file, SkillSchema)),
        { concurrency: "unbounded" }
      )
    );

    // Build map by skill ID
    const skillMap = new Map<string, Skill>();
    for (const skill of skills) {
      if (skillMap.has(skill.id)) {
        return yield* _(
          Effect.fail(
            new ValidationError({
              message: `Duplicate skill ID: ${skill.id}`,
              path: skillsDir,
              errors: [`Skill ID "${skill.id}" is defined multiple times`],
            })
          )
        );
      }
      skillMap.set(skill.id, skill);
    }

    return skillMap;
  });

/**
 * Load all agent config files from agents directory
 */
export const loadAgents = (
  agentsDir: string,
  skillsMap: Map<string, Skill>
): Effect.Effect<
  Map<string, AgentConfig>,
  ConfigLoadError | ValidationError
> =>
  Effect.gen(function* (_) {
    // Find all *.json files in agents directory
    const pattern = path.join(agentsDir, "*.json");
    const files = yield* _(
      Effect.tryPromise({
        try: () => glob(pattern),
        catch: (error) =>
          new ConfigLoadError({
            message: `Failed to glob agents directory: ${String(error)}`,
            path: agentsDir,
            cause: error,
          }),
      })
    );

    if (files.length === 0) {
      return new Map();
    }

    // Load all agent files
    const agents = yield* _(
      Effect.all(
        files.map((file) => loadJsonFile(file, AgentConfigSchema)),
        { concurrency: "unbounded" }
      )
    );

    // Validate skill references and build map
    const agentMap = new Map<string, AgentConfig>();
    const errors: string[] = [];

    for (const agent of agents) {
      // Check for duplicate agent IDs
      if (agentMap.has(agent.id)) {
        errors.push(`Duplicate agent ID: ${agent.id}`);
        continue;
      }

      // Validate all skill references exist
      for (const skillId of agent.skills) {
        if (!skillsMap.has(skillId)) {
          errors.push(
            `Agent "${agent.id}" references non-existent skill "${skillId}"`
          );
        }
      }

      agentMap.set(agent.id, agent);
    }

    if (errors.length > 0) {
      return yield* _(
        Effect.fail(
          new ValidationError({
            message: "Agent validation failed",
            path: agentsDir,
            errors,
          })
        )
      );
    }

    return agentMap;
  });

/**
 * Load all workflow files from workflows directory
 */
export const loadWorkflows = (
  workflowsDir: string
): Effect.Effect<
  Map<string, Workflow>,
  ConfigLoadError | ValidationError
> =>
  Effect.gen(function* (_) {
    // Find all *.json files in workflows directory
    const pattern = path.join(workflowsDir, "*.json");
    const files = yield* _(
      Effect.tryPromise({
        try: () => glob(pattern),
        catch: (error) =>
          new ConfigLoadError({
            message: `Failed to glob workflows directory: ${String(error)}`,
            path: workflowsDir,
            cause: error,
          }),
      })
    );

    if (files.length === 0) {
      return new Map();
    }

    // Load all workflow files
    const workflows = yield* _(
      Effect.all(
        files.map((file) => loadJsonFile(file, WorkflowSchema)),
        { concurrency: "unbounded" }
      )
    );

    // Build map by workflow ID
    const workflowMap = new Map<string, Workflow>();
    for (const workflow of workflows) {
      if (workflowMap.has(workflow.id)) {
        return yield* _(
          Effect.fail(
            new ValidationError({
              message: `Duplicate workflow ID: ${workflow.id}`,
              path: workflowsDir,
              errors: [
                `Workflow ID "${workflow.id}" is defined multiple times`,
              ],
            })
          )
        );
      }
      workflowMap.set(workflow.id, workflow);
    }

    return workflowMap;
  });

/**
 * Load a task file
 */
export const loadTask = (
  taskPath: string
): Effect.Effect<Task, ConfigLoadError | ValidationError> =>
  loadJsonFile(taskPath, TaskSchema);

/**
 * Load all configurations
 */
export const loadAllConfigs = (
  configPath?: string
): Effect.Effect<
  {
    config: FtsfafConfig;
    skills: Map<string, Skill>;
    agents: Map<string, AgentConfig>;
    workflows: Map<string, Workflow>;
  },
  ConfigLoadError | ValidationError | EnvVarError
> =>
  Effect.gen(function* (_) {
    // Load global config first
    const config = yield* _(loadFtsfafConfig(configPath));

    // Load skills (needed for agent validation)
    const skills = yield* _(loadSkills(config.skills_dir));

    // Load agents (validates skill references)
    const agents = yield* _(loadAgents(config.agents_dir, skills));

    // Load workflows
    const workflows = yield* _(loadWorkflows(config.workflows_dir));

    return {
      config,
      skills,
      agents,
      workflows,
    };
  });
