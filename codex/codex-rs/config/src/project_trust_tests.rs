use super::*;
use pretty_assertions::assert_eq;

#[test]
fn native_project_spellings_preserve_trust_decisions() -> anyhow::Result<()> {
    let project = tempfile::tempdir()?;
    let canonical = project.path().canonicalize()?;
    let nested = project.path().join("nested");
    std::fs::create_dir(&nested)?;
    for trust_level in [TrustLevel::Trusted, TrustLevel::Untrusted] {
        let expected = ProjectConfig {
            trust_level: Some(trust_level),
        };
        let config = ConfigToml {
            projects: Some(HashMap::from([(
                crate::loader::project_trust_key(project.path()),
                expected.clone(),
            )])),
            ..Default::default()
        };
        // TempDir may use a short Windows path; canonicalize returns its verbatim long spelling.
        for spelling in [project.path(), canonical.as_path()] {
            assert_eq!(
                config.get_active_project(spelling, /*repo_root*/ None),
                Some(expected.clone())
            );
            assert_eq!(
                config.get_active_project(&nested, Some(spelling)),
                Some(expected.clone())
            );
        }
    }
    Ok(())
}

#[test]
fn canonical_trust_retains_precedence_over_an_original_alias() -> anyhow::Result<()> {
    let project = tempfile::tempdir()?;
    let alias = project.path().join(".");
    let canonical_key = crate::loader::project_trust_key(&alias);
    let alias_key = normalize_project_lookup_key(alias.to_string_lossy().to_string());
    assert_ne!(canonical_key, alias_key);
    for (canonical_trust, alias_trust) in [
        (TrustLevel::Trusted, TrustLevel::Untrusted),
        (TrustLevel::Untrusted, TrustLevel::Trusted),
    ] {
        let expected = ProjectConfig {
            trust_level: Some(canonical_trust),
        };
        let config = ConfigToml {
            projects: Some(HashMap::from([
                (canonical_key.clone(), expected.clone()),
                (
                    alias_key.clone(),
                    ProjectConfig {
                        trust_level: Some(alias_trust),
                    },
                ),
            ])),
            ..Default::default()
        };
        assert_eq!(
            config.get_active_project(&alias, /*repo_root*/ None),
            Some(expected)
        );
    }
    Ok(())
}

#[cfg(windows)]
#[test]
fn legacy_verbatim_project_keys_remain_readable() -> anyhow::Result<()> {
    let project = tempfile::tempdir()?;
    let key =
        normalize_project_lookup_key(project.path().canonicalize()?.to_string_lossy().to_string());
    for trust_level in [TrustLevel::Trusted, TrustLevel::Untrusted] {
        let expected = ProjectConfig {
            trust_level: Some(trust_level),
        };
        let config = ConfigToml {
            projects: Some(HashMap::from([(key.clone(), expected.clone())])),
            ..Default::default()
        };
        assert_eq!(
            config.get_active_project(project.path(), /*repo_root*/ None),
            Some(expected)
        );
    }
    Ok(())
}

#[cfg(windows)]
#[test]
fn legacy_canonical_denial_precedes_a_trusted_original_alias() -> anyhow::Result<()> {
    let project = tempfile::tempdir()?;
    let alias = project.path().join(".");
    let canonical_key =
        normalize_project_lookup_key(project.path().canonicalize()?.to_string_lossy().to_string());
    let original_key = normalize_project_lookup_key(alias.to_string_lossy().to_string());
    let denied = ProjectConfig {
        trust_level: Some(TrustLevel::Untrusted),
    };
    let config = ConfigToml {
        projects: Some(HashMap::from([
            (canonical_key, denied.clone()),
            (
                original_key,
                ProjectConfig {
                    trust_level: Some(TrustLevel::Trusted),
                },
            ),
        ])),
        ..Default::default()
    };
    assert_eq!(
        config.get_active_project(&alias, /*repo_root*/ None),
        Some(denied)
    );
    Ok(())
}

#[cfg(windows)]
#[test]
fn current_writer_key_precedes_conflicting_legacy_canonical_decisions() -> anyhow::Result<()> {
    let project = tempfile::tempdir()?;
    let current = crate::loader::project_trust_key(project.path());
    let legacy =
        normalize_project_lookup_key(project.path().canonicalize()?.to_string_lossy().to_string());
    assert_ne!(current, legacy);
    for (current_trust, legacy_trust) in [
        (TrustLevel::Trusted, TrustLevel::Untrusted),
        (TrustLevel::Untrusted, TrustLevel::Trusted),
    ] {
        let expected = ProjectConfig {
            trust_level: Some(current_trust),
        };
        let config = ConfigToml {
            projects: Some(HashMap::from([
                (current.clone(), expected.clone()),
                (
                    legacy.clone(),
                    ProjectConfig {
                        trust_level: Some(legacy_trust),
                    },
                ),
            ])),
            ..Default::default()
        };
        assert_eq!(
            config.get_active_project(project.path(), /*repo_root*/ None),
            Some(expected)
        );
    }
    Ok(())
}
