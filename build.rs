// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

use std::env::var;
use std::fs::{copy, create_dir_all, read_dir, read_to_string, remove_dir_all, write};
use std::path::{Path, PathBuf};
use std::process::Command;

use oxc_allocator::Allocator;
use oxc_codegen::{Codegen, CodegenOptions};
use oxc_minifier::{Minifier, MinifierOptions};
use oxc_parser::Parser;
use oxc_span::SourceType;

fn main() {
    println!("cargo::rerun-if-changed=['./package.json', './frontend']");
    println!("cargo::rerun-if-changed=panel");

    build_panel_styles();

    let profile = var("PROFILE").unwrap_or_default();

    // Release builds embed a minified copy of the panel (debug builds read `panel/` from disk).
    if profile.to_lowercase() == "release" {
        build_panel_dist();
    }

    let path = PathBuf::from("./target/frontend");

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

/// Copies `panel/` into `target/panel_dist` (embedded by `PanelFiles` in release builds),
/// minifying JavaScript files and leaving out the Sass sources.
fn build_panel_dist() {
    let out_dir = PathBuf::from("./target/panel_dist");

    let _ = remove_dir_all(&out_dir);

    copy_minified(Path::new("panel"), &out_dir);
}

fn copy_minified(from: &Path, to: &Path) {
    create_dir_all(to).expect("Cannot create the panel's dist directory.");

    for entry in read_dir(from).expect("Cannot read the panel's directory.") {
        let path = entry.expect("Cannot read a panel's file.").path();
        let target = to.join(path.file_name().unwrap());

        if path.is_dir() {
            if path.file_name().unwrap() != "styles" {
                copy_minified(&path, &target);
            }
        } else if path.extension().is_some_and(|extension| extension == "js") {
            let source = read_to_string(&path).expect("Cannot read a panel's script.");

            match minify_js(&source) {
                Some(code) => write(&target, code).expect("Cannot write a minified script."),
                None => {
                    println!("cargo::warning=Cannot minify `{}`, embedding it as is.", path.display());
                    copy(&path, &target).expect("Cannot copy a panel's script.");
                }
            }
        } else {
            copy(&path, &target).expect("Cannot copy a panel's file.");
        }
    }
}

/// Minifies an ES module. Returns `None` if it can't be parsed.
fn minify_js(source: &str) -> Option<String> {
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, SourceType::mjs()).parse();

    if !parsed.diagnostics.is_empty() {
        return None;
    }

    let mut program = parsed.program;
    let minified = Minifier::new(MinifierOptions::default()).minify(&allocator, &mut program);

    Some(
        Codegen::new()
            .with_options(CodegenOptions::minify())
            .with_scoping(minified.scoping)
            .build(&program)
            .code,
    )
}
