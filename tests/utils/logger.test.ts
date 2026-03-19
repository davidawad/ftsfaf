import { describe, it, expect } from "vitest";
import { logger } from "../../src/utils/logger.js";

describe("Logger", () => {
  it("should be defined", () => {
    expect(logger).toBeDefined();
  });

  it("should have standard log levels", () => {
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.trace).toBe("function");
  });

  it("should log info messages", () => {
    // Test that calling logger doesn't throw
    expect(() => {
      logger.info("Test info message");
    }).not.toThrow();
  });

  it("should log with context objects", () => {
    expect(() => {
      logger.info({ runId: "run-123", step: "test" }, "Step started");
    }).not.toThrow();
  });

  it("should log error messages", () => {
    expect(() => {
      logger.error({ error: new Error("Test error") }, "Error occurred");
    }).not.toThrow();
  });

  it("should log warn messages", () => {
    expect(() => {
      logger.warn({ agent: "test-agent" }, "Warning message");
    }).not.toThrow();
  });

  it("should log debug messages", () => {
    expect(() => {
      logger.debug({ data: { key: "value" } }, "Debug info");
    }).not.toThrow();
  });

  it("should handle complex objects in context", () => {
    expect(() => {
      logger.info(
        {
          workflow: { id: "wf-1", steps: ["a", "b", "c"] },
          metadata: { priority: "high", tags: ["urgent"] },
        },
        "Complex context"
      );
    }).not.toThrow();
  });

  it("should handle null and undefined values", () => {
    expect(() => {
      logger.info({ value: null, missing: undefined }, "Null values");
    }).not.toThrow();
  });

  it("should support child loggers", () => {
    const child = logger.child({ component: "test-component" });
    
    expect(child).toBeDefined();
    expect(typeof child.info).toBe("function");
    
    expect(() => {
      child.info("Child logger message");
    }).not.toThrow();
  });
});
