/**
 * SQLite schema for ftsfaf runtime state
 */

export const SCHEMA_VERSION = 1;

/**
 * SQL schema for all tables
 */
export const SCHEMA_SQL = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

-- Workflow runs
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','running','completed','failed')),
  final_output TEXT,
  output_type TEXT,
  output_file_path TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_workflow ON runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at DESC);

-- Step executions within runs
CREATE TABLE IF NOT EXISTS step_executions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  iteration INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('pending','running','completed','failed')),
  started_at INTEGER,
  completed_at INTEGER,
  error TEXT,
  UNIQUE(run_id, step_id, iteration)
);

CREATE INDEX IF NOT EXISTS idx_step_executions_run ON step_executions(run_id);
CREATE INDEX IF NOT EXISTS idx_step_executions_status ON step_executions(status);

-- Artifacts produced by steps
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  iteration INTEGER NOT NULL,
  storage_type TEXT NOT NULL CHECK(storage_type IN ('inline','filesystem','git_repo','zip_file')),
  
  -- For inline storage
  mime_type TEXT,
  content TEXT,
  
  -- For filesystem storage
  file_path TEXT,
  file_size INTEGER,
  file_checksum TEXT,
  
  -- For git repo storage
  git_remote TEXT,
  git_branch TEXT,
  git_commit_sha TEXT,
  
  -- For zip file storage
  zip_path TEXT,
  zip_size INTEGER,
  zip_checksum TEXT,
  
  created_at INTEGER NOT NULL,
  
  -- Constraints
  CHECK (
    (storage_type = 'inline' AND content IS NOT NULL) OR
    (storage_type = 'filesystem' AND file_path IS NOT NULL) OR
    (storage_type = 'git_repo' AND git_remote IS NOT NULL AND git_branch IS NOT NULL) OR
    (storage_type = 'zip_file' AND zip_path IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_step ON artifacts(run_id, step_id);
`;

/**
 * Initialize the schema
 */
export const initSchema = (db: { exec: (sql: string) => void }): void => {
  // Create all tables
  db.exec(SCHEMA_SQL);

  // Insert or update schema version
  db.exec(`
    INSERT OR REPLACE INTO schema_version (version, applied_at)
    VALUES (${SCHEMA_VERSION}, ${Date.now()});
  `);
};
