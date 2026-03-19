import { describe, it, expect, beforeEach } from "vitest";
import { AdapterRegistry } from "../../src/adapters/registry.js";
import type { AgentAdapter, AgentTaskResult } from "../../src/adapters/base.js";
import { Effect } from "effect";

// Mock adapter for testing
class MockAdapter implements AgentAdapter {
  constructor(private agentType: string) {}

  startAgent = () => Effect.succeed(undefined);
  stopAgent = () => Effect.succeed(undefined);
  executeTask = () =>
    Effect.succeed({
      content: "mock result",
      metadata: {},
    } as AgentTaskResult);
  isRunning = () => false;
}

describe("AdapterRegistry", () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  describe("register", () => {
    it("should register an adapter for an agent type", () => {
      const adapter = new MockAdapter("test-type");

      registry.register("test-type", adapter);

      expect(registry.has("test-type")).toBe(true);
      expect(registry.get("test-type")).toBe(adapter);
    });

    it("should throw error when registering duplicate agent type", () => {
      const adapter1 = new MockAdapter("test-type");
      const adapter2 = new MockAdapter("test-type");

      registry.register("test-type", adapter1);

      expect(() => registry.register("test-type", adapter2)).toThrow(
        "Adapter already registered for agent type: test-type"
      );
    });

    it("should allow registering multiple different agent types", () => {
      const adapter1 = new MockAdapter("type1");
      const adapter2 = new MockAdapter("type2");
      const adapter3 = new MockAdapter("type3");

      registry.register("type1", adapter1);
      registry.register("type2", adapter2);
      registry.register("type3", adapter3);

      expect(registry.has("type1")).toBe(true);
      expect(registry.has("type2")).toBe(true);
      expect(registry.has("type3")).toBe(true);
    });
  });

  describe("get", () => {
    it("should return adapter for registered type", () => {
      const adapter = new MockAdapter("test-type");
      registry.register("test-type", adapter);

      const retrieved = registry.get("test-type");

      expect(retrieved).toBe(adapter);
    });

    it("should return undefined for unregistered type", () => {
      const result = registry.get("non-existent-type");

      expect(result).toBeUndefined();
    });
  });

  describe("has", () => {
    it("should return true for registered type", () => {
      const adapter = new MockAdapter("test-type");
      registry.register("test-type", adapter);

      expect(registry.has("test-type")).toBe(true);
    });

    it("should return false for unregistered type", () => {
      expect(registry.has("non-existent-type")).toBe(false);
    });
  });

  describe("getAgentTypes", () => {
    it("should return empty array for new registry", () => {
      expect(registry.getAgentTypes()).toEqual([]);
    });

    it("should return all registered agent types", () => {
      const adapter1 = new MockAdapter("type1");
      const adapter2 = new MockAdapter("type2");
      const adapter3 = new MockAdapter("type3");

      registry.register("type1", adapter1);
      registry.register("type2", adapter2);
      registry.register("type3", adapter3);

      const types = registry.getAgentTypes();

      expect(types).toHaveLength(3);
      expect(types).toContain("type1");
      expect(types).toContain("type2");
      expect(types).toContain("type3");
    });
  });

  describe("getAll", () => {
    it("should return empty array for new registry", () => {
      expect(registry.getAll()).toEqual([]);
    });

    it("should return all registered adapters", () => {
      const adapter1 = new MockAdapter("type1");
      const adapter2 = new MockAdapter("type2");

      registry.register("type1", adapter1);
      registry.register("type2", adapter2);

      const adapters = registry.getAll();

      expect(adapters).toHaveLength(2);
      expect(adapters).toContain(adapter1);
      expect(adapters).toContain(adapter2);
    });
  });
});
