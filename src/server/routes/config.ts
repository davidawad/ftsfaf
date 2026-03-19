/**
 * Configuration query endpoints (workflows, agents, skills)
 */

import { Hono } from 'hono';
import { readdir, readFile } from 'fs/promises';
import { resolve } from 'path';
import { logger } from '../../utils/logger.js';
import { getServerContext } from '../context.js';

const app = new Hono();

/**
 * GET /config/workflows - List all workflows
 */
app.get('/workflows', async (c) => {
  try {
    const { workDir } = getServerContext();
    const workflowsDir = resolve(workDir, 'workflows');
    
    const files = await readdir(workflowsDir);
    const workflows = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await readFile(resolve(workflowsDir, file), 'utf-8');
        const workflow = JSON.parse(content);
        workflows.push(workflow);
      }
    }
    
    return c.json(workflows);
  } catch (error) {
    logger.error({ error }, 'Failed to list workflows');
    return c.json({ 
      error: 'Failed to list workflows',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

/**
 * GET /config/agents - List all agents
 */
app.get('/agents', async (c) => {
  try {
    const { workDir } = getServerContext();
    const agentsDir = resolve(workDir, 'agents');
    
    const files = await readdir(agentsDir);
    const agents = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await readFile(resolve(agentsDir, file), 'utf-8');
        const agent = JSON.parse(content);
        agents.push(agent);
      }
    }
    
    return c.json(agents);
  } catch (error) {
    logger.error({ error }, 'Failed to list agents');
    return c.json({ 
      error: 'Failed to list agents',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

/**
 * GET /config/skills - List all skills
 */
app.get('/skills', async (c) => {
  try {
    const { workDir } = getServerContext();
    const skillsDir = resolve(workDir, 'skills');
    
    const files = await readdir(skillsDir);
    const skills = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await readFile(resolve(skillsDir, file), 'utf-8');
        const skill = JSON.parse(content);
        skills.push(skill);
      }
    }
    
    return c.json(skills);
  } catch (error) {
    logger.error({ error }, 'Failed to list skills');
    return c.json({ 
      error: 'Failed to list skills',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

export default app;
