/**
 * API routes for dashboard
 */

import { Hono } from 'hono';
import * as engineClient from '../lib/engine-client';

const api = new Hono();

// Get statistics
api.get('/stats', async (c) => {
  try {
    const stats = await engineClient.getStats();
    return c.json(stats);
  } catch (error) {
    console.error('Failed to get stats:', error);
    return c.json({ error: 'Failed to get stats from engine' }, 500);
  }
});

// Get workflows
api.get('/workflows', async (c) => {
  try {
    const workflows = await engineClient.getWorkflows();
    return c.json(workflows);
  } catch (error) {
    console.error('Failed to get workflows:', error);
    return c.json({ error: 'Failed to get workflows from engine' }, 500);
  }
});

// Get agents
api.get('/agents', async (c) => {
  try {
    const agents = await engineClient.getAgents();
    return c.json(agents);
  } catch (error) {
    console.error('Failed to get agents:', error);
    return c.json({ error: 'Failed to get agents from engine' }, 500);
  }
});

// Get recent runs
api.get('/runs', async (c) => {
  try {
    const limit = c.req.query('limit');
    const runs = await engineClient.getRecentRuns(limit ? parseInt(limit) : 20);
    return c.json(runs);
  } catch (error) {
    console.error('Failed to get runs:', error);
    return c.json({ error: 'Failed to get runs from engine' }, 500);
  }
});

// Get run details
api.get('/runs/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const details = await engineClient.getRunDetails(id);
    
    if (!details) {
      return c.json({ error: 'Run not found' }, 404);
    }
    
    return c.json(details);
  } catch (error) {
    console.error('Failed to get run details:', error);
    return c.json({ error: 'Failed to get run details from engine' }, 500);
  }
});

export default api;
