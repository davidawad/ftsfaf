import { Effect, Schema as S } from "effect";

/**
 * Interpolation context for rendering prompts
 */
export interface InterpolationContext {
  readonly task: {
    readonly id: string;
    readonly workflow: string;
    readonly input: string;
    readonly [key: string]: unknown;
  };
  readonly artifacts: Record<string, string>;
  readonly run: {
    readonly id: string;
  };
  readonly step: {
    readonly id: string;
    readonly iteration: number;
  };
}

/**
 * Custom error for interpolation failures
 */
export class InterpolationError extends S.TaggedError<InterpolationError>(
  "InterpolationError"
)("InterpolationError", {
  message: S.String,
  template: S.String,
  missingVariables: S.Array(S.String),
}) {}

/**
 * Extract variable names from template
 */
const extractVariables = (template: string): string[] => {
  const regex = /\{\{([^}]+)\}\}/g;
  const variables: string[] = [];
  let match;

  while ((match = regex.exec(template)) !== null) {
    variables.push(match[1].trim());
  }

  return variables;
};

/**
 * Resolve a variable path from context
 * Supports dot notation: task.id, artifacts.stepId, etc.
 */
const resolveVariable = (
  path: string,
  context: InterpolationContext
): string | undefined => {
  const parts = path.split(".");
  let current: unknown = context;

  for (const part of parts) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current === undefined || current === null
    ? undefined
    : String(current);
};

/**
 * Interpolate template with context
 */
export const interpolate = (
  template: string,
  context: InterpolationContext
): Effect.Effect<string, InterpolationError> =>
  Effect.gen(function* (_) {
    const variables = extractVariables(template);
    const missingVariables: string[] = [];

    // Check all variables can be resolved
    for (const variable of variables) {
      const value = resolveVariable(variable, context);
      if (value === undefined) {
        missingVariables.push(variable);
      }
    }

    if (missingVariables.length > 0) {
      return yield* _(
        Effect.fail(
          new InterpolationError({
            message: `Missing variables in template: ${missingVariables.join(", ")}`,
            template,
            missingVariables,
          })
        )
      );
    }

    // Replace all variables
    const result = template.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
      const trimmed = variable.trim();
      const value = resolveVariable(trimmed, context);
      return value ?? match; // Should never be undefined due to check above
    });

    return result;
  });

/**
 * Build interpolation context from run data
 */
export const buildContext = (
  task: Record<string, unknown>,
  artifacts: Record<string, string>,
  runId: string,
  stepId: string,
  iteration: number
): InterpolationContext => {
  // Ensure task has required fields
  const taskContext = {
    id: String(task.id ?? ""),
    workflow: String(task.workflow ?? ""),
    input: String(task.input ?? ""),
    ...task,
  };

  return {
    task: taskContext,
    artifacts,
    run: { id: runId },
    step: { id: stepId, iteration },
  };
};

/**
 * Interpolate multiple templates in sequence
 */
export const interpolateAll = (
  templates: readonly string[],
  context: InterpolationContext
): Effect.Effect<readonly string[], InterpolationError> =>
  Effect.all(templates.map((template) => interpolate(template, context)));
