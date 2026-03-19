# Specification Alignment Review

## Current Understanding vs. Spec

###  What Aligns Perfectly

1. **A2A Protocol Usage**
   - Spec: Uses `@a2a-js/sdk` for agent communication 
   - Reality: Correct - ftsfaf speaks A2A to all agents

2. **Framework Agnostic Architecture**
   - Spec: "ftsfaf is workflow-agnostic  it does not know or care what any agent does internally" 
   - Reality: Correct - agents are opaque A2A servers

3. **Infrastructure Types**
   - Spec: Docker, Process, Remote, EC2 (stub), Kubernetes 
   - Reality: Correct - supports multiple deployment types

4. **Optional agentgateway**
   - Spec: "agentgateway is optional and per-agent" 
   - Reality: Correct - agents can be contacted directly or via proxy

5. **Multiple Agent Support**
   - Spec: Agents defined in `agents/*.json` files 
   - Reality: Correct - each agent is independently configured

###  Areas Needing Clarification/Extension

#### 1. Artifact Storage (NEEDS UPDATE)

**Current Spec:**
```sql
CREATE TABLE artifacts (
  content TEXT NOT NULL,  -- Stores full content as text
  mime_type TEXT NOT NULL
);
```

**Problem:** This only supports inline text storage. We need to support:
- Large zip files (can't store as TEXT)
- Git repository references (just URL + branch + commit)
- Local filesystem paths (just path reference)

**Solution:** Extend artifact schema to support storage types:

```sql
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  step_id TEXT NOT NULL,
  iteration INTEGER NOT NULL,
  
  -- Storage strategy
  storage_type TEXT NOT NULL CHECK(storage_type IN ('inline','filesystem','git_repo','zip_file')),
  
  -- For inline storage (backward compatible)
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
  
  -- For zip file storage (filesystem path to zip)
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
```

**Effect Schema Update Needed:**
```typescript
// src/config/schema.ts - Add artifact storage schemas
export const InlineArtifactSchema = S.Struct({
  storage_type: S.Literal('inline'),
  mime_type: S.String,
  content: S.String
});

export const FilesystemArtifactSchema = S.Struct({
  storage_type: S.Literal('filesystem'),
  file_path: S.String,
  file_size: S.Number,
  file_checksum: S.optional(S.String)
});

export const GitRepoArtifactSchema = S.Struct({
  storage_type: S.Literal('git_repo'),
  git_remote: S.String,
  git_branch: S.String,
  git_commit_sha: S.String,
  files_changed: S.optional(S.Array(S.String))
});

export const ZipFileArtifactSchema = S.Struct({
  storage_type: S.Literal('zip_file'),
  zip_path: S.String,
  zip_size: S.Number,
  zip_checksum: S.String
});

export const ArtifactStorageSchema = S.Union(
  InlineArtifactSchema,
  FilesystemArtifactSchema,
  GitRepoArtifactSchema,
  ZipFileArtifactSchema
);
```

#### 2. Agent Framework Examples (NEEDS CLARIFICATION)

**Current Spec:**
```json
"infrastructure": {
  "type": "docker",
  "image": "my-openclaw-agent:latest",
  ...
}
```

**Issue:** This makes it seem like OpenClaw is THE framework, not one of many.

**Solution:** Add clarifying note in spec:

> **Note on Agent Frameworks:** The example shows an OpenClaw agent, but ftsfaf is framework-agnostic. Agents can be built with:
> - OpenClaw
> - Google ADK
> - LangGraph
> - CrewAI
> - Custom implementations
> 
> As long as the agent exposes A2A endpoints (`/.well-known/agent-card.json` and A2A JSON-RPC methods), ftsfaf can orchestrate it. Each framework may need an A2A adapter layer.

#### 3. Prompt Interpolation (NEEDS CLARIFICATION)

**Current Spec:**
- Detailed `{{variable}}` interpolation in workflow files
- System prompts loaded from markdown files
- User prompts with template variables

**Question:** How does this work with agents handling their own prompts?

**Answer:** The spec is correct! Here's the distinction:

**Workflow-Level Prompts (ftsfaf manages):**
```json
{
  "step": {
    "id": "review",
    "user_prompt": "Review this code:\n\n{{artifacts.implement}}\n\nOriginal task: {{task.input}}"
  }
}
```
ftsfaf interpolates variables and sends the rendered text via A2A.

**Agent-Internal Prompts (agent framework manages):**
Inside the agent (OpenClaw, ADK, etc.), the framework has its own system prompts, few-shot examples, and reasoning chains. ftsfaf doesn't see or touch these.

**Clarification:** The `system_prompt` in agent config is optional metadata that ftsfaf can use to provide context, but the agent framework still controls its own internal prompting logic.

#### 4. Agent Discovery (NEEDS MINOR UPDATE)

**Current Spec:**
> "Poll `GET /.well-known/agent.json` until it responds 200"

**A2A Standard:**
> Should be `/.well-known/agent-card.json` (note: "card" not just "agent")

**Solution:** Update spec to use `agent-card.json` consistently.

###  No Conflicts Found With:

1. **Graph Validation** - Works identically regardless of agent framework
2. **Workflow Definition** - Framework-agnostic step definitions
3. **Infrastructure Providers** - Support any deployment method
4. **BullMQ + Redis** - Queue system independent of agents
5. **Express API** - REST interface independent of agents
6. **Skill System** - Maps to A2A skill abstraction

## Required Updates

### 1. Extend `src/config/schema.ts`
Add artifact storage schemas (inline, filesystem, git_repo, zip_file)

### 2. Update SQLite Schema
Extend artifacts table to support multiple storage types

### 3. Update Spec Examples
- Replace "my-openclaw-agent" with "my-agent" or show multiple framework examples
- Add note about framework diversity
- Update `/.well-known/agent.json`  `/.well-known/agent-card.json`

### 4. Add Adapter Documentation
Create `docs/adapters/` with guides for:
- OpenClaw  A2A adapter
- ADK  A2A adapter (reference A2A samples)
- LangGraph  A2A adapter (reference A2A samples)
- Custom adapter implementation guide

## Summary

**Overall Assessment:  Spec is fundamentally sound and aligned!**

The core architecture in the spec is correct:
-  Uses A2A protocol
-  Framework-agnostic design
-  Infrastructure flexibility
-  Workflow orchestration focus

**Minor updates needed:**
1. Extend artifact storage to support references (not just inline content)
2. Clarify OpenClaw is one example, not the only framework
3. Fix `agent.json`  `agent-card.json`
4. Document adapter pattern more explicitly

**No fundamental conflicts!** The spec describes exactly what we need - a workflow orchestrator that speaks A2A to framework-agnostic agents. The examples just need to better reflect the multi-framework reality.
