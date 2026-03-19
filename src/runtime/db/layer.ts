import { Context, Effect, Layer } from "effect";
import initSqlJs, { type Database } from "sql.js";
import { initSchema } from "./schema.js";
import { logger } from "../../utils/logger.js";

/**
 * Database service tag
 */
export class DatabaseService extends Context.Tag("DatabaseService")<
  DatabaseService,
  Database
>() {}

/**
 * Create a database layer from a file path
 */
export const makeDatabaseLayer = (
  dbPath?: string
): Layer.Layer<DatabaseService, never> =>
  Layer.scoped(
    DatabaseService,
    Effect.gen(function* (_) {
      // Initialize SQL.js
      const SQL = yield* _(
        Effect.promise(() => initSqlJs())
      );

      // Create or open database
      let db: Database;
      if (dbPath) {
        // Try to load existing database from file
        const fs = yield* _(Effect.promise(() => import("fs/promises")));
        
        // Try to read existing database, returns undefined if file doesn't exist
        const existingDataResult = yield* _(
          Effect.tryPromise({
            try: () => fs.readFile(dbPath),
            catch: (error) => error,
          }).pipe(Effect.option)
        );

        const existingData = existingDataResult._tag === "Some" ? existingDataResult.value : undefined;

        db = existingData
          ? new SQL.Database(new Uint8Array(existingData))
          : new SQL.Database();

        // Set up periodic save to file
        const saveInterval = setInterval(() => {
          Effect.runPromise(
            Effect.tryPromise({
              try: async () => {
                const data = db.export();
                await fs.writeFile(dbPath, data);
              },
              catch: (error) => {
                logger.error({ error, dbPath }, "Failed to save database");
                return error;
              },
            })
          );
        }, 5000); // Save every 5 seconds

        // Clean up on scope exit
        yield* _(
          Effect.addFinalizer(() =>
            Effect.tryPromise({
              try: async () => {
                clearInterval(saveInterval);
                // Final save
                const data = db.export();
                const fsSync = await import("fs");
                fsSync.writeFileSync(dbPath, data);
                db.close();
              },
              catch: () => undefined,
            })
          )
        );
      } else {
        // In-memory database
        db = new SQL.Database();

        // Clean up on scope exit
        yield* _(
          Effect.addFinalizer(() =>
            Effect.sync(() => {
              db.close();
            })
          )
        );
      }

      // Initialize schema
      initSchema(db);

      return db;
    })
  );

/**
 * In-memory database layer (for testing)
 */
export const InMemoryDatabaseLayer: Layer.Layer<DatabaseService, never> =
  makeDatabaseLayer();
