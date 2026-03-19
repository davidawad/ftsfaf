import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Effect } from "effect";
import * as fs from "fs/promises";
import * as path from "path";
import {
  loadSystemPrompt,
  loadSystemPromptWithFallback,
  getAgentSystemPrompt,
  DEFAULT_SYSTEM_PROMPT,
  PromptLoadError,
} from "../../src/prompts/loader.js";

describe("Prompt Loader", () => {
  const testDir = "./tests/fixtures/prompts";
  const testPromptPath = path.join(testDir, "test-prompt.md");
  const agentPromptPath = path.join(testDir, "agent-prompt.md");

  beforeAll(async () => {
    // Create test directory and files
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(
      testPromptPath,
      "You are a test agent. This is a test system prompt."
    );
    await fs.writeFile(
      agentPromptPath,
      "You are a specialized agent with custom instructions."
    );
  });

  afterAll(async () => {
    // Clean up test files
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("loadSystemPrompt", () => {
    it("should load a system prompt from file", async () => {
      const result = await Effect.runPromise(
        loadSystemPrompt(testPromptPath)
      );

      expect(result).toBe(
        "You are a test agent. This is a test system prompt."
      );
    });

    it("should fail with PromptLoadError for non-existent file", async () => {
      const result = await Effect.runPromiseExit(
        loadSystemPrompt("./non-existent-prompt.md")
      );

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.cause).toMatchObject({
          _tag: "Fail",
          error: expect.objectContaining({
            _tag: "PromptLoadError",
          }),
        });
      }
    });

    it("should load multiline prompts correctly", async () => {
      const multilinePath = path.join(testDir, "multiline.md");
      const multilineContent = `Line 1
Line 2
Line 3`;

      await fs.writeFile(multilinePath, multilineContent);

      const result = await Effect.runPromise(loadSystemPrompt(multilinePath));

      expect(result).toBe(multilineContent);
    });
  });

  describe("loadSystemPromptWithFallback", () => {
    it("should load system prompt when file exists", async () => {
      const result = await Effect.runPromise(
        loadSystemPromptWithFallback(testPromptPath)
      );

      expect(result).toBe(
        "You are a test agent. This is a test system prompt."
      );
    });

    it("should return default prompt when file does not exist", async () => {
      const result = await Effect.runPromise(
        loadSystemPromptWithFallback("./non-existent.md")
      );

      expect(result).toBe(DEFAULT_SYSTEM_PROMPT);
    });

    it("should return default prompt when path is undefined", async () => {
      const result = await Effect.runPromise(
        loadSystemPromptWithFallback(undefined)
      );

      expect(result).toBe(DEFAULT_SYSTEM_PROMPT);
    });

    it("should never fail", async () => {
      // Even with invalid paths, should return default
      const results = await Promise.all([
        Effect.runPromise(loadSystemPromptWithFallback("/invalid/path.md")),
        Effect.runPromise(loadSystemPromptWithFallback("")),
        Effect.runPromise(loadSystemPromptWithFallback(undefined)),
      ]);

      results.forEach((result) => {
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
      });
    });
  });

  describe("getAgentSystemPrompt", () => {
    it("should return agent-specific prompt when available", async () => {
      const result = await Effect.runPromise(
        getAgentSystemPrompt(agentPromptPath, testPromptPath)
      );

      expect(result).toBe(
        "You are a specialized agent with custom instructions."
      );
    });

    it("should fall back to global default when agent prompt is missing", async () => {
      const result = await Effect.runPromise(
        getAgentSystemPrompt("./non-existent.md", testPromptPath)
      );

      expect(result).toBe(
        "You are a test agent. This is a test system prompt."
      );
    });

    it("should fall back to built-in default when both are missing", async () => {
      const result = await Effect.runPromise(
        getAgentSystemPrompt("./missing1.md", "./missing2.md")
      );

      expect(result).toBe(DEFAULT_SYSTEM_PROMPT);
    });

    it("should use global default when agent prompt is undefined", async () => {
      const result = await Effect.runPromise(
        getAgentSystemPrompt(undefined, testPromptPath)
      );

      expect(result).toBe(
        "You are a test agent. This is a test system prompt."
      );
    });

    it("should use built-in default when both paths are undefined", async () => {
      const result = await Effect.runPromise(
        getAgentSystemPrompt(undefined, undefined)
      );

      expect(result).toBe(DEFAULT_SYSTEM_PROMPT);
    });

    it("should never fail regardless of input", async () => {
      const testCases = [
        [undefined, undefined],
        [undefined, "./missing.md"],
        ["./missing1.md", undefined],
        ["./missing1.md", "./missing2.md"],
        ["", ""],
        ["/invalid/path.md", "/another/invalid.md"],
      ];

      const results = await Promise.all(
        testCases.map(([agent, global]) =>
          Effect.runPromise(getAgentSystemPrompt(agent, global))
        )
      );

      results.forEach((result) => {
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
      });
    });
  });

  describe("DEFAULT_SYSTEM_PROMPT", () => {
    it("should be a non-empty string", () => {
      expect(typeof DEFAULT_SYSTEM_PROMPT).toBe("string");
      expect(DEFAULT_SYSTEM_PROMPT.length).toBeGreaterThan(0);
    });

    it("should contain guidance for agents", () => {
      expect(DEFAULT_SYSTEM_PROMPT.toLowerCase()).toContain("agent");
      expect(DEFAULT_SYSTEM_PROMPT.toLowerCase()).toContain("task");
    });
  });
});
