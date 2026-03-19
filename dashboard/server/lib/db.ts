/**
 * Database operations for the dashboard
 * Read-only access to ftsfaf SQLite database
 */

import initSqlJs, { type Database } from 'sql.js';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { Stats, Run, StepExecution, Artifact, RunDetails, Workflow, Agent } from './types';

const DATABASE_PATH = resolve(import.meta.dir, '../../../data/ftsfaf.sqlite');
const CONFIG_PATH = resolve(import.meta.dir, '../../../');

let db: Database | null = null;

/**
 * Initialize database connection
 */
export async function initDB(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();
  
  try {
    const buffer = await readFile(DATABASE_PATH);
    db = new SQL.Database(buffer);
  } catch (error) {
    // Database doesn't exist yet, create empty one with schema
    console.log('Database not found, creating new database with schema');
    db = new SQL.Database();
    
    // Initialize with empty schema
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS runs (
          id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          status TEXT NOT NULL,
          final_output TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS step_executions (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          step_id TEXT NOT NULL,
          iteration INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL,
          started_at INTEGER,
          completed_at INTEGER,
          error TEXT
        );
        
        CREATE TABLE IF NOT EXISTS artifacts (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          step_id TEXT NOT NULL,
          iteration INTEGER NOT NULL,
          storage_type TEXT NOT NULL,
          mime_type TEXT,
          content TEXT,
          file_path TEXT,
          created_at INTEGER NOT NULL
        );
      `);
    } catch (schemaError) {
      console.error('Failed to initialize schema:', schemaError);
    }
  }

  return db;
}

/**
 * Get overall statistics
 */
export async function getStats(): Promise<Stats> {
  const database = await initDB();

  let totalRuns = 0;
  let activeRuns = 0;
  let completedRuns = 0;
  let failedRuns = 0;

  try {
    totalRuns = database.exec(
      'SELECT COUNT(*) as count FROM runs'
    )[0]?.values[0]?.[0] as number || 0;

    activeRuns = database.exec(
      "SELECT COUNT(*) as count FROM runs WHERE status = 'running'"
    )[0]?.values[0]?.[0] as number || 0;

    completedRuns = database.exec(
      "SELECT COUNT(*) as count FROM runs WHERE status = 'completed'"
    )[0]?.values[0]?.[0] as number || 0;

    failedRuns = database.exec(
      "SELECT COUNT(*) as count FROM runs WHERE status = 'failed'"
    )[0]?.values[0]?.[0] as number || 0;
  } catch (error) {
    console.error('Error getting stats:', error);
    // Return zeros if query fails
  }

  // Count workflows from filesystem
  let totalWorkflows = 0;
  try {
    const { readdir } = await import('fs/promises');
    const workflowsDir = resolve(CONFIG_PATH, 'workflows');
    const files = await readdir(workflowsDir);
    totalWorkflows = files.filter(f => f.endsWith('.json')).length;
  } catch {
    // Workflows directory doesn't exist
  }

  return {
    totalWorkflows,
    totalRuns,
    activeRuns,
    completedRuns,
    failedRuns,
  };
}

/**
 * Get list of workflows from filesystem
 */
export async function getWorkflows(): Promise<Workflow[]> {
  try {
    const { readdir, readFile } = await import('fs/promises');
    const workflowsDir = resolve(CONFIG_PATH, 'workflows');
    const files = await readdir(workflowsDir);
    
    const workflows: Workflow[] = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await readFile(resolve(workflowsDir, file), 'utf-8');
        const workflow = JSON.parse(content);
        workflows.push(workflow);
      }
    }
    
    return workflows;
  } catch {
    return [];
  }
}

/**
 * Get list of agents from filesystem
 */
export async function getAgents(): Promise<Agent[]> {
  try {
    const { readdir, readFile } = await import('fs/promises');
    const agentsDir = resolve(CONFIG_PATH, 'agents');
    const files = await readdir(agentsDir);
    
    const agents: Agent[] = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await readFile(resolve(agentsDir, file), 'utf-8');
        const agent = JSON.parse(content);
        agents.push(agent);
      }
    }
    
    return agents;
  } catch {
    return [];
  }
}

/**
 * Get recent runs
 */
export async function getRecentRuns(limit = 20): Promise<Run[]> {
  const database = await initDB();

  try {
    const result = database.exec(
      `SELECT id, workflow_id, task_id, status, final_output, created_at, updated_at 
       FROM runs ORDER BY created_at DESC LIMIT ${limit}`
    );

    if (!result[0]) return [];

    const runs: Run[] = [];
    for (const row of result[0].values) {
      runs.push({
        id: row[0] as string,
        workflow_id: row[1] as string,
        task_id: row[2] as string,
        status: row[3] as Run['status'],
        final_output: row[4] as string | null,
        created_at: row[5] as number,
        updated_at: row[6] as number,
      });
    }

    return runs;
  } catch (error) {
    console.error('Error getting recent runs:', error);
    return [];
  }
}

/**
 * Get run details
 */
export async function getRunDetails(runId: string): Promise<RunDetails | null> {
  const database = await initDB();

  // Get run
  const runResult = database.exec(
    `SELECT id, workflow_id, task_id, status, final_output, created_at, updated_at 
     FROM runs WHERE id = ?`,
    [runId]
  );

  if (!runResult[0] || runResult[0].values.length === 0) return null;

  const runRow = runResult[0].values[0];
  const run: Run = {
    id: runRow[0] as string,
    workflow_id: runRow[1] as string,
    task_id: runRow[2] as string,
    status: runRow[3] as Run['status'],
    final_output: runRow[4] as string | null,
    created_at: runRow[5] as number,
    updated_at: runRow[6] as number,
  };

  // Get steps
  const stepsResult = database.exec(
    `SELECT id, run_id, step_id, iteration, status, started_at, completed_at, error 
     FROM step_executions WHERE run_id = ? ORDER BY started_at ASC`,
    [runId]
  );

  const steps: StepExecution[] = [];
  if (stepsResult[0]) {
    for (const row of stepsResult[0].values) {
      steps.push({
        id: row[0] as string,
        run_id: row[1] as string,
        step_id: row[2] as string,
        iteration: row[3] as number,
        status: row[4] as StepExecution['status'],
        started_at: row[5] as number | null,
        completed_at: row[6] as number | null,
        error: row[7] as string | null,
      });
    }
  }

  // Get artifacts
  const artifactsResult = database.exec(
    `SELECT id, run_id, step_id, iteration, storage_type, content, file_path, created_at 
     FROM artifacts WHERE run_id = ? ORDER BY created_at ASC`,
    [runId]
  );

  const artifacts: Artifact[] = [];
  if (artifactsResult[0]) {
    for (const row of artifactsResult[0].values) {
      artifacts.push({
        id: row[0] as string,
        run_id: row[1] as string,
        step_id: row[2] as string,
        iteration: row[3] as number,
        storage_type: row[4] as Artifact['storage_type'],
        content: row[5] as string | undefined,
        file_path: row[6] as string | undefined,
        created_at: row[7] as number,
      });
    }
  }

  return { run, steps, artifacts };
}

/**
 * Get runs updated since timestamp (for SSE)
 */
export async function getRunsSince(timestamp: number): Promise<Run[]> {
  const database = await initDB();

  const result = database.exec(
    `SELECT id, workflow_id, task_id, status, final_output, created_at, updated_at 
     FROM runs WHERE updated_at > ? ORDER BY updated_at DESC`,
    [timestamp]
  );

  if (!result[0]) return [];

  const runs: Run[] = [];
  for (const row of result[0].values) {
    runs.push({
      id: row[0] as string,
      workflow_id: row[1] as string,
      task_id: row[2] as string,
      status: row[3] as Run['status'],
      final_output: row[4] as string | null,
      created_at: row[5] as number,
      updated_at: row[6] as number,
    });
  }

  return runs;
}

/**
 * Refresh database connection (reload from disk)
 */
export async function refreshDB(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
  await initDB();
}
