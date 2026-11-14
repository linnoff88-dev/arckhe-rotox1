# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **BMAD-METHOD™ v4.44.3** installation - an AI agent orchestration framework for agile development. It is NOT a traditional software project but a framework that coordinates specialized AI agents through structured workflows.

## Key Commands

```bash
# Update/reinstall BMAD framework
npx bmad-method install

# Flatten codebase to single XML file for context
npx bmad-method flatten

# Show available CLI commands
npx bmad-method help
```

## Project Structure

```
.bmad-core/           # Core BMAD framework
├── agents/           # 10 AI agent personas (architect, analyst, dev, pm, po, qa, sm, ux-expert, bmad-master, bmad-orchestrator)
├── tasks/            # 23 executable workflow tasks
├── templates/        # Document templates (PRD, architecture, stories, etc.)
├── checklists/       # Quality assurance checklists
├── workflows/        # Project workflow definitions (greenfield/brownfield)
├── data/             # Reference knowledge bases
├── core-config.yaml  # Project configuration
└── user-guide.md     # Complete user guide

.claude/commands/BMad/  # Claude Code slash commands (mirrors .bmad-core)
docs/                   # Project artifacts location (created during workflow)
```

## Architecture

**Multi-Agent Orchestration Pattern:**

1. **Planning Phase** (Web UI): Analyst → PM → UX Expert → Architect → PO
2. **Development Phase** (IDE): Scrum Master → Developer → QA (per story)

Each agent has a focused role:
- **Orchestrator**: Master coordinator, workflow guidance
- **Analyst**: Research and market analysis
- **PM**: PRD creation
- **Architect (Winston)**: System design, tech stack decisions
- **PO (Sarah)**: Backlog management, process steward
- **SM**: Story creation from sharded docs
- **Dev (James)**: Implementation
- **QA (Quinn)**: Testing and validation

**Document Locations** (from core-config.yaml):
- PRD: `docs/prd.md` (sharded in `docs/prd/`)
- Architecture: `docs/architecture.md` (sharded in `docs/architecture/`)
- Stories: `docs/stories/`
- QA: `docs/qa/`

## Critical Rules

**Agent Activation:**
- Agents are self-contained - do NOT load external agent files
- All agent config is in the YAML block within each `.bmad-core/agents/*.md` file
- Use command prefixes: `*command` or `@agent *command`

**Task Execution:**
- Tasks marked `elicit=true` REQUIRE user interaction - cannot be skipped
- Follow task instructions exactly when executing

**Developer Agent Must Load:**
- `docs/architecture/coding-standards.md`
- `docs/architecture/tech-stack.md`
- `docs/architecture/source-tree.md`

**Workflow Types:**
- **Greenfield**: New projects from scratch
- **Brownfield**: Enhancements to existing codebases (use `document-project` task first)

## Available Slash Commands

All BMAD commands are available under `/BMad/` prefix (configured via `slashPrefix` in core-config.yaml). Key commands:
- `/BMad/agents/bmad-orchestrator` - Start orchestrator for workflow guidance
- `/BMad/tasks/create-next-story` - Create next development story
- `/BMad/tasks/document-project` - Document existing codebase (brownfield)
