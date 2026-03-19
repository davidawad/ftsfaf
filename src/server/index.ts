/**
 * Workflow Engine API Server
 * Main server for task submission and workflow execution
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as appLogger } from '../utils/logger.js';
import tasksRouter from './routes/tasks.js';
import runsRouter from './routes/runs.js';
import configRouter from './routes/config.js';
import streamRouter from './routes/stream.js';

const app = new Hono();

// Enable CORS
app.use('/*', cors({
  origin: '*',
  credentials: true,
}));

// Health check
app.get('/health', (c) => c.json({ 
  status: 'ok', 
  timestamp: Date.now(),
  service: 'ftsfaf-engine'
}));

// API routes
app.route('/tasks', tasksRouter);
app.route('/runs', runsRouter);
app.route('/config', configRouter);
app.route('/stream', streamRouter);

// Root info
app.get('/', (c) => c.json({
  name: 'ftsfaf Workflow Engine API',
  version: '0.1.0',
  endpoints: {
    health: '/health',
    tasks: '/tasks',
    runs: '/runs',
    config: '/config',
    stream: '/stream'
  }
}));

export function startServer(port: number, host = '0.0.0.0') {
  appLogger.info({ port, host }, 'ftsfaf Engine API Server starting');
  appLogger.info(`API: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  appLogger.info(`Health: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/health`);

  return {
    port,
    hostname: host,
    fetch: app.fetch,
  };
}

export default app;
