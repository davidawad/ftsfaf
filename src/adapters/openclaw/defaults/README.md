# OpenClaw Adapter Defaults

This directory contains template files for openclaw agents.

## Files

### config.json
OpenClaw agent configuration template (from original defaults/openclaw).

### Identity Templates
Downloaded from [openclaw/openclaw](https://github.com/openclaw/openclaw/tree/main/docs/reference/templates):

- **SOUL.md** - Core personality/identity
- **USER.md** - User-specific instructions
- **IDENTITY.md** - Complete identity specification
- **AGENTS.md** - Multi-agent coordination rules
- **TOOLS.md** - Tool usage guidelines
- **HEARTBEAT.md** - Periodic self-reflection
- **BOOT.md** - Startup instructions
- **BOOTSTRAP.md** - Initial configuration

### Dev Variants
Development/coding-focused versions:
- AGENTS.dev.md
- SOUL.dev.md
- IDENTITY.dev.md
- TOOLS.dev.md
- USER.dev.md

## Sandbox Creation

For each agent instance running with Docker, ftsfaf creates:

```
/tmp/ftsfaf/run-{runId}/{agentId}/.openclaw/
├── config.json          # Interpolated from template
├── workspace/           # Agent workspace
├── SOUL.md             # Copied from template
├── USER.md             # Interpolated with system_prompt
├── IDENTITY.md         # Copied from template
└── ... (other .md files)
```

Container is started with volume mount to this directory.
