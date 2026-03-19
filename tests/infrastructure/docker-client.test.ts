import { describe, it, expect, vi, beforeEach } from "vitest";
import { Effect } from "effect";
import { DockerClient, DockerError } from "../../src/infrastructure/docker/client.js";
import type { ContainerConfig } from "../../src/infrastructure/docker/types.js";

// Mock child_process exec
vi.mock("child_process", () => ({
  exec: vi.fn(),
}));

vi.mock("util", () => ({
  promisify: (fn: any) => fn,
}));

describe("DockerClient", () => {
  let client: DockerClient;
  let mockExec: any;

  beforeEach(() => {
    client = new DockerClient();
    mockExec = vi.fn();
    
    // Mock the exec function
    const childProcess = require("child_process");
    childProcess.exec = mockExec;
  });

  describe("pullImage", () => {
    it("should pull a Docker image successfully", async () => {
      mockExec.mockImplementation((_cmd: string, callback: any) => {
        callback(null, { stdout: "Image pulled successfully", stderr: "" });
      });

      const result = Effect.runPromiseExit(client.pullImage("nginx:latest"));

      await expect(result).resolves.toMatchObject({
        _tag: "Success",
      });
    });

    it("should handle pull errors", async () => {
      mockExec.mockImplementation((_cmd: string, callback: any) => {
        callback(new Error("Network error"));
      });

      const result = Effect.runPromiseExit(client.pullImage("nginx:latest"));

      await expect(result).resolves.toMatchObject({
        _tag: "Failure",
      });
    });
  });

  describe("startContainer", () => {
    it("should start a container with basic config", async () => {
      mockExec.mockImplementation((_cmd: string, callback: any) => {
        callback(null, { stdout: "abc123def456", stderr: "" });
      });

      const config: ContainerConfig = {
        name: "test-container",
        image: "nginx:latest",
      };

      const result = await Effect.runPromise(client.startContainer(config));

      expect(result).toBe("abc123def456");
    });

    it("should start container with environment variables", async () => {
      mockExec.mockImplementation((cmd: string, callback: any) => {
        expect(cmd).toContain("-e API_KEY=secret");
        expect(cmd).toContain("-e PORT=8080");
        callback(null, { stdout: "container-id", stderr: "" });
      });

      const config: ContainerConfig = {
        name: "test-container",
        image: "nginx:latest",
        env: {
          API_KEY: "secret",
          PORT: "8080",
        },
      };

      await Effect.runPromise(client.startContainer(config));
    });

    it("should start container with port mappings", async () => {
      mockExec.mockImplementation((cmd: string, callback: any) => {
        expect(cmd).toContain("-p 8080:80");
        callback(null, { stdout: "container-id", stderr: "" });
      });

      const config: ContainerConfig = {
        name: "test-container",
        image: "nginx:latest",
        ports: {
          "80": "8080",
        },
      };

      await Effect.runPromise(client.startContainer(config));
    });

    it("should start container with volume mounts", async () => {
      mockExec.mockImplementation((cmd: string, callback: any) => {
        expect(cmd).toContain("-v /host/path:/container/path");
        callback(null, { stdout: "container-id", stderr: "" });
      });

      const config: ContainerConfig = {
        name: "test-container",
        image: "nginx:latest",
        volumes: {
          "/host/path": "/container/path",
        },
      };

      await Effect.runPromise(client.startContainer(config));
    });
  });

  describe("stopContainer", () => {
    it("should stop a container", async () => {
      mockExec.mockImplementation((_cmd: string, callback: any) => {
        callback(null, { stdout: "", stderr: "" });
      });

      const result = Effect.runPromiseExit(client.stopContainer("test-container"));

      await expect(result).resolves.toMatchObject({
        _tag: "Success",
      });
    });

    it("should handle stop errors", async () => {
      mockExec.mockImplementation((_cmd: string, callback: any) => {
        callback(null, { stdout: "", stderr: "Error: No such container" });
      });

      const result = Effect.runPromiseExit(client.stopContainer("non-existent"));

      await expect(result).resolves.toMatchObject({
        _tag: "Failure",
      });
    });
  });

  describe("removeContainer", () => {
    it("should remove a container", async () => {
      mockExec.mockImplementation((_cmd: string, callback: any) => {
        callback(null, { stdout: "", stderr: "" });
      });

      const result = Effect.runPromiseExit(
        client.removeContainer("test-container")
      );

      await expect(result).resolves.toMatchObject({
        _tag: "Success",
      });
    });

    it("should force remove a container", async () => {
      mockExec.mockImplementation((cmd: string, callback: any) => {
        expect(cmd).toContain("-f");
        callback(null, { stdout: "", stderr: "" });
      });

      await Effect.runPromise(client.removeContainer("test-container", true));
    });
  });

  describe("inspectContainer", () => {
    it("should inspect a container and return info", async () => {
      const mockInspectData = {
        Id: "abc123def456",
        Name: "/test-container",
        State: {
          Status: "running",
        },
        NetworkSettings: {
          Ports: {
            "80/tcp": [{ HostPort: "8080" }],
          },
        },
      };

      mockExec.mockImplementation((_cmd: string, callback: any) => {
        callback(null, { stdout: JSON.stringify(mockInspectData), stderr: "" });
      });

      const info = await Effect.runPromise(
        client.inspectContainer("test-container")
      );

      expect(info).toMatchObject({
        id: "abc123def456",
        name: "test-container",
        status: "running",
        ports: {
          "80/tcp": "8080",
        },
      });
    });

    it("should handle containers without port mappings", async () => {
      const mockInspectData = {
        Id: "abc123",
        Name: "/test-container",
        State: {
          Status: "exited",
        },
        NetworkSettings: {},
      };

      mockExec.mockImplementation((_cmd: string, callback: any) => {
        callback(null, { stdout: JSON.stringify(mockInspectData), stderr: "" });
      });

      const info = await Effect.runPromise(
        client.inspectContainer("test-container")
      );

      expect(info.ports).toEqual({});
    });
  });

  describe("containerExists", () => {
    it("should return true when container exists", async () => {
      mockExec.mockImplementation((_cmd: string, callback: any) => {
        callback(null, { stdout: "test-container\n", stderr: "" });
      });

      const exists = await Effect.runPromise(
        client.containerExists("test-container")
      );

      expect(exists).toBe(true);
    });

    it("should return false when container does not exist", async () => {
      mockExec.mockImplementation((_cmd: string, callback: any) => {
        callback(null, { stdout: "", stderr: "" });
      });

      const exists = await Effect.runPromise(
        client.containerExists("non-existent")
      );

      expect(exists).toBe(false);
    });
  });

  describe("getLogs", () => {
    it("should get container logs", async () => {
      mockExec.mockImplementation((_cmd: string, callback: any) => {
        callback(null, {
          stdout: "Log line 1\nLog line 2\nLog line 3",
          stderr: "",
        });
      });

      const logs = await Effect.runPromise(
        client.getLogs("test-container", 100)
      );

      expect(logs).toContain("Log line 1");
      expect(logs).toContain("Log line 2");
    });

    it("should respect tail parameter", async () => {
      mockExec.mockImplementation((cmd: string, callback: any) => {
        expect(cmd).toContain("--tail 50");
        callback(null, { stdout: "logs", stderr: "" });
      });

      await Effect.runPromise(client.getLogs("test-container", 50));
    });
  });

  describe("DockerError", () => {
    it("should create error with stderr", () => {
      const error = new DockerError("Test error", "stderr content");

      expect(error.message).toBe("Test error");
      expect(error.stderr).toBe("stderr content");
      expect(error.name).toBe("DockerError");
    });
  });
});
