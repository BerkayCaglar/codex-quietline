# Security policy

Use [private vulnerability reporting](https://github.com/BerkayCaglar/codex-quietline/security/advisories/new).
Include affected versions, reproduction steps and impact. Remove credentials and
private conversation data. This hobby project does not promise a response SLA.

The bootstrap verifies release SHA-256 checksums, extracts into a staging directory,
validates the native package identity and resources, then publishes a versioned
directory. It does not overwrite a running executable or copy credentials.
PATH activation uses owned launchers and reversible profile blocks. Edited
launcher files are not overwritten or deleted silently.

The native Codex engine owns execution, permissions, sandboxing, login, hooks and
MCP. Quietline does not bypass those controls. The daemon's public-stable update
option remains explicitly distinct from a Quietline client update.

Native assets and checksums are published only from a successful CI run of the
exact tagged commit. Keep Node and the fork updated. No model inference runs in CI.
