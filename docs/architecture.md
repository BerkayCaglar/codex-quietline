# Native architecture

Quietline 0.2 replaces the independent 0.1 terminal client with a maintained fork
of Codex's Rust TUI. Native Codex owns every interactive command, composer state,
approval, agent navigation, session, backend connection and execution policy.

## Source and presentation

`upstream.json` pins the imported source. `codex/codex-rs/tui/src/quietline.rs`
contains pure presentation. `app/quietline.rs` derives rows from the existing
`AgentNavigationState` and reuses the existing fresh-conversation latch.

The strip excludes the primary thread, remains bounded, and keeps selected agents
visible. It uses native status and selection; it does not collect a parallel cache
of model/context information. Model and context remain in the native status line.
Alt+Up/Down aliases route through the existing native agent-switch path.

The static welcome is painted in transient terminal space, never inserted into
history or model context. Owned-screen rendering keeps the native bottom pane and
footer composition. Inline mode uses native resize reflow when leaving the fresh
full-height viewport. Modals and command popups retain their own rendering/input.

## Distribution

The bootstrap passes arguments and inherited stdio to the native entrypoint.
`platforms.json` owns supported platform triples and CI runners. Release bundles
retain the complete matching official platform payload, then replace only Codex
itself and stamp the fork package identity. Helper binaries and resource trees stay
version-aligned with the pinned backend source.

Setup installs into a versioned user directory and activates managed `codex`
launchers ahead of the original installation on PATH. It does not overwrite the
official npm package or authentication/configuration. Deactivation removes only
owned activation. `QUIETLINE_HOME` can isolate a source-build installation.

Native update owners query Quietline releases and invoke the fork's upgrade path.
The updater cache is separate from stock Codex. Upgrades prepare the new native
payload before updating the bootstrap; the shared daemon remains a separate native
operation with its original source labels.

## Build compatibility

The release tag has workspace version 0.157.1 while its lockfile originally lists
internal crates as 0.0.0. The fork reconciles only those workspace versions; external
dependencies stay pinned. The native version includes `+quietline.<release>` and
the bootstrap verifies agreement with its own release version.

SQLx migration hashes include source line endings. Official Windows migration
bytes use CRLF, while Unix uses LF. Build preparation reproduces those bytes before
embedding. It does not alter SQL statements or relax database validation. This is
required for opening existing Codex databases without touching their contents.

The 0.1 review and [validation record](validation-0.1.md) are historical; their
TypeScript client modules are no longer part of the current architecture.
