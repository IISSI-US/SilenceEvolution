# CLAUDE.md

Silence: educational framework (Rust) that turns a MariaDB/MySQL schema into a REST API and serves a static HTML/CSS/JS frontend. A project of the DEAL research group (Universidad de Sevilla), used in IISSI classes. Built on the Waveless runtime (`waveless_*` crates, external git dependencies).

## Safety rules (this repo is in production)

- Never commit or push to `main`. Work on a branch and open a PR. `experimentos`: new panel rewrite (PoC). `experimentos2`: same functional changes applied to the current `frontend/` without changing its stack, to evaluate the cost of changing it.
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
- The admin panel (`/admin`) can be driven with headless Chromium (`/snap/bin/chromium`) through `puppeteer-core` installed outside the repo.

## Architecture

- `src/main.rs`: CLI (`run`, `new`, `migrations`); on `run` creates the internal DB, runs `migrations/internal.sql`, builds the runtime and serves.
- `src/app_cx.rs`: global `AppCx` (config + user endpoints + tests grouped by file). Keeps project JSON files and the Waveless `RuntimeCx` in sync; endpoint changes rebuild the router at runtime (hot reload).
- `src/simple_endpoint.rs`: `SimpleEndpoint`, the student-facing JSON endpoint format, converted to/from `waveless_commons::endpoint::Endpoint`.
- `src/internal_endpoints/`: built-in endpoints (`/api/internal/...`): whoami, bootstrap, users CRUD, endpoints/tests/config managers, `ConsoleStream` websocket. `mysql_proxy.rs` injects `|users_target_table|`-style params into SQL.
- `src/static_service.rs`: serves embedded `/admin`, `/auth`, `/internal_assets` and the project's `static/` (fallback `web/`).
- `src/setup.rs` (branch `experimentos3`): `silence run` in an empty directory (hidden files ignored) creates the project there; a non-empty directory that isn't a project is an error. If the databases can't be connected on start, the server runs in setup mode: `/_setup/{status,config,connect}` is served by `static_service.rs`, outside Waveless (every Waveless endpoint asks for DB connections, which are a `OnceCell` set once: changing databases needs a restart). `POST /api/internal/admin/endpoints/load` discovers the schema. When listening on loopback the admin API needs no login (`LOCAL_ADMIN`; Waveless doesn't expose the client address, so the check is the listening address); users created from the admin API get an argon2 hash.
- `src/config.rs`: `config.json` schema and its translation into a Waveless build (auth tables, token TTL, roles).
- `frontend/`: SolidJS + Tailwind/daisyUI, built with Vite (`admin/` panel, `auth/` login/signup).
  - Themes `silence` / `silence-dark` (daisyUI, `styles/tailwind.css`) use the same tokens as the new panel. Icons: `admin/components/Icon.tsx` + sprite `public/internal_assets/icons.svg` (no icon fonts from CDNs). Served at `/admin` and `/admin2`.
  - In debug, `cargo build` doesn't rebuild the frontend if `target/frontend` exists: run `bun run build` (or `bun run watch`); the binary reads `target/frontend` from disk. `bunx tsc --noEmit -p .` has 2 pre-existing errors in `Config.tsx`.

Project layout created by `silence new`: `config.json`, `endpoints/*.json`, `tests/*.json`, `web/`.

## Style

Match surrounding code: `CompactString`/`CheapVec`, `getset` getters, `eyre` errors. New files start with the header `// SilenceEvolution\n// Copyright (C) 2026 DEAL research group, Universidad de Sevilla` (`<!-- -->` in HTML). Don't change the headers of existing files without asking. Run `cargo fmt` (see `rustfmt.toml`).
