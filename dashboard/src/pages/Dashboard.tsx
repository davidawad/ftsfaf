/**
 * Main dashboard page
 */

import React, { useEffect, useState } from 'react';
import { StatCard } from '../components/StatCard';
import { WorkflowKanban } from '../components/WorkflowKanban';
import { useStats } from '../hooks/useStats';
import { useSSE } from '../hooks/useSSE';
import { api } from '../lib/api';
import type { Workflow, Agent } from '../lib/types';

export function Dashboard() {
  const { stats } = useStats();
  const { isConnected } = useSSE();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [workflowData, agentData] = await Promise.all([
          api.getWorkflows(),
          api.getAgents(),
        ]);
        setWorkflows(workflowData);
        setAgents(agentData);
        if (workflowData.length > 0 && !selectedWorkflowId) {
          setSelectedWorkflowId(workflowData[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedWorkflowId]);

  const selectedWorkflow = workflows.find((w) => w.id === selectedWorkflowId);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">ftsfaf Dashboard</h1>
              <p className="text-sm text-gray-600 mt-1">
                From-Task-Spec-to-Fully-Automated-Finish
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div
                className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
                  isConnected
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                  }`}
                />
                {isConnected ? 'Live' : 'Disconnected'}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-8 py-8">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
            <StatCard
              title="Workflows"
              value={stats.totalWorkflows}
              icon="📋"
              color="purple"
            />
            <StatCard
              title="Total Runs"
              value={stats.totalRuns}
              icon="🏃"
              color="blue"
            />
            <StatCard
              title="Active"
              value={stats.activeRuns}
              icon="⚡"
              color="yellow"
            />
            <StatCard
              title="Completed"
              value={stats.completedRuns}
              icon="✅"
              color="green"
            />
            <StatCard
              title="Failed"
              value={stats.failedRuns}
              icon="❌"
              color="red"
            />
          </div>
        )}

        {/* Workflow selector */}
        {!loading && workflows.length > 0 && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Workflow
            </label>
            <select
              value={selectedWorkflowId || ''}
              onChange={(e) => setSelectedWorkflowId(e.target.value)}
              className="block w-full max-w-md px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {workflows.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Kanban board */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Loading...</div>
          </div>
        ) : workflows.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No workflows found</p>
            <p className="text-sm text-gray-400 mt-2">
              Create a workflow in the workflows/ directory to get started
            </p>
          </div>
        ) : selectedWorkflow ? (
          <WorkflowKanban workflow={selectedWorkflow} agents={agents} />
        ) : null}
      </main>
    </div>
  );
}
