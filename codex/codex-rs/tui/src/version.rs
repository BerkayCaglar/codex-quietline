// Modified for Codex Quietline: native presentation and distribution integration.
/// The current Codex CLI version as embedded at compile time.
#[cfg(not(test))]
pub const CODEX_CLI_VERSION: &str = env!("CARGO_PKG_VERSION");

// UI fixtures use the upstream development version so releases do not change layout baselines.
#[cfg(test)]
pub const CODEX_CLI_VERSION: &str = "0.0.0";
