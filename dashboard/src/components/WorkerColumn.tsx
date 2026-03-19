/**
 * Worker column component for Kanban board
 */

import React from 'react';
import type { WorkflowStep, Run, Agent } from '../lib/types';
import { JobCard } from './JobCard';

interface WorkerColumnProps {
  step: WorkflowStep;
  runs: Run[];
  agent?: Agent;
  onRunClick?: (run: Run) => void;
}

export function WorkerColumn({ step, runs, agent, onRunClick }: WorkerColumnProps) {
  return (
    <div className="flex-shrink-0 w-80 bg-gray-50 rounded-lg p-4 border border-gray-200">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-gray-900">{step.id}</h3>
        <div className="flex items-center gap-2 mt-2 text-sm text-gray-600">
          <span className="font-medium">{agent?.name || step.agent}</span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-500">{step.skill}</span>
        </div>
      </div>

      <div className="space-y-3">
        {runs.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm">No jobs yet</p>
          </div>
        ) : (
          runs.map((run) => (
            <JobCard
              key={run.id}
              run={run}
              agentType={agent?.agentType || 'default'}
              onClick={() => onRunClick?.(run)}
            />
          ))
        )}
      </div>
    </div>
  );
}
