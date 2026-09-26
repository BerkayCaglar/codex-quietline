# Architecture

Quietline is an independent terminal client of the official Codex App Server.
It owns one private stdio server and is the only interactive client of that
server. The Codex executable, account, configuration, tools, permissions, agent
execution and durable conversations remain owned by Codex.

## Boundaries

- `protocol`: JSON-RPC framing, request correlation, timeout and child lifecycle.
- `session`: server operations and event reduction into one store; UI never
  invents agent states from elapsed time, terminal output or file timestamps.
- `ui`: bounded terminal layout, conversation viewport, composer, persistent
  agent rows, explicit approvals and keyboard focus.
- Presentation receives state. It does not start tools or change permissions.

Thread IDs identify conversations. Parent IDs identify ancestry. Switching the
selected row never starts a turn or interrupts an agent. Drafts and viewport
positions belong to individual threads. Server requests retain their own IDs
and originating thread, independently of the selected conversation.

## Compatibility

The initial protocol baseline is Codex CLI 0.157.1. Experimental negotiation is
used for direct-input capability detection and descendant filtering. Optional
fields stay optional. Missing context or cache data is displayed as unavailable,
never estimated from a timer. Unknown actionable requests fail explicitly;
they are never silently approved. Client reconnect never resends a user prompt.

The UI is not an overlay that scrapes the stock CLI or simulates keystrokes.
An independent renderer makes the persistent agent strip possible and avoids
two clients competing to answer one approval. It also means native Codex slash
commands must not be assumed to exist here; Quietline documents its own commands.

## Delivery gates

- Type checking and deterministic protocol/state/input/render tests.
- Fake-server process tests exercise transport and real request ownership.
- A real installed-Codex smoke check validates handshake and protocol responses.
- Terminal smoke checks exercise navigation, resize and cleanup.
- CI repeats offline checks on Windows, macOS and Linux, with Node 22 and 24.
- npm pack inspection excludes credentials, session logs and local evidence.

No telemetry, credential copying, automatic approval, or automatic compaction.
