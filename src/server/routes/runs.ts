/**
 * Run query endpoints
 */

import { Hono } from 'hono';
import { Effect } from 'effect';
import { DatabaseService } from '../../runtime/db/layer.js';
import { logger } from '../../utils/logger.js';
import { getServerContext } from '../context.js';

const app = new Hono();

/**
 * GET /runs - List recent runs
 */
app.get('/', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '20');
    const context = getServerContext();

    const program = Effect.gen(function* (_) {
      const db = yield* _(DatabaseService);
      
      const result = db.exec(
        `SELECT id, workflow_id, task_id, status, final_output, created_at, updated_at 
         FROM runs ORDER BY created_at DESC LIMIT ?`,
        [limit]
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

    return c.json(runs);

  } catch (error) {
    logger.error({ error }, 'Failed to list runs');
    return c.json({ 
      error: 'Failed to list runs',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

/**
 * GET /runs/:id - Get run details
 */
app.get('/:id', async (c) => {
  const runId = c.req.param('id');
  
  try {
    const context = getServerContext();

    const program = Effect.gen(function* (_) {
      const db = yield* _(DatabaseService);
      
      // Get run
      const runResult = db.exec(
        `SELECT id, workflow_id, task_id, status, final_output, created_at, updated_at 
         FROM runs WHERE id = ?`,
        [runId]
      );

      if (!runResult[0] || runResult[0].values.length === 0) {
        return null;
      }

      const runRow = runResult[0].values[0];
      const run = {
        id: runRow[0],
        workflow_id: runRow[1],
        task_id: runRow[2],
        status: runRow[3],
        final_output: runRow[4],
        created_at: runRow[5],
        updated_at: runRow[6],
      };

      // Get steps
      const stepsResult = db.exec(
        `SELECT id, run_id, step_id, iteration, status, started_at, completed_at, error 
         FROM step_executions WHERE run_id = ? ORDER BY started_at ASC`,
        [runId]
      );

      const steps = stepsResult[0] ? stepsResult[0].values.map(row => ({
        id: row[0],
        run_id: row[1],
        step_id: row[2],
        iteration: row[3],
        status: row[4],
        started_at: row[5],
        completed_at: row[6],
        error: row[7],
      })) : [];

      // Get artifacts
      const artifactsResult = db.exec(
        `SELECT id, run_id, step_id, iteration, storage_type, mime_type, content, file_path, created_at 
         FROM artifacts WHERE run_id = ? ORDER BY created_at ASC`,
        [runId]
      );

      const artifacts = artifactsResult[0] ? artifactsResult[0].values.map(row => ({
        id: row[0],
        run_id: row[1],
        step_id: row[2],
        iteration: row[3],
        storage_type: row[4],
        mime_type: row[5],
        content: row[6],
        file_path: row[7],
        created_at: row[8],
      })) : [];

      return { run, steps, artifacts };
    });

    const details = await Effect.runPromise(
      program.pipe(Effect.provide(context.dbLayer))
    );

    if (!details) {
      return c.json({ error: 'Run not found' }, 404);
    }

    return c.json(details);

  } catch (error) {
    logger.error({ error, runId }, 'Failed to get run details');
    return c.json({ 
      error: 'Failed to get run details',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

/**
 * GET /runs/stats - Get overall statistics
 */
app.get('/stats', async (c) => {
  try {
    const context = getServerContext();

    const program = Effect.gen(function* (_) {
      const db = yield* _(DatabaseService);
      
      const totalRuns = db.exec('SELECT COUNT(*) FROM runs')[0]?.values[0]?.[0] || 0;
      const activeRuns = db.exec("SELECT COUNT(*) FROM runs WHERE status = 'running'")[0]?.values[0]?.[0] || 0;
      const completedRuns = db.exec("SELECT COUNT(*) FROM runs WHERE status = 'completed'")[0]?.values[0]?.[0] || 0;
      const failedRuns = db.exec("SELECT COUNT(*) FROM runs WHERE status = 'failed'")[0]?.values[0]?.[0] || 0;

      return {
        totalRuns,
        activeRuns,
        completedRuns,
        failedRuns,
      };
    });

    const stats = await Effect.runPromise(
      program.pipe(Effect.provide(context.dbLayer))
    );

    return c.json(stats);

  } catch (error) {
    logger.error({ error }, 'Failed to get stats');
    return c.json({ 
      error: 'Failed to get stats',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

export default app;
