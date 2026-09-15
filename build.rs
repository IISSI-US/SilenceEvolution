// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

use std::env::var;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    println!("cargo::rerun-if-changed=['./package.json', './frontend']");

    let path = PathBuf::from("./target/frontend");

    let profile = var("PROFILE").unwrap_or_default();

    if !path.exists() || path.is_empty() || profile.to_lowercase() == "release" {
        let build_frontend = Command::new("bun")
            .arg("run")
            .arg("build")
            .status()
            .expect("Cannot invoke frontend build process.");

        assert!(build_frontend.success(), "Frontend build failed.");
    } else {
        println!("cargo::warning=Skipping frontend building.")
    }
}
