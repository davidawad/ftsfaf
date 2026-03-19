/**
 * Job card component for Kanban board
 */

import React from 'react';
import type { Run } from '../lib/types';
import { WorkerAvatar } from './WorkerAvatar';

interface JobCardProps {
  run: Run;
  agentType?: string;
  onClick?: () => void;
}

const statusColors = {
  pending: 'bg-gray-100 border-gray-300',
  running: 'bg-blue-50 border-blue-300',
  completed: 'bg-green-50 border-green-300',
  failed: 'bg-red-50 border-red-300',
};

const statusText = {
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
};

export function JobCard({ run, agentType = 'default', onClick }: JobCardProps) {
  const elapsed = Date.now() - run.created_at;
  const duration = Math.floor(elapsed / 1000);

  const getWorkerStatus = (): 'idle' | 'working' | 'completed' | 'failed' => {
    if (run.status === 'running') return 'working';
    if (run.status === 'completed') return 'completed';
    if (run.status === 'failed') return 'failed';
    return 'idle';
  };

  return (
    <div
      className={`
        ${statusColors[run.status]}
        border-2 rounded-lg p-4 cursor-pointer
        hover:shadow-lg transition-all duration-200
        transform hover:scale-105
      `}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <WorkerAvatar agentType={agentType} status={getWorkerStatus()} size="sm" />
        <span
          className={`
            text-xs font-semibold px-2 py-1 rounded-full
            ${run.status === 'running' ? 'bg-blue-200 text-blue-800' : ''}
            ${run.status === 'completed' ? 'bg-green-200 text-green-800' : ''}
            ${run.status === 'failed' ? 'bg-red-200 text-red-800' : ''}
            ${run.status === 'pending' ? 'bg-gray-200 text-gray-800' : ''}
          `}
        >
          {statusText[run.status]}
        </span>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-mono text-gray-700 truncate">
          {run.id.slice(0, 8)}...
        </p>
        <p className="text-xs text-gray-500">
          {duration < 60 ? `${duration}s` : `${Math.floor(duration / 60)}m`}
        </p>
      </div>

      {run.status === 'running' && (
        <div className="mt-3">
          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 animate-pulse w-2/3" />
          </div>
        </div>
      )}
    </div>
  );
}
