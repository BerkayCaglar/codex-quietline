# Validation

## Reproducible checks

```sh
npm ci
npm run check
npm run media
npm pack --dry-run
```

The offline suite covers JSON-RPC correlation and timeouts, UTF-8 framing, owned
process cleanup, real fake-server integration, native-child ancestry, snapshot
and live-event ordering, per-agent drafts, keyboard input, approval ownership,
secret masking and bounded terminal rendering. CI runs this suite on Node 22 and
24 on Windows, macOS and Linux. No inference runs in CI.

## Installed Codex

```sh
codex-quietline --doctor
npx tsx scripts/smoke.ts
```

Doctor checks handshake, account state and model catalog without starting a turn.
The smoke script also starts a read-only thread and checks discovery. It stores
local evidence in ignored `.agent-tmp/` files.

Live tests are explicit because they consume account usage:

```sh
npx tsx scripts/smoke.ts --live
npx tsx scripts/smoke.ts --live --interrupt
```

The first asks for two short native subagent tasks and verifies conversation
hydration. The second interrupts a real running child. Both close their own
server. Neither grants approvals. They must not be run against a sensitive
workspace or included in unattended CI.

## Initial release evidence

Environment: Windows 11, Node 24.20.0, Codex CLI 0.157.1.

- Doctor: real stdio handshake, existing authentication and seven catalog models
  returned successfully. Credentials and account identity are not retained.
- Two-child live smoke: passed; both actual child threads were discovered and
  their conversation content was hydrated. Both reported direct input disabled.
- Child-interrupt live smoke: passed; the real child accepted the interrupt and
  emitted an interrupted turn. The private server then closed successfully.
- Offline release suite: 31 tests passed on the local Windows environment.
- Native terminal: demo navigation selected a child and changed the conversation;
  quitting restored the original terminal buffer and cursor.
- UI images: generated from the shipped React renderer at 116 and 60 columns;
  overview and compact PNGs visually inspected.
- Independent protocol/lifecycle and input/layout reviews produced actionable
  findings, tracked in [the release review](reviews/0.1.0.md).

Failures retained during development: model selection initially used resume on a
new thread without a persisted rollout; fixed by the owning settings-update API.
A live-smoke completion predicate initially depended on a display label that
canonical items overwrote; fixed with a separate terminal turn status and tests.
The initial interrupt script incorrectly waited for the parent to finish after
the child was interrupted; it now asserts the child's interrupted event and closes
its test server. One earlier interrupt experiment exited with Windows control-C
status `0xC000013A` before final evidence was written. Its signal source was not
established. Incremental stage tracing was added; subsequent cleanup and the
correctly scoped interrupt check completed successfully without isolation hacks.

CI run links and package installation verification are recorded in the release
review. A successful fixture test does not prove future Codex releases or every
terminal emulator compatible.
