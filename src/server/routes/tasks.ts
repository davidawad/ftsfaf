/**
 * Task submission and query endpoints
 */

import { Hono } from 'hono';
import { Effect } from 'effect';
import { v4 as uuidv4 } from 'uuid';
import { TaskSchema } from '../../config/schema.js';
import { loadAllConfigs } from '../../config/loader.js';
import { executeWorkflow } from '../../runtime/executor.js';
import { DatabaseService } from '../../runtime/db/layer.js';
import { logger } from '../../utils/logger.js';
import { getServerContext } from '../context.js';

const app = new Hono();

/**
 * POST /tasks - Submit a new task for execution
 * Body: { workflow: string, input: string, metadata?: object }
 */
app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    
    // Validate task input
    const taskId = `task-${uuidv4()}`;
    const task = {
      id: taskId,
      workflow: body.workflow,
      input: body.input,
      metadata: {
        ...body.metadata,
        source: 'api',
        createdAt: new Date().toISOString(),
      },
    };

    // Validate against schema
    const validated = TaskSchema.decode(task);
    if (!validated._tag || validated._tag === 'Left') {
      return c.json({ error: 'Invalid task format' }, 400);
    }

    logger.info({ taskId, workflow: task.workflow }, 'Task submitted');

    // Get server context
    const context = getServerContext();
    const { workDir } = context;

    // Execute workflow asynchronously
    const program = Effect.gen(function* (_) {
      // Load configurations
      const result = yield* _(loadAllConfigs(`${workDir}/ftsfaf.config.json`));
      const { config, skills, agents, workflows } = result;

      // Find workflow
      const workflow = workflows.get(task.workflow);
      if (!workflow) {
        throw new Error(`Workflow not found: ${task.workflow}`);
      }

      // Get database
      const db = yield* _(DatabaseService);

      // Execute workflow
      const run = yield* _(
        executeWorkflow(
          db,
          workflow,
          task,
          agents,
          skills,
          config.default_system_prompt
        )
      );

      logger.info({ runId: run.id, taskId, status: run.status }, 'Workflow execution completed');
      
      return run;
    });

    // Run in background (don't await)
    Effect.runPromise(
      program.pipe(Effect.provide(context.dbLayer))
    ).catch((error) => {
      logger.error({ error, taskId }, 'Workflow execution failed');
    });

    // Return immediately with task ID
    return c.json({
      task_id: taskId,
      status: 'submitted',
      message: 'Task queued for execution'
    }, 202);

  } catch (error) {
    logger.error({ error }, 'Failed to submit task');
    return c.json({ 
      error: 'Failed to submit task',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

/**
 * GET /tasks/:id - Get task details
 */
app.get('/:id', async (c) => {
  const taskId = c.req.param('id');
  
  try {
    const context = getServerContext();
    
    const program = Effect.gen(function* (_) {
      const db = yield* _(DatabaseService);
      
      // Query runs table for this task
      const result = db.exec(
        'SELECT * FROM runs WHERE task_id = ? ORDER BY created_at DESC LIMIT 1',
        [taskId]
      );

      if (!result[0] || result[0].values.length === 0) {
        return null;
      }

      const row = result[0].values[0];
      return {
        task_id: taskId,
        run_id: row[0],
        workflow_id: row[1],
        status: row[3],
        created_at: row[5],
        updated_at: row[6],
      };
    });

    const task = await Effect.runPromise(
      program.pipe(Effect.provide(context.dbLayer))
    );

    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }

    return c.json(task);

  } catch (error) {
    logger.error({ error, taskId }, 'Failed to get task');
    return c.json({ 
      error: 'Failed to get task',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

export default app;
