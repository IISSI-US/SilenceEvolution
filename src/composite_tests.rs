// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

//!
//! Composite tests: an ordered list of unit tests (the ones in `tests/*.json`, by name) that the
//! admin panel runs one after another. Saved in the project's `composite_tests.json`, apart from
//! `tests/` so that folder keeps holding only unit tests.
//!

use crate::*;

const COMPOSITE_TESTS_FILE: &str = "composite_tests.json";

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct CompositeTest {
    name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    /// Names of the unit tests, in the order they run.
    steps: Vec<String>,
}

fn composite_tests_file() -> Result<PathBuf> {
    Ok(get_workspace_root("config.json")
        .unwrap_or(current_dir()?)
        .join(COMPOSITE_TESTS_FILE))
}

/// The project's composite tests (none if the file doesn't exist yet).
pub async fn load() -> Result<Vec<CompositeTest>> {
    match read(composite_tests_file()?).await {
        Ok(content) => Ok(serde_json::from_slice(&content)
            .wrap_err_with(|| format!("Invalid `{}`.", COMPOSITE_TESTS_FILE))?),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(err) => Err(eyre!(err)),
    }
}

/// Replaces the project's composite tests.
pub async fn save(tests: &[CompositeTest]) -> Result<()> {
    for (ix, test) in tests.iter().enumerate() {
        if test.name.trim().is_empty() {
            bail!("Every composite test needs a name.");
        }

        if test.steps.is_empty() {
            bail!("The composite test `{}` has no unit tests.", test.name);
        }

        if tests[..ix].iter().any(|other| other.name == test.name) {
            bail!("There are two composite tests named `{}`.", test.name);
        }
    }

    write(
        composite_tests_file()?,
        serde_json::to_string_pretty(tests)? + "\n",
    )
    .await?;

    Ok(())
}
