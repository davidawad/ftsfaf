/**
 * Workflow Kanban board component
 */

import React, { useEffect, useState } from 'react';
import type { Workflow, Run, Agent, RunDetails } from '../lib/types';
import { api } from '../lib/api';
import { WorkerColumn } from './WorkerColumn';
import { RunDetailView } from './RunDetailView';

interface WorkflowKanbanProps {
  workflow: Workflow;
  agents: Agent[];
}

export function WorkflowKanban({ workflow, agents }: WorkflowKanbanProps) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRuns = async () => {
      try {
        const allRuns = await api.getRuns(100);
        // Filter runs for this workflow
        const workflowRuns = allRuns.filter((r) => r.workflow_id === workflow.id);
        setRuns(workflowRuns);
      } catch (error) {
        console.error('Failed to fetch runs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRuns();

    // Refresh every 2 seconds
    const interval = setInterval(fetchRuns, 2000);
    return () => clearInterval(interval);
  }, [workflow.id]);

  const handleRunClick = async (run: Run) => {
    try {
      const details = await api.getRunDetails(run.id);
      setSelectedRun(details);
    } catch (error) {
      console.error('Failed to fetch run details:', error);
    }
  };

  const getRunsForStep = (stepId: string): Run[] => {
    // For simplicity, show all runs in their current state
    // In a more advanced version, we would map runs to specific steps
    return runs.filter((run) => {
      // You could enhance this by checking step_executions
      return true;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading workflow...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{workflow.name}</h2>
          {workflow.description && (
            <p className="text-sm text-gray-600 mt-1">{workflow.description}</p>
          )}
        </div>
        <div className="text-sm text-gray-500">
          {runs.length} {runs.length === 1 ? 'run' : 'runs'}
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {workflow.steps.map((step) => {
          const agent = agents.find((a) => a.id === step.agent);
          const stepRuns = getRunsForStep(step.id);

          return (
            <WorkerColumn
              key={step.id}
              step={step}
              runs={stepRuns}
              agent={agent}
              onRunClick={handleRunClick}
            />
          );
        })}
      </div>

      {/* Run details view */}
      {selectedRun && (
        <RunDetailView
          runDetails={selectedRun}
          workflow={workflow}
          agents={agents}
          onClose={() => setSelectedRun(null)}
        />
      )}
    </div>
  );
}
