/**
 * Client for communicating with the workflow engine API
 */

const ENGINE_URL = process.env.ENGINE_URL || 'http://localhost:4852';

export async function getStats() {
  const response = await fetch(`${ENGINE_URL}/runs/stats`);
  if (!response.ok) {
    throw new Error('Failed to fetch stats from engine');
  }
  
  const stats = await response.json();
  
  // Also get workflow count
  const workflowsResponse = await fetch(`${ENGINE_URL}/config/workflows`);
  const workflows = workflowsResponse.ok ? await workflowsResponse.json() : [];
  
  return {
    totalWorkflows: workflows.length,
    ...stats,
  };
}

export async function getWorkflows() {
  const response = await fetch(`${ENGINE_URL}/config/workflows`);
  if (!response.ok) {
    throw new Error('Failed to fetch workflows from engine');
  }
  return response.json();
}

export async function getAgents() {
  const response = await fetch(`${ENGINE_URL}/config/agents`);
  if (!response.ok) {
    throw new Error('Failed to fetch agents from engine');
  }
  return response.json();
}

export async function getRecentRuns(limit = 20) {
  const response = await fetch(`${ENGINE_URL}/runs?limit=${limit}`);
  if (!response.ok) {
    throw new Error('Failed to fetch runs from engine');
  }
  return response.json();
}

export async function getRunDetails(runId: string) {
  const response = await fetch(`${ENGINE_URL}/runs/${runId}`);
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error('Failed to fetch run details from engine');
  }
  return response.json();
}

export function getStreamUrl() {
  return `${ENGINE_URL}/stream`;
}
