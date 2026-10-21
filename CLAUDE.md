# CLAUDE.md

Silence: educational framework (Rust) that turns a MariaDB/MySQL schema into a REST API and serves a static HTML/CSS/JS frontend. Used in IISSI classes (Universidad de Sevilla). Built on the Waveless runtime (`waveless_*` crates, git dependencies from github.com/nv0skar).

## Safety rules (this repo is in production)

- Never commit or push to `main`. Work on a branch (default: `experimentos`) and open a PR.
- Never create or push git tags: a tag matching `X.Y.Z` triggers `.github/workflows/release.yml`, which publishes a GitHub Release and pushes a formula to `IISSI-US/homebrew-tap` (students install from there).
- Do not edit `release.yml`, `dist-workspace.toml` or `.github/setup_build.yml` unless explicitly asked.
- Do not bump `version` in `Cargo.toml` unless explicitly asked.
- The repo is public: do not disclose security vulnerabilities in public issues, PR titles or commit messages before they are fixed. Ask first.
- Ask before any outward-facing GitHub action (issues, PRs, comments, repo settings).

## Build & run

Requirements: Rust stable >= 1.85 (edition 2024), Bun. `build.rs` runs `bun run build` to compile the admin/auth frontend into `target/frontend` (embedded in the binary); in debug it only rebuilds if that folder is missing.

```bash
bun install
cargo build
bun run watch                     # rebuild the frontend on change
cargo run -- new MyProject -n db -u user -p pass
cd MyProject && cargo run -- run  # admin panel at http://127.0.0.1:8080/admin
cargo run -- -D run               # debug logging
```

There are no automated tests. `Cargo.lock` and `bun.lock` are gitignored, and Waveless git deps are unpinned, so builds can break upstream without changes here.

## Architecture

- `src/main.rs`: CLI (`run`, `new`, `migrations`); on `run` creates the internal DB, runs `migrations/internal.sql`, builds the runtime and serves.
- `src/app_cx.rs`: global `AppCx` (config + user endpoints + tests grouped by file). Keeps project JSON files and the Waveless `RuntimeCx` in sync; endpoint changes rebuild the router at runtime (hot reload).
- `src/simple_endpoint.rs`: `SimpleEndpoint`, the student-facing JSON endpoint format, converted to/from `waveless_commons::endpoint::Endpoint`.
- `src/internal_endpoints/`: built-in endpoints (`/api/internal/...`): whoami, bootstrap, users CRUD, endpoints/tests/config managers, `ConsoleStream` websocket. `mysql_proxy.rs` injects `|users_target_table|`-style params into SQL.
- `src/static_service.rs`: serves embedded `/admin`, `/auth`, `/internal_assets` and the project's `static/` (fallback `web/`).
- `src/config.rs`: `config.json` schema and its translation into a Waveless build (auth tables, token TTL, roles).
- `frontend/`: SolidJS + Tailwind/daisyUI, built with Vite (`admin/` panel, `auth/` login/signup).

Project layout created by `silence new`: `config.json`, `endpoints/*.json`, `tests/*.json`, `web/`.

## Style

Match surrounding code: `CompactString`/`CheapVec`, `getset` getters, `eyre` errors, file header `// SilenceEvolution\n// Copyright (C) 2026 Oscar Alvarez Gonzalez`. Run `cargo fmt` (see `rustfmt.toml`).
