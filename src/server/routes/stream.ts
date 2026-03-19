/**
 * Server-Sent Events (SSE) endpoint for live updates
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { Effect } from 'effect';
import { DatabaseService } from '../../runtime/db/layer.js';
import { logger } from '../../utils/logger.js';
import { getServerContext } from '../context.js';

const app = new Hono();

/**
 * GET /stream - SSE stream for run updates
 */
app.get('/', (c) => {
  return streamSSE(c, async (stream) => {
    let lastUpdateTime = Date.now();
    let isActive = true;

    // Send initial connection message
    await stream.writeSSE({
      data: JSON.stringify({ type: 'connected', timestamp: Date.now() }),
      event: 'connected',
    });

    // Poll for updates every second
    const pollInterval = setInterval(async () => {
      if (!isActive) {
        clearInterval(pollInterval);
        return;
      }

      try {
        const context = getServerContext();

        const program = Effect.gen(function* (_) {
          const db = yield* _(DatabaseService);
          
          // Get runs updated since last check
          const result = db.exec(
            `SELECT id, workflow_id, task_id, status, final_output, created_at, updated_at 
             FROM runs WHERE updated_at > ? ORDER BY updated_at DESC`,
            [lastUpdateTime]
          );

          if (!result[0]) return [];

          const runs = result[0].values.map(row => ({
            id: row[0],
            workflow_id: row[1],
            task_id: row[2],
            status: row[3],
            final_output: row[4],
            created_at: row[5],
            updated_at: row[6],
          }));

          return runs;
        });

        const runs = await Effect.runPromise(
          program.pipe(Effect.provide(context.dbLayer))
        );

        // Send updates if any
        if (runs.length > 0) {
          await stream.writeSSE({
            data: JSON.stringify({ type: 'run_updates', runs }),
            event: 'update',
          });

          // Update last check time
          lastUpdateTime = Date.now();
        }

      } catch (error) {
        logger.error({ error }, 'Error polling for updates');
      }
    }, 1000);

    // Handle client disconnect
    stream.onAbort(() => {
      isActive = false;
      clearInterval(pollInterval);
      logger.debug('SSE client disconnected');
    });
  });
});

export default app;
