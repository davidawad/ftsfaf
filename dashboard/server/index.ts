/**
 * Main Hono server for ftsfaf dashboard
 */

import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { cors } from 'hono/cors';
import api from './routes/api';
import sse from './routes/sse';

const DASHBOARD_PORT = 9482; // Server always on 9482
const DASHBOARD_DEV_PORT = 8383; // Frontend dev server on 8383

const app = new Hono();

// Enable CORS for development
app.use('/*', cors({
  origin: [`http://localhost:${DASHBOARD_DEV_PORT}`, `http://localhost:${DASHBOARD_PORT}`],
  credentials: true,
}));

// API routes
app.route('/api', api);
app.route('/api', sse);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// Serve static files in production (after build)
app.use('/*', serveStatic({ root: './dist' }));
app.use('/*', serveStatic({ path: './dist/index.html' })); // SPA fallback

console.log(`ftsfaf Dashboard server starting on port ${DASHBOARD_PORT}`);
console.log(`Dashboard: http://localhost:${DASHBOARD_PORT}`);
console.log(`API: http://localhost:${DASHBOARD_PORT}/api`);
console.log(`SSE: http://localhost:${DASHBOARD_PORT}/api/stream`);

export default {
  port: DASHBOARD_PORT,
  fetch: app.fetch,
};
