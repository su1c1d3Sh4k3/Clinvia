---
description: Restore project context and understanding at the start of a new session.
---

# Context Restoration Workflow

Run this workflow at the beginning of every new session to ground yourself in the project's current state.

## 1. Establish Operational Rules
- [ ] Read `ANTIGRAVITY_ROLES.md` to reaffirm your specific duties (Director, Orchestrator) and constraints.
- [ ] Read `GEMINI.md` (if available) to verify global behavioral rules.

## 2. Load Project Knowledge
- [ ] Read `CLINVIA_MANUAL.md` to understand the architecture, tech stack, and key modules.
- [ ] Read `DIAGNOSTIC_REPORT.md` to be aware of known issues and "God Components" to avoid.

## 3. Determine Project Status
- [ ] Read `task.md` completely.
    -   Identify the **last completed task** (marked with `[x]`).
    -   Identify the **current active task** (marked with `[/]`).
    -   Identify the **next immediate step**.

## 4. MCP Availability Check
- [ ] Verify access to `supabase-mcp-server` (Database).
- [ ] Verify access to `context7` (Documentation).
- [ ] Verify access to `StitchMCP` (UI).

## 5. Synthesis
- [ ] Generate a brief "State of the Union" summary for the User:
    -   "I have restored context. We are currently working on [Current Task]. The last thing completed was [Last Task]. I am ready to proceed with [Next Step]."
