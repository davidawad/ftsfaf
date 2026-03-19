import { describe, it, expect } from "vitest";
import {
  SANDBOX_BASE_PATH,
  OUTPUTS_PATH,
  DATA_PATH,
  DATABASE_PATH,
  DASHBOARD_PORT,
} from "../../src/utils/constants.js";

describe("Constants", () => {
  describe("Path constants", () => {
    it("should define SANDBOX_BASE_PATH", () => {
      expect(SANDBOX_BASE_PATH).toBeDefined();
      expect(typeof SANDBOX_BASE_PATH).toBe("string");
      expect(SANDBOX_BASE_PATH.length).toBeGreaterThan(0);
    });

    it("should define OUTPUTS_PATH", () => {
      expect(OUTPUTS_PATH).toBeDefined();
      expect(typeof OUTPUTS_PATH).toBe("string");
      expect(OUTPUTS_PATH.length).toBeGreaterThan(0);
    });

    it("should define DATA_PATH", () => {
      expect(DATA_PATH).toBeDefined();
      expect(typeof DATA_PATH).toBe("string");
      expect(DATA_PATH.length).toBeGreaterThan(0);
    });

    it("should define DATABASE_PATH", () => {
      expect(DATABASE_PATH).toBeDefined();
      expect(typeof DATABASE_PATH).toBe("string");
      expect(DATABASE_PATH.length).toBeGreaterThan(0);
      expect(DATABASE_PATH).toContain("ftsfaf.sqlite");
    });

    it("DATABASE_PATH should be within DATA_PATH", () => {
      expect(DATABASE_PATH).toContain(DATA_PATH);
    });
  });

  describe("Server configuration constants", () => {
    it("should define DASHBOARD_PORT", () => {
      expect(DASHBOARD_PORT).toBeDefined();
      expect(typeof DASHBOARD_PORT).toBe("number");
      expect(DASHBOARD_PORT).toBeGreaterThan(0);
      expect(DASHBOARD_PORT).toBeLessThan(65536);
    });

    it("DASHBOARD_PORT should be a valid port number", () => {
      expect(Number.isInteger(DASHBOARD_PORT)).toBe(true);
    });
  });

  describe("Path structure", () => {
    it("paths should be absolute", () => {
      // Absolute paths on Unix start with /, on Windows with drive letter
      expect(
        SANDBOX_BASE_PATH.startsWith("/") || /^[A-Z]:\\/.test(SANDBOX_BASE_PATH)
      ).toBe(true);
      expect(
        OUTPUTS_PATH.startsWith("/") || /^[A-Z]:\\/.test(OUTPUTS_PATH)
      ).toBe(true);
      expect(
        DATA_PATH.startsWith("/") || /^[A-Z]:\\/.test(DATA_PATH)
      ).toBe(true);
    });
  });
});
