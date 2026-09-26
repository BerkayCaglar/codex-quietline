# Security policy

Report vulnerabilities privately using
[GitHub private vulnerability reporting](https://github.com/BerkayCaglar/codex-quietline/security/advisories/new).
Include affected versions, reproduction steps and the impact. Do not attach
credentials, authentication files or private transcripts. This hobby project
does not promise a fixed response SLA.

Quietline owns a private stdio App Server process. It does not open a port or
collect telemetry. Server request IDs are correlated exactly. Unknown actionable
requests receive an explicit unsupported error; approvals are never inferred
from model output. Tool/model text is sanitized before terminal rendering.

Codex permissions and sandboxing remain enforced by Codex. Review the details of
an approval before allowing it. Quietline does not make third-party MCP servers,
skills, hooks, model providers or shell commands trustworthy.

Supported security fixes target the latest released Quietline version. Keep
Node.js and Codex patched. Use `--doctor` after upgrading Codex.
