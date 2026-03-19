/**
 * Shared types between server and client
 */

export interface Stats {
  totalWorkflows: number;
  totalRuns: number;
  activeRuns: number;
  completedRuns: number;
  failedRuns: number;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  id: string;
  agent: string;
  skill: string;
  depends_on: string[];
}

export interface Run {
  id: string;
  workflow_id: string;
  task_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  final_output: string | null;
  created_at: number;
  updated_at: number;
}

export interface StepExecution {
  id: string;
  run_id: string;
  step_id: string;
  iteration: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: number | null;
  completed_at: number | null;
  error: string | null;
}

export interface Artifact {
  id: string;
  run_id: string;
  step_id: string;
  iteration: number;
  storage_type: 'inline' | 'filesystem' | 'git_repo' | 'zip_file';
  content?: string;
  file_path?: string;
  created_at: number;
}

export interface RunDetails {
  run: Run;
  steps: StepExecution[];
  artifacts: Artifact[];
}

export interface Agent {
  id: string;
  name: string;
  agentType: string;
  skills: string[];
}

export interface SSEMessage {
  type: 'run-updated' | 'step-updated' | 'connected';
  data?: Run | StepExecution;
  timestamp: number;
}
