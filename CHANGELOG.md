# Changelog

## 0.1.0 — 2026-09-26

First release of the independent Codex terminal client.

- Persistent, hierarchical agent strip with keyboard conversation switching.
- Per-thread drafts, scrolling, unread results and attention navigation.
- Context meters, conditional cache/limit warnings and responsive layouts.
- Explicit command/file/permission approvals, user questions and MCP forms.
- Model and effort selection, active-turn steering and interruption, explicit
  compaction, saved-session resume and Markdown export.
- Private stdio App Server integration, non-inference doctor and offline demo.
- Cross-platform CI, protocol process tests, state/input/render checks and
  reproducible README previews.

Backend boundary: current Codex V2 spawned agents disable direct client messages.
Quietline exposes supported inspection, request handling and interruption without
bypassing that restriction.
