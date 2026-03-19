/**
 * Detailed run execution view component
 */

import React from 'react';
import type { RunDetails, Workflow, Agent } from '../lib/types';
import { WorkerAvatar } from './WorkerAvatar';
import { formatDateTime, formatShortDuration, formatRelativeTime } from '../lib/utils';

interface RunDetailViewProps {
  runDetails: RunDetails;
  workflow: Workflow;
  agents: Agent[];
  onClose: () => void;
}

export function RunDetailView({ runDetails, workflow, agents, onClose }: RunDetailViewProps) {
  const { run, steps, artifacts } = runDetails;

  // Get artifact for a specific step
  const getArtifactForStep = (stepId: string, iteration: number) => {
    return artifacts.find((a) => a.step_id === stepId && a.iteration === iteration);
  };

  // Get workflow step definition
  const getWorkflowStep = (stepId: string) => {
    return workflow.steps.find((s) => s.id === stepId);
  };

  // Get agent for a step
  const getAgentForStep = (stepId: string) => {
    const workflowStep = getWorkflowStep(stepId);
    if (!workflowStep) return null;
    return agents.find((a) => a.id === workflowStep.agent);
  };

  // Calculate total duration
  const totalDuration = steps.length > 0 && steps[0].started_at && steps[steps.length - 1].completed_at
    ? formatShortDuration(steps[0].started_at, steps[steps.length - 1].completed_at)
    : '—';

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Run Details</h2>
            <p className="text-sm text-gray-500 mt-1 font-mono">{run.id}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ✕
          </button>
        </div>

        {/* Run Summary */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-600 mb-1">Status</p>
              <span
                className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                  run.status === 'completed'
                    ? 'bg-green-100 text-green-800'
                    : run.status === 'running'
                    ? 'bg-blue-100 text-blue-800'
                    : run.status === 'failed'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {run.status}
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Started</p>
              <p className="text-sm font-medium">{formatDateTime(run.created_at)}</p>
              <p className="text-xs text-gray-500">{formatRelativeTime(run.created_at)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Duration</p>
              <p className="text-sm font-medium">{totalDuration}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Steps</p>
              <p className="text-sm font-medium">{steps.length} total</p>
            </div>
          </div>
        </div>

        {/* Step Timeline */}
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-gray-900">Execution Timeline</h3>

          {steps.map((step, index) => {
            const workflowStep = getWorkflowStep(step.step_id);
            const agent = getAgentForStep(step.step_id);
            const artifact = getArtifactForStep(step.step_id, step.iteration);
            const duration = formatShortDuration(step.started_at, step.completed_at);
            const statusIcon =
              step.status === 'completed'
                ? '✓'
                : step.status === 'running'
                ? '⚡'
                : step.status === 'failed'
                ? '✕'
                : '⏸';

            return (
              <div key={step.id} className="relative">
                {/* Timeline line */}
                {index < steps.length - 1 && (
                  <div className="absolute left-8 top-16 bottom-0 w-0.5 bg-gray-200" />
                )}

                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                  {/* Step Header */}
                  <div className="flex items-start gap-4">
                    <WorkerAvatar
                      agentType={agent?.agentType || 'default'}
                      status={
                        step.status === 'running'
                          ? 'working'
                          : step.status === 'completed'
                          ? 'completed'
                          : step.status === 'failed'
                          ? 'failed'
                          : 'idle'
                      }
                      size="md"
                    />

                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-gray-900">
                            {index + 1}. {step.step_id}
                          </h4>
                          <p className="text-sm text-gray-600">
                            {agent?.name || workflowStep?.agent} • {workflowStep?.skill}
                          </p>
                        </div>
                        <div className="text-right">
                          <span
                            className={`text-2xl ${
                              step.status === 'completed'
                                ? 'text-green-500'
                                : step.status === 'running'
                                ? 'text-blue-500'
                                : step.status === 'failed'
                                ? 'text-red-500'
                                : 'text-gray-400'
                            }`}
                          >
                            {statusIcon}
                          </span>
                          <p className="text-xs text-gray-500 mt-1">{duration}</p>
                        </div>
                      </div>

                      {/* Input Prompt */}
                      {workflowStep && (
                        <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
                          <p className="text-xs font-semibold text-gray-700 mb-2">
                            INPUT PROMPT:
                          </p>
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">
                            {workflowStep.user_prompt}
                          </p>
                        </div>
                      )}

                      {/* Output Artifact */}
                      {artifact && artifact.content && (
                        <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
                          <p className="text-xs font-semibold text-blue-900 mb-2">
                            OUTPUT {step.completed_at && `(${duration})`}:
                          </p>
                          <p className="text-sm text-blue-900 whitespace-pre-wrap">
                            {artifact.content}
                          </p>
                        </div>
                      )}

                      {/* Error */}
                      {step.error && (
                        <div className="mt-3 p-3 bg-red-50 rounded border border-red-200">
                          <p className="text-xs font-semibold text-red-900 mb-2">ERROR:</p>
                          <p className="text-sm text-red-800">{step.error}</p>
                        </div>
                      )}

                      {/* Timestamps */}
                      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                        {step.started_at && (
                          <span>Started: {formatDateTime(step.started_at)}</span>
                        )}
                        {step.completed_at && (
                          <span>Completed: {formatDateTime(step.completed_at)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Final Output */}
        {run.final_output && (
          <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
            <h3 className="text-lg font-semibold text-green-900 mb-2">Final Output</h3>
            <p className="text-sm text-green-900 whitespace-pre-wrap">{run.final_output}</p>
          </div>
        )}
      </div>
    </div>
  );
}
