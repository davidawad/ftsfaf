/**
 * API client for dashboard
 */

import type { Stats, Workflow, Agent, Run, RunDetails } from '../../server/lib/types';

const API_BASE = '/api';

export const api = {
  async getStats(): Promise<Stats> {
    const res = await fetch(`${API_BASE}/stats`);
    return res.json();
  },

  async getWorkflows(): Promise<Workflow[]> {
    const res = await fetch(`${API_BASE}/workflows`);
    return res.json();
  },

  async getAgents(): Promise<Agent[]> {
    const res = await fetch(`${API_BASE}/agents`);
    return res.json();
  },

  async getRuns(limit = 20): Promise<Run[]> {
    const res = await fetch(`${API_BASE}/runs?limit=${limit}`);
    return res.json();
  },

  async getRunDetails(runId: string): Promise<RunDetails> {
    const res = await fetch(`${API_BASE}/runs/${runId}`);
    return res.json();
  },

  async refresh(): Promise<void> {
    await fetch(`${API_BASE}/refresh`, { method: 'POST' });
  },
};
