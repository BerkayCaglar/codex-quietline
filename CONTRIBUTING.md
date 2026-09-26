# Contributing

Use Node.js 22 or 24 and npm. Run `npm ci`, then `npm run check` before opening a
pull request. Describe the observed problem, the resulting behavior, and how you
verified it. Include terminal, OS and Codex versions for platform bugs.

Keep protocol operations out of presentation components. Extend the owning
transport, state reducer or layout function instead of adding a second source of
truth. Agent identities and activity come from Codex protocol data. Avoid output
scraping, timing-based state guesses and automatic approval behavior.

Add tests for request correlation, state transitions and keyboard behavior when
changing them. Use `test/fixtures/server.mjs` for deterministic process tests;
never put credentials, real account responses or private conversations in fixtures.
`npm run media` renders the actual UI for README previews.

Keep all authored source and documentation in English. Follow the surrounding
style and format with `npm run format`. Do not include unrelated cleanup in a fix.
Preserve authorship and license notices when incorporating external code.

Bug reports and feature requests belong in GitHub Issues. For vulnerabilities,
follow SECURITY.md rather than opening a public issue with exploit details.
