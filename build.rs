// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

use std::env::var;
use std::fs::{create_dir_all, write};
use std::path::PathBuf;
use std::process::Command;

fn main() {
    println!("cargo::rerun-if-changed=['./package.json', './frontend']");
    println!("cargo::rerun-if-changed=panel/styles");

    build_panel_styles();

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

/// Compiles the panel's Sass entry point into `target/panel_styles/panel.css` (embedded by `PanelStyles`).
fn build_panel_styles() {
    let out_dir = PathBuf::from("./target/panel_styles");

    let css = grass::from_path(
        "panel/styles/panel.scss",
        &grass::Options::default().style(grass::OutputStyle::Compressed),
    )
    .unwrap_or_else(|err| panic!("Cannot compile the panel's styles. {}", err));

    create_dir_all(&out_dir).expect("Cannot create the panel's styles directory.");

    write(out_dir.join("panel.css"), css).expect("Cannot write the panel's styles.");
}
