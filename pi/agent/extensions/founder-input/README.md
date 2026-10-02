# founder-input extension for Pi

Provides the `request_founder_input` tool used by headless workflows. The tool
emits one structured question, recommendation, and reason for the outer Codex
orchestrator, then blocks dependent tool calls for the remainder of that run.

The dispatcher returns `status: needs_input` and the Pi session ID. After the
founder answers, it invokes `resume` with the same workflow, target, repository,
and session. No Pi process remains running while input is pending.

This extension is transport only. Product and engineering decisions must still
be recorded in their canonical Linear or Obsidian location when the governing
workflow requires durable approval evidence.
