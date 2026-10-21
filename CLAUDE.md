# CLAUDE.md

Silence: educational framework (Rust) that turns a MariaDB/MySQL schema into a REST API and serves a static HTML/CSS/JS frontend. A project of the DEAL research group (Universidad de Sevilla), used in IISSI classes. Built on the Waveless runtime (`waveless_*` crates, external git dependencies).

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

`Cargo.lock` and `bun.lock` are gitignored, and Waveless git deps are unpinned, so builds can break upstream without changes here. If cargo fails to fetch git deps through SSH, set `CARGO_NET_GIT_FETCH_WITH_CLI=true`.

## Tests

Integration suite (bash + curl + jq) against a real MariaDB, ported from the old Silence-CI-Project (github.com/DEAL-US/Silence-CI-Project):

```bash
bash ci/run_tests.sh [target/debug/silence]   # env: DB_HOST DB_PORT DB_USER DB_PASSWORD SILENCE_PORT SILENCE_CI_VERBOSE=1 SILENCE_CI_KEEP_DB=1
```

- `ci/dept_emp.sql`: Departments–Employees schema + seed. `ci/project/`: fixture project (port 18080). The script copies it to a temp dir.
- It (re)creates and drops ONLY `silence_ci_db` and `silence_ci_internal_db`. Never touch other databases: the developer's MariaDB holds real class databases. The default user `iissi_user` only has privileges on databases whose name ends in `db`.
- Known Silence/Waveless bugs are asserted with `xfail` (reported, don't fail the run). When a bug is fixed the run shows XPASS: turn it into a `check`.
- `.github/workflows/test.yml` runs it on every branch push and PR (MariaDB service container). It never publishes.
- The admin panel can be driven with headless Chromium (`/snap/bin/chromium`) through `puppeteer-core` installed outside the repo.

## Architecture

- `src/main.rs`: CLI (`run`, `new`, `migrations`); on `run` creates the internal DB, runs `migrations/internal.sql`, builds the runtime and serves.
- `src/app_cx.rs`: global `AppCx` (config + user endpoints + tests grouped by file). Keeps project JSON files and the Waveless `RuntimeCx` in sync; endpoint changes rebuild the router at runtime (hot reload).
- `src/simple_endpoint.rs`: `SimpleEndpoint`, the student-facing JSON endpoint format, converted to/from `waveless_commons::endpoint::Endpoint`.
- `src/internal_endpoints/`: built-in endpoints (`/api/internal/...`): whoami, bootstrap, users CRUD, endpoints/tests/config managers, `ConsoleStream` websocket. `mysql_proxy.rs` injects `|users_target_table|`-style params into SQL.
- `src/static_service.rs`: serves embedded `/admin`, `/auth`, `/internal_assets` and the project's `static/` (fallback `web/`).
- `src/config.rs`: `config.json` schema and its translation into a Waveless build (auth tables, token TTL, roles).
- `frontend/`: SolidJS + Tailwind/daisyUI, built with Vite (`admin/` panel, `auth/` login/signup).

### New admin panel (proof of concept, branch `experimentos`)

Rewrite of `frontend/` in plain HTML + Sass + ES modules, without Node/Bun. It lives side by side with the old panel until it covers everything.

- `panel/admin.html`, `panel/auth.html`: served at `/admin2` and `/auth2` (hash routing: `/admin2#/endpoints`).
- `panel/js/`: native ES modules, no bundler. `dom.js` (`h()` helper; text only via text nodes, never `innerHTML`), `highlight.js` (SQL/JSON), `ansi.js`, `router.js`, one module per view.
- `panel/styles/*.scss`: compiled by `build.rs` with the `grass` crate into `target/panel_styles/panel.css`, served at `/_silence/panel.css`. Other files are served at `/_silence/<path>`.
- In debug builds rust-embed reads `panel/` from disk: HTML/JS changes need no rebuild; Sass changes need `cargo build`.

Project layout created by `silence new`: `config.json`, `endpoints/*.json`, `tests/*.json`, `web/`.

## Style

Match surrounding code: `CompactString`/`CheapVec`, `getset` getters, `eyre` errors. New files start with the header `// SilenceEvolution\n// Copyright (C) 2026 DEAL research group, Universidad de Sevilla` (`<!-- -->` in HTML). Don't change the headers of existing files without asking. Run `cargo fmt` (see `rustfmt.toml`).
