# PicoClaw Adapter

PicoClaw is a Docker-based agent adapter that runs the `sipeed/picoclaw` container in one-shot mode for executing tasks.

## Key Differences from NullClaw/ZeroClaw

### Architecture
- **NullClaw/ZeroClaw**: Run as CLI binaries directly on the host system
- **PicoClaw**: Runs as Docker containers with volume-mounted configuration

### Execution Model
- **CLI Adapters**: Spawn a persistent process with `spawn()` and communicate via CLI
- **PicoClaw**: One-shot containers - each task execution spins up a fresh container that runs and exits

### I/O Handling
- **CLI Adapters**: Direct stdin/stdout pipes to the process
- **PicoClaw**: Volume-mount sandbox directory and pass prompts as command arguments to the Docker container

## Docker Command

When executing a task, the adapter runs:

```bash
docker run --rm \
  -v /path/to/sandbox:/root/.picoclaw \
  sipeed/picoclaw:latest \
  picoclaw agent -m "prompt here"
```

## Configuration Files

### Workspace Files (mounted at `/root/.picoclaw/workspace/`)
- `AGENTS.md` - Behavioral guidelines
- `IDENTITY.md` - Agent identity and purpose
- `SOUL.md` - Personality and values
- `USER.md` - User preferences (system_prompt interpolated here)

### Config File (`/root/.picoclaw/config.json`)
- Model configuration
- API keys (from environment)
- Tool settings
- Channel configurations (all disabled for agent mode)

## Environment Variables

The adapter uses:
- `OPENROUTER_KEY` or `OPENAI_API_KEY` - For LLM API access
- Config mounted to container via volume

## Image

Uses the official image: `docker.io/sipeed/picoclaw:latest` (currently v0.2.1)
