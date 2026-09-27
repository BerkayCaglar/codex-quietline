# codex-quietline

**Your Codex. Everything in view.**

Quietline is a small, maintained fork of the **native Codex CLI**. Type `codex`,
use the same `/` menu, and keep real subagents visible under the composer.

[![CI](https://github.com/BerkayCaglar/codex-quietline/actions/workflows/ci.yml/badge.svg)](https://github.com/BerkayCaglar/codex-quietline/actions/workflows/ci.yml)
[![Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-69d3ac)](LICENSE)

## What changes

- A centered, static Quietline mark and welcome on a fresh conversation.
- A persistent strip of subagents, with native labels, working/idle/closed status,
  and the selected conversation highlighted. In the full-screen TUI, hovering
  highlights a row and clicking it opens that agent's native conversation.
- `Alt+↑` / `Alt+↓` to use native agent switching. Original `Alt+←` / `Alt+→`
  shortcuts and `/subagents` remain available. Fast switching follows Codex's
  empty-composer rule, preserving editing shortcuts while a draft exists.
  VS Code's integrated terminal sends `Ctrl+arrow` sequences for `Alt+arrow`;
  Quietline accepts those sequences for the same switching action.
- The main session's model and context stay in Codex's existing status line.
  There is no duplicate Main row; the strip is hidden when there are no children.

**Everything else stays native:** slash menus, model selection, permissions,
MCP, plugins, skills, paste handling, terminal history, approvals, resume,
remote sessions and the execution engine. Feature availability still follows
your Codex configuration and account.

This is not an overlay that scrapes terminal output, an independent chat UI,
or a replacement implementation of Codex's commands.

## Install

Requires Node.js 22+ for the small installer. The interactive application itself
is the compiled Rust Codex CLI. No Rust toolchain is needed to use a release.

```sh
npm install -g https://github.com/BerkayCaglar/codex-quietline/releases/latest/download/codex-quietline.tgz
codex-quietline setup
```

Restart your terminal application (including VS Code, when using its integrated
terminal) so it picks up the updated PATH. Then:

```sh
codex
```

Setup downloads the matching native archive, verifies its SHA-256, and activates
a managed launcher ahead of the original `codex` on your user PATH. Your existing
official Codex package, login and configuration are preserved. You can also run
`codex-quietline` directly without PATH activation.

Published targets: Windows x64; macOS Intel and Apple Silicon; Linux x64 and ARM64.
The complete upstream platform payload is retained, including sandbox, code-mode,
voice and shell resources. Only the native Codex entrypoint is replaced by the fork.

## Use

```sh
codex -C /path/to/project
codex resume
codex --no-daemon
codex doctor
```

Inside the conversation, type `/` to open **Codex's real command picker**.
Use `/model`, `/permissions`, `/mcp`, `/plugins`, `/statusline`, `/theme`,
`/subagents`, and other commands provided by the pinned Codex version.

Ask Codex to delegate work when you want subagents. Quietline shows the agents
Codex actually creates; it does not spend tokens to populate the strip.
Parent-owned subagents retain Codex's native input restrictions. Selecting one
does not turn it into an independent agent or relay messages through the parent.

The welcome is transient: it never becomes a chat message or changes model
context. It disappears when actual conversation activity starts and stays static
when animations are disabled. Native dialogs and slash menus retain priority.

## Update and deactivate

```sh
codex update
# or
codex-quietline upgrade

codex-quietline deactivate
```

The fork's updater follows Quietline releases, not the official Codex package.
It prepares the new native bundle before replacing the installer and never
downgrades a newer installed version. The native daemon menu remains separate:
its explicitly labeled public-stable option still means OpenAI's daemon.

Deactivation removes Quietline's managed PATH entry/block and unmodified launcher
files. It does not uninstall or rewrite your original Codex. Restart the terminal
application afterward. To remove the bootstrap too, run `npm uninstall -g codex-quietline`.

For an isolated or portable installation, set `QUIETLINE_HOME` to an absolute
directory before setup and launch. `CODEX_HOME` continues to belong to Codex.

## From 0.1

Version 0.1 was an independent TypeScript client with a limited command set.
Version 0.2 replaces that architecture with the native CLI. The old `/main`,
`/attention`, and other client-specific commands are not the new command contract;
the native `/` picker is authoritative.

Conversations were already persisted by Codex, so there is no transcript
conversion. Use `codex resume THREAD_ID` for a known earlier conversation.

## Build and contribute

The exact upstream tag and commit are recorded in [upstream.json](upstream.json).
The full source is under [codex/](codex/); it is not fetched from a floating branch.

```sh
npm ci
npm run check
npm run build:native
```

Native builds require Rust 1.95.0 and the target platform's C/C++ build tools.
See [Contributing](CONTRIBUTING.md), [architecture](docs/architecture.md), and
[validation](docs/validation.md) for native checks and source-build installation.

Inspired by [claude-quietline](https://github.com/BerkayCaglar/claude-quietline).
Based on [OpenAI Codex](https://github.com/openai/codex). This project is independent
and is not affiliated with or endorsed by OpenAI. [Apache-2.0](LICENSE); see [NOTICE](NOTICE).
