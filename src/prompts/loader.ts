import { Effect, Schema as S } from "effect";
import * as fs from "fs/promises";
import { logger } from "../utils/logger.js";

/**
 * Custom error for prompt loading
 */
export class PromptLoadError extends S.TaggedError<PromptLoadError>(
  "PromptLoadError"
)("PromptLoadError", {
  message: S.String,
  path: S.String,
  cause: S.optional(S.Unknown),
}) {}

/**
 * Default system prompt used when no custom prompt is provided
 */
export const DEFAULT_SYSTEM_PROMPT = `You are an AI agent in a multi-agent workflow system.
You will receive tasks with specific instructions.
Analyze the task carefully and provide clear, well-structured output.
Focus on quality and accuracy in your responses.`;

/**
 * Check if a string looks like a file path (vs inline text)
 * A string is considered a file path if it:
 * - Contains a forward slash (/)
 * - Ends with .md or .txt
 * - Starts with ./ or ../
 */
const isFilePath = (str: string): boolean => {
  if (!str) return false;
  return (
    str.includes("/") ||
    str.endsWith(".md") ||
    str.endsWith(".txt") ||
    str.startsWith("./") ||
    str.startsWith("../")
  );
};

/**
 * Load a system prompt from a markdown file
 */
export const loadSystemPrompt = (
  promptPath: string
): Effect.Effect<string, PromptLoadError> =>
  Effect.tryPromise({
    try: () => fs.readFile(promptPath, "utf-8"),
    catch: (error) =>
      new PromptLoadError({
        message: `Failed to load system prompt: ${String(error)}`,
        path: promptPath,
        cause: error,
      }),
  });

/**
 * Load system prompt with fallback to default
 * If the file doesn't exist or can't be loaded, returns the default prompt
 */
export const loadSystemPromptWithFallback = (
  promptPath?: string
): Effect.Effect<string, never> =>
  Effect.gen(function* (_) {
    if (!promptPath) {
      return DEFAULT_SYSTEM_PROMPT;
    }

    const result = yield* _(
      Effect.either(loadSystemPrompt(promptPath))
    );

    if (result._tag === "Left") {
      // Failed to load, use default
      logger.warn({ promptPath }, "Failed to load system prompt, using default");
      return DEFAULT_SYSTEM_PROMPT;
    }

    return result.right;
  });

/**
 * Get system prompt for an agent
 * Supports both inline text and file paths
 * Tries agent-specific prompt first, then falls back to global default
 */
export const getAgentSystemPrompt = (
  agentPromptPath?: string,
  globalDefaultPath?: string
): Effect.Effect<string, never> =>
  Effect.gen(function* (_) {
    // Try agent-specific prompt first
    if (agentPromptPath) {
      // Check if it's inline text or a file path
      if (isFilePath(agentPromptPath)) {
        // It's a file path, try to load it
        const agentResult = yield* _(
          Effect.either(loadSystemPrompt(agentPromptPath))
        );

        if (agentResult._tag === "Right") {
          return agentResult.right;
        }
      } else {
        // It's inline text, use it directly
        logger.debug({ agentPromptPath: agentPromptPath.substring(0, 50) + "..." }, "Using inline system prompt");
        return agentPromptPath;
      }
    }

    // Try global default
    if (globalDefaultPath) {
      // Check if it's inline text or a file path
      if (isFilePath(globalDefaultPath)) {
        const globalResult = yield* _(
          Effect.either(loadSystemPrompt(globalDefaultPath))
        );

        if (globalResult._tag === "Right") {
          return globalResult.right;
        }
      } else {
        // It's inline text, use it directly
        logger.debug({ globalDefaultPath: globalDefaultPath.substring(0, 50) + "..." }, "Using inline global default prompt");
        return globalDefaultPath;
      }
    }

    // Fall back to built-in default
    logger.debug("Using built-in DEFAULT_SYSTEM_PROMPT");
    return DEFAULT_SYSTEM_PROMPT;
  });
