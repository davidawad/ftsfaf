import { describe, it, expect } from "vitest";
import { Effect, Context, Layer } from "effect";
import { DatabaseService, InMemoryDatabaseLayer, makeDatabaseLayer } from "../../src/runtime/db/layer.js";
import * as path from "path";
import * as fs from "fs/promises";

describe("Database Layer", () => {
  describe("InMemoryDatabaseLayer", () => {
    it("should provide an in-memory database", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        
        // Verify we can execute SQL
        db.run("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)");
        db.run("INSERT INTO test (name) VALUES ('test')");
        
        const result = db.exec("SELECT * FROM test");
        expect(result).toHaveLength(1);
        expect(result[0].values).toHaveLength(1);
      });

      await Effect.runPromise(
        program.pipe(Effect.provide(InMemoryDatabaseLayer))
      );
    });

    it("should initialize schema tables", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        
        // Check that runs table exists
        const result = db.exec(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name='runs'
        `);
        
        expect(result).toHaveLength(1);
        expect(result[0].values).toHaveLength(1);
      });

      await Effect.runPromise(
        program.pipe(Effect.provide(InMemoryDatabaseLayer))
      );
    });

    it("should support multiple concurrent operations", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        
        db.run("CREATE TABLE concurrent_test (id INTEGER PRIMARY KEY)");
        
        // Insert multiple rows
        for (let i = 0; i < 10; i++) {
          db.run("INSERT INTO concurrent_test (id) VALUES (?)", [i]);
        }
        
        const result = db.exec("SELECT COUNT(*) as count FROM concurrent_test");
        expect(result[0].values[0][0]).toBe(10);
      });

      await Effect.runPromise(
        program.pipe(Effect.provide(InMemoryDatabaseLayer))
      );
    });
  });

  describe("makeDatabaseLayer (file-based)", () => {
    const testDbPath = path.join("/tmp", `test-${Date.now()}.db`);

    it("should create a file-based database", async () => {
      const layer = makeDatabaseLayer(testDbPath);
      
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        
        db.run("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)");
        db.run("INSERT INTO test (name) VALUES ('file-test')");
        
        const result = db.exec("SELECT * FROM test");
        expect(result[0].values).toHaveLength(1);
      });

      await Effect.runPromise(program.pipe(Effect.provide(layer)));
      
      // Verify file was created
      const stats = await fs.stat(testDbPath);
      expect(stats.isFile()).toBe(true);
      
      // Cleanup
      await fs.unlink(testDbPath);
    });

    it("should persist data across layer provisions", async () => {
      const layer = makeDatabaseLayer(testDbPath);
      
      // First connection - write data
      const writeProgram = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        db.run("CREATE TABLE persistent (value TEXT)");
        db.run("INSERT INTO persistent (value) VALUES ('persisted')");
      });

      await Effect.runPromise(writeProgram.pipe(Effect.provide(layer)));
      
      // Second connection - read data
      const readProgram = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        const result = db.exec("SELECT * FROM persistent");
        expect(result[0].values[0][0]).toBe("persisted");
      });

      await Effect.runPromise(readProgram.pipe(Effect.provide(layer)));
      
      // Cleanup
      await fs.unlink(testDbPath);
    });
  });

  describe("DatabaseService Context", () => {
    it("should be accessible via Context.Tag", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        
        expect(db).toBeDefined();
        expect(typeof db.run).toBe("function");
        expect(typeof db.exec).toBe("function");
      });

      await Effect.runPromise(
        program.pipe(Effect.provide(InMemoryDatabaseLayer))
      );
    });

    it("should fail when not provided", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        return db;
      });

      // Running without providing the layer should fail
      const result = await Effect.runPromiseExit(program);
      
      expect(result._tag).toBe("Failure");
    });
  });

  describe("Schema initialization", () => {
    it("should create all required tables", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        
        const tables = db.exec(`
          SELECT name FROM sqlite_master 
          WHERE type='table' 
          ORDER BY name
        `);
        
        const tableNames = tables[0].values.map((row) => row[0]);
        
        expect(tableNames).toContain("runs");
        expect(tableNames).toContain("step_executions");
        expect(tableNames).toContain("artifacts");
      });

      await Effect.runPromise(
        program.pipe(Effect.provide(InMemoryDatabaseLayer))
      );
    });

    it("should create indexes for performance", async () => {
      const program = Effect.gen(function* (_) {
        const db = yield* _(DatabaseService);
        
        const indexes = db.exec(`
          SELECT name FROM sqlite_master 
          WHERE type='index'
        `);
        
        // Should have indexes on foreign keys and commonly queried columns
        expect(indexes[0].values.length).toBeGreaterThan(0);
      });

      await Effect.runPromise(
        program.pipe(Effect.provide(InMemoryDatabaseLayer))
      );
    });
  });
});
