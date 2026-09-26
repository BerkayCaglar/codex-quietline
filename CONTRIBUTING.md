# Contributing

Read [AGENTS.md](AGENTS.md) and the upstream guide in [codex/AGENTS.md](codex/AGENTS.md)
before changing Rust. Keep the fork small and preserve native owners: presentation
belongs in the TUI, navigation in the existing agent navigation state, and command
handling in native Codex. Do not recreate these in the Node bootstrap.

## Checks

- Bootstrap: `npm ci` and `npm run check` (no model calls).
- Native: Rust 1.95.0, C/C++ build tools, `just`, `cargo-nextest`, and `cargo-insta`.
- Linux native sandbox integration tests also require `bubblewrap` on PATH.
- From the root: `npm run test:native -- -p codex-config -p codex-tui -p codex-cli --cargo-profile dev-small`.
  This prepares embedded SQL bytes and invokes upstream `just test` with a generic
  ANSI terminal environment. Windows debug test threads receive a 16 MiB stack.
  Two tests run concurrently by default; pass `--test-threads N` to change this.
  The installed application keeps the user's real terminal and locale settings.
- Run `just fmt` after Rust edits and scoped `just fix -p codex-tui` before delivery,
  following the upstream guide. Its full formatter also needs Python, PowerShell 7
  on Windows, DotSlash and uv.
- Review generated `.snap.new` files before accepting native UI snapshots. Include
  narrow terminals, modal priority and native slash-menu behavior.

Windows SQLx migration checksums depend on CRLF bytes in the pinned official
distribution. The build preparation step reproduces those target bytes without
changing SQL statements, stored checksums, databases or runtime migration guards.
Do not disable migration validation or reset an existing user's database to make a
build start. This preparation also normalizes LF for Unix targets.

## Build a distributable

`npm run build:native -- --target TARGET` builds the native entrypoint. Then:

```sh
npm run bundle -- --binary /absolute/path/to/built/codex
```

Bundling obtains the exact official platform payload from the pinned npm release,
retains its entire resource layout, replaces its entrypoint, and writes a checksum.
Linux builds first fetch that same payload and embed its `bwrap` digest. Bundling
verifies the binary's build record against both the entrypoint and the sandbox
helper, preserving Codex's execution-time integrity check.
Do not cherry-pick a few executables or omit voice libraries, zsh or sandbox files.
Test a local archive without changing your normal installation by setting an
absolute `QUIETLINE_HOME`, then running:

```sh
node bin/quietline.mjs setup --download-only --archive FILE --sha256 HASH
node bin/quietline.mjs --no-daemon
```

CI builds native archives for every target in `platforms.json`. Tag a release only
after CI succeeds on that exact commit. The release job reuses its verified native
artifacts, collects all checksums and publishes the matching bootstrap.

## Upstream updates

Update the pinned source deliberately, review the small native patch, reconcile
the workspace version and Cargo/Bazel locks, and run native tests. Keep package,
engine and helper versions aligned. `npm run check` catches version drift.
Preserve upstream license/attribution and mark modified source files. Use the
owner's configured Git identity; do not add agent co-author trailers.

Keep authored source and documentation in English. Use Issues for reproducible
bugs and feature proposals, and SECURITY.md for private vulnerability reports.
