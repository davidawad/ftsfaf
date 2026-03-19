import { Effect } from "effect";
import initSqlJs, { type Database } from "sql.js";
import * as fs from "fs/promises";
import { initSchema } from "./schema.js";
import { DATABASE_PATH, DATA_PATH } from "../../utils/constants.js";

/**
 * Initialize a persistent SQLite database
 */
export const initDb = (): Effect.Effect<Database, Error> =>
  Effect.gen(function* (_) {
    // Initialize SQL.js
    const SQL = yield* _(
      Effect.tryPromise({
        try: () => initSqlJs(),
        catch: (error) => new Error(`Failed to initialize SQL.js: ${String(error)}`),
      })
    );

    // Ensure data directory exists
    yield* _(
      Effect.tryPromise({
        try: async () => {
          await fs.mkdir(DATA_PATH, { recursive: true });
        },
        catch: (error) => new Error(`Failed to create data directory: ${String(error)}`),
      })
    );

    // Load or create database file
    const db = yield* _(
      Effect.tryPromise({
        try: async () => {
          try {
            // Try to load existing database
            const data = await fs.readFile(DATABASE_PATH);
            return new SQL.Database(data);
          } catch {
            // Create new database if file doesn't exist
            return new SQL.Database();
          }
        },
        catch: (error) => new Error(`Failed to load database: ${String(error)}`),
      })
    );

    // Initialize schema (safe if already exists)
    initSchema(db);

    // Save to disk
    yield* _(
      Effect.tryPromise({
        try: async () => {
          const data = db.export();
          await fs.writeFile(DATABASE_PATH, data);
        },
        catch: (error) => new Error(`Failed to save database: ${String(error)}`),
      })
    );

    return db;
  });

/**
 * Close a database connection and save to disk
 */
export const closeDb = (db: Database): Effect.Effect<void, Error> =>
  Effect.gen(function* (_) {
    // Save database to disk before closing
    yield* _(
      Effect.tryPromise({
        try: async () => {
          const data = db.export();
          await fs.writeFile(DATABASE_PATH, data);
        },
        catch: (error) => new Error(`Failed to save database on close: ${String(error)}`),
      })
    );

    // Close the database
    yield* _(Effect.sync(() => db.close()));
  });
