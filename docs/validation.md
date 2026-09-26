# Native validation

## Commands

```sh
npm ci
npm run check
npm run test:native -- -p codex-config -p codex-tui -p codex-cli --cargo-profile dev-small
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

## Local release verification

The third full Windows run passed 5,864 cases; the remaining two assertions and
one timeout were fixed and covered by a normal 61-case regression run, all passing.
The full run had no retries that later passed; it reported 308 leaky-handle cases.
Raw failed runs remain available locally and are not presented as passing runs.
Scoped Clippy and repository formatting both completed successfully.

Real native PTY interaction verified slash/model menus, the post-initialization
welcome, child visibility, navigation in both directions and interrupting a
running child. The test agent only performed timed waits. The acceptance sessions
shut down normally, without replacing the shared daemon.

The sandbox fixture now owns its writable temporary directory. Its previous host
TEMP behavior was diagnosed using capability records and sandbox logs, and the
isolated test passed in 1.1 seconds. Recovery of the failed local fixture grants
uses only their attributable capability identities and retained ACL evidence.

The four failed-test identities were removed from the surviving inventoried
objects. Cleanup verified 303,278 surviving descriptors against the retained
baseline, including every non-test ACE, owner, group and inheritance flag. Three
baseline temporary files had already disappeared. A flagged inheritance-marker
difference was restored and verified before cleanup resumed. Raw inventory,
failed probes, repair records and verification remain local; none is packaged.

An actual Windows 8.3 temporary path exposed the hosted runner's trust-identity
failure locally. The corrected shared normalizer passed all 348 configuration
tests plus nine CLI/TUI regressions (356 + 1 checks). Current writer keys retain
precedence over legacy canonical entries, which precede original aliases.

Release CI enforces success on the exact source commit before publication. Each
release publishes `validation.json` with that commit and successful CI run URL.
