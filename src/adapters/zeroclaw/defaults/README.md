# NullClaw Adapter Defaults

This directory contains template files for nullclaw agents.

## Files

### config.json
Main nullclaw configuration template with placeholders:
- `${PORT}` - Gateway port (assigned dynamically)
- `${MODEL}` - LLM model (from agent config or default)
- `${OPENROUTER_KEY}` - API key from environment

### Identity Templates
Downloaded from [openclaw/openclaw](https://github.com/openclaw/openclaw/tree/main/docs/reference/templates):

- **SOUL.md** - Core personality/identity
- **USER.md** - User-specific instructions (interpolated with system_prompt)
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

For each agent instance, ftsfaf creates:

```
/tmp/ftsfaf/run-{runId}/{agentId}/.nullclaw/
├── config.json          # Interpolated from template
├── workspace/           # Agent workspace
├── SOUL.md             # Copied from template
├── USER.md             # Interpolated with system_prompt
├── IDENTITY.md         # Copied from template
├── TOOLS.md            # Copied from template
└── ... (other .md files)
```

nullclaw is started with:
```bash
NULLCLAW_HOME=/tmp/ftsfaf/run-{runId}/{agentId}/.nullclaw nullclaw gateway
```

## Interpolation

Templates support these placeholders:
- `${SYSTEM_PROMPT}` - From agent config system_prompt field
- `${PORT}` - Dynamically assigned port
- `${MODEL}` - From agent.metadata.model or default
- `${OPENROUTER_KEY}` - From environment variables
