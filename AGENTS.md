# Codex Quietline

All authored source, comments and documentation are English. Communicate in the
user's preferred language. Use the owner's Git identity and never add an agent
co-author trailer without a specific request.

This is a native Codex fork. `codex/` contains the pinned upstream source; read
`codex/AGENTS.md` and relevant nested guides before modifying it. The root Node
package is only an installer and launcher. Do not implement a second chat UI,
slash-command router, agent registry or approval handler in JavaScript.

Keep UI changes in the TUI and derive agent presentation from native state. Reuse
native navigation and modal/composer owners. Preserve the full upstream platform
payload when bundling, including optional resource trees. Updates must target
Quietline and retain the native daemon's separately labeled source choice.

Run `npm run check` for the bootstrap. Run native tests with upstream `just test`,
not direct `cargo test`. Review snapshots and use the lightest relevant validation
before the required package checks. Retain raw failures and logs locally in
ignored `.agent-tmp/`; record concise findings and validation under `docs/`.

Prepare source SQL bytes using `scripts/prepare-native.mjs` before native builds
and tests. Never work around migration checksum failures by modifying databases,
stored checksums, or runtime validation. Check the target's build inputs instead.

Read-only broad investigations may be delegated with scoped prompts. Keep coupled
implementation changes in one context. Do not edit the upstream model/permission
logic to solve a terminal presentation problem.
