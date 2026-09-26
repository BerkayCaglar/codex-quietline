# Native validation

## Commands

```sh
npm ci
npm run check
npm run test:native -- -p codex-tui -p codex-cli --cargo-profile dev-small
```

Use `npm run build:native` from the root for release builds. Follow CONTRIBUTING.md
to bundle and install into an isolated `QUIETLINE_HOME`. Real-terminal acceptance
uses `--no-daemon` so it does not replace or restart another session's shared daemon.

Check the fresh welcome, `/` command picker, `/model` cancellation, subagent-only
strip, native switching and exit cleanup. Do not treat a `--help` invocation as a
live UI check. Native model calls are separate, explicit acceptance checks; CI
does not use an account or consume model usage.

## Development findings

- Source import is pinned to `rust-v0.157.1`, commit recorded in `upstream.json`.
- The lockfile's internal 0.0.0 workspace versions were reconciled. No external
  dependency updates were used to get past `--locked`.
- A first live launch reported migration checksum mismatch. Read-only comparison
  established that all 57 existing state migrations match the original Windows
  CRLF source bytes. Preparing the fork's build inputs restores that compatibility;
  no database, checksum row or migration guard was modified.
- Independent reviews found and fixed the external-writer strip bypass, owned
  renderer return/layout mismatch, updater downgrade, Windows updater dispatch,
  symlinked shell-profile replacement, multi-shell cleanup and signal propagation.
- Live Windows input opened the native `/` picker and `/model` dialog, cancelled
  the dialog and exited cleanly. It also exposed a composite startup header that
  the first snapshots missed; the header-free path now preserves its other notices.
- The first full local run completed 5,864 tests: 5,802 passed, 61 failed, one
  timed out, and 11 skipped. This is retained as a failed run, not acceptance.
  Failures included version-dependent snapshots, inherited terminal settings,
  locale/path assumptions, eight stack overflows and one worktree timeout.
  The test launcher isolates ANSI/terminal identity, and presentation fixtures
  use stable version and path/number representations. Final reruns remain required.

Raw runs are retained under ignored `.agent-tmp/`. The release review records final
test counts, native interaction evidence and CI/release links after verification.
