/**
 * Configuration schemas using Effect Schema
 * All config types validated here
 */

import { Schema as S } from "effect";

// ============================================================================
// Skill Schema
// ============================================================================

export const SkillSchema = S.Struct({
  id: S.String,
  name: S.String,
  description: S.String,
  tags: S.Array(S.String),
  examples: S.Array(S.String),
});

export type Skill = S.Schema.Type<typeof SkillSchema>;

// ============================================================================
// Agent Schema
// ============================================================================

const BearerAuthSchema = S.Struct({
  type: S.Literal("bearer"),
  token: S.String,
});

const BasicAuthSchema = S.Struct({
  type: S.Literal("basic"),
  username: S.String,
  password: S.String,
});

const NoneAuthSchema = S.Struct({
  type: S.Literal("none"),
});

const AuthSchema = S.Union(BearerAuthSchema, BasicAuthSchema, NoneAuthSchema);

const DockerInfraSchema = S.Struct({
  type: S.Literal("docker"),
  image: S.String,
  port: S.Number,
  env: S.optional(S.Record({ key: S.String, value: S.String })),
});

const ProcessInfraSchema = S.Struct({
  type: S.Literal("process"),
  command: S.String,
  cwd: S.String,
  env: S.optional(S.Record({ key: S.String, value: S.String })),
});

const KubernetesInfraSchema = S.Struct({
  type: S.Literal("kubernetes"),
  namespace: S.String,
  image: S.String,
  port: S.Number,
  env: S.optional(S.Record({ key: S.String, value: S.String })),
  resources: S.optional(
    S.Struct({
      requests: S.optional(
        S.Struct({
          cpu: S.optional(S.String),
          memory: S.optional(S.String),
        })
      ),
      limits: S.optional(
        S.Struct({
          cpu: S.optional(S.String),
          memory: S.optional(S.String),
        })
      ),
    })
  ),
});

const RemoteInfraSchema = S.Struct({
  type: S.Literal("remote"),
  health_check_path: S.optional(S.String),
});

const EC2InfraSchema = S.Struct({
  type: S.Literal("ec2"),
  instance_type: S.String,
  ami: S.String,
  region: S.String,
});

const InfrastructureSchema = S.Union(
  DockerInfraSchema,
  ProcessInfraSchema,
  KubernetesInfraSchema,
  RemoteInfraSchema,
  EC2InfraSchema
);

const ProxyInfoSchema = S.Struct({
  type: S.String,
  note: S.optional(S.String),
});

export const AgentConfigSchema = S.Struct({
  id: S.String,
  agentType: S.String, // Agent type: "openclaw", "nullclaw", "hermes", "adk", etc.
  endpoint: S.optional(S.String), // Optional: ftsfaf starts managed agents (openclaw, nullclaw)
  system_prompt: S.optional(S.String),
  proxy: S.optional(ProxyInfoSchema),
  auth: AuthSchema,
  infrastructure: S.optional(InfrastructureSchema), // Deprecated: agentType field determines how agent starts
  metadata: S.optional(S.Record({ key: S.String, value: S.Unknown })),
  skills: S.Array(S.String),
});

export type AgentConfig = S.Schema.Type<typeof AgentConfigSchema>;
export type AuthConfig = S.Schema.Type<typeof AuthSchema>;
export type InfrastructureConfig = S.Schema.Type<typeof InfrastructureSchema>;

// ============================================================================
// Workflow Schema
// ============================================================================

const OnFailSchema = S.Struct({
  route_to: S.String,
  max_iterations: S.Number,
  inject_artifact: S.String,
});

const WorkflowStepSchema = S.Struct({
  id: S.String,
  agent: S.String,
  skill: S.String,
  user_prompt: S.String,
  depends_on: S.Array(S.String),
  on_fail: S.optional(OnFailSchema),
});

const WorkflowOutputSchema = S.Struct({
  type: S.Union(S.Literal("string"), S.Literal("file"), S.Literal("git_url")),
  source: S.String, // step ID that produces final output
  description: S.String,
});

export const WorkflowSchema = S.Struct({
  id: S.String,
  name: S.String,
  description: S.optional(S.String),
  output: WorkflowOutputSchema,
  steps: S.Array(WorkflowStepSchema),
});

export type Workflow = S.Schema.Type<typeof WorkflowSchema>;
export type WorkflowStep = S.Schema.Type<typeof WorkflowStepSchema>;
export type OnFail = S.Schema.Type<typeof OnFailSchema>;

// ============================================================================
// ftsfaf.config.json Schema
// ============================================================================

export const FtsfafConfigSchema = S.Struct({
  server: S.Struct({
    port: S.Number,
    host: S.optional(S.String), // Host to bind to (default: 0.0.0.0)
  }),
  engine: S.optional(S.Struct({
    url: S.String, // URL where engine API is running (for CLI client mode)
  })),
  redis: S.Struct({
    host: S.String,
    port: S.Number,
  }),
  sqlite: S.Struct({
    path: S.String,
  }),
  agents_dir: S.String,
  workflows_dir: S.String,
  skills_dir: S.String,
  tasks_dir: S.optional(S.String),
  default_system_prompt: S.String,
  startup_timeout_ms: S.Number,
  health_poll_interval_ms: S.Number,
});

export type FtsfafConfig = S.Schema.Type<typeof FtsfafConfigSchema>;

// ============================================================================
// Task Schema
// ============================================================================

export const TaskSchema = S.Struct({
  id: S.String,
  workflow: S.String,
  input: S.String,
  metadata: S.optional(S.Record({ key: S.String, value: S.Unknown })),
});

export type Task = S.Schema.Type<typeof TaskSchema>;

// ============================================================================
// Artifact Storage Schemas
// ============================================================================

// Inline content storage (original behavior)
export const InlineArtifactStorageSchema = S.Struct({
  storage_type: S.Literal("inline"),
  mime_type: S.String,
  content: S.String,
});

// Filesystem path reference
export const FilesystemArtifactStorageSchema = S.Struct({
  storage_type: S.Literal("filesystem"),
  file_path: S.String,
  file_size: S.Number,
  file_checksum: S.optional(S.String),
});

// Git repository reference
export const GitRepoArtifactStorageSchema = S.Struct({
  storage_type: S.Literal("git_repo"),
  git_remote: S.String,
  git_branch: S.String,
  git_commit_sha: S.String,
  files_changed: S.optional(S.Array(S.String)),
});

// Zip file reference
export const ZipFileArtifactStorageSchema = S.Struct({
  storage_type: S.Literal("zip_file"),
  zip_path: S.String,
  zip_size: S.Number,
  zip_checksum: S.String,
});

// Union of all storage types
export const ArtifactStorageSchema = S.Union(
  InlineArtifactStorageSchema,
  FilesystemArtifactStorageSchema,
  GitRepoArtifactStorageSchema,
  ZipFileArtifactStorageSchema
);

export type InlineArtifactStorage = S.Schema.Type<typeof InlineArtifactStorageSchema>;
export type FilesystemArtifactStorage = S.Schema.Type<typeof FilesystemArtifactStorageSchema>;
export type GitRepoArtifactStorage = S.Schema.Type<typeof GitRepoArtifactStorageSchema>;
export type ZipFileArtifactStorage = S.Schema.Type<typeof ZipFileArtifactStorageSchema>;
export type ArtifactStorage = S.Schema.Type<typeof ArtifactStorageSchema>;
