# Google Agent Development Kit (ADK) Documentation

This directory contains downloaded documentation from the official Google ADK documentation site.

## Source
https://google.github.io/adk-docs/

## Files Downloaded

### Getting Started
- `get-started.md` - Introduction and getting started guide
- `about.md` - Technical overview of ADK
- `typescript.md` - TypeScript-specific guide
- `quickstart.md` - Multi-tool agent quickstart
- `streaming.md` - Streaming responses guide

### Tutorials
- `tutorials.md` - Tutorial index
- `agent-team.md` - Building agent teams
- `coding-with-ai.md` - Coding with AI tutorial
- `visual-builder.md` - Visual builder guide

### Agents
- `agents-overview.md` - Overview of agent types
- `llm-agents.md` - LLM-based agents
- `workflow-agents.md` - Workflow agent overview
- `sequential-agents.md` - Sequential workflow agents
- `parallel-agents.md` - Parallel workflow agents
- `loop-agents.md` - Loop workflow agents
- `custom-agents.md` - Custom agent implementation
- `multi-agents.md` - Multi-agent systems
- `agent-config.md` - Agent configuration

### Models
- `models-overview.md` - AI models overview
- `gemini.md` - Google Gemini integration

## Integration with ftsfaf

ftsfaf is designed to orchestrate ADK agents as part of multi-step workflows. Each agent in a workflow is an ADK agent that:

1. Receives structured input from ftsfaf
2. Processes the request using ADK's agent framework
3. Returns structured output (artifacts) back to ftsfaf
4. Passes state to downstream agents in the workflow

See `../ftsfaf-spec.md` for details on how ftsfaf workflows coordinate ADK agents.
