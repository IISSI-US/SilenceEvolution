// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

//!
//! Setup mode. `silence run` in an empty directory creates the project there and starts the server
//! without databases: the admin panel configures the connections through `/_setup/*` and, once
//! connected, the admin API (users, tests, endpoints) becomes available and `Load endpoints`
//! discovers the schema and starts serving the API.
//! The same happens when an existing project can't connect to its databases on start.
//!
//! The setup API is served by Silence's static service, outside Waveless' router: every Waveless
//! endpoint asks for database connections, which don't exist yet in setup mode.
//!
//! The admin panel and its API don't require a login when the server listens on a loopback address
//! (only reachable from the same machine). Otherwise the admin API keeps requiring the admin role.
//!

use crate::*;

use config::*;
use databases::DatabasesManager;

use waveless_sql::databases::mysql::*;

use std::sync::atomic::{AtomicBool, Ordering};

/// Whether the admin panel and its API are open without a login (server listening on loopback).
pub static LOCAL_ADMIN: AtomicBool = AtomicBool::new(false);

/// Connection state shown by the admin panel.
pub static SETUP: LazyLock<RwLock<SetupState>> =
    LazyLock::new(|| RwLock::new(SetupState::default()));

#[derive(Clone, Default, Serialize, Debug)]
pub struct SetupState {
    /// Whether the databases are connected (the admin API and the generated endpoints need them).
    pub connected: bool,
    /// Last connection error, shown in the setup page.
    pub error: Option<String>,
}

/// Returns whether the admin panel can be used without a login when listening on `addr`.
pub fn is_local_admin(addr: Option<SocketAddr>) -> bool {
    addr.map(|addr| addr.ip().is_loopback()).unwrap_or(false)
}

/// Makes sure there is a project to run: an existing one (in this directory or a parent), or a
/// new one created here when the directory is empty (hidden files are ignored).
/// Returns whether a project was created.
pub async fn prepare_workspace() -> Result<bool> {
    if get_workspace_root("config.json").is_ok() {
        return Ok(false);
    }

    let dir = current_dir()?;

    if !is_empty_dir(&dir).await? {
        bail!("This directory is not a Silence project and it isn't empty.");
    }

    init_project(&dir).await?;

    Ok(true)
}

async fn is_empty_dir(dir: &Path) -> Result<bool> {
    let mut entries = read_dir(dir).await?;

    while let Some(entry) = entries.next_entry().await? {
        if !entry.file_name().to_string_lossy().starts_with('.') {
            return Ok(false);
        }
    }

    Ok(true)
}

/// Creates the project's files in `dir`: `config.json` with the default settings and the
/// `endpoints`, `tests` and `web` folders.
pub async fn init_project(dir: &Path) -> Result<()> {
    let content = serde_json::to_string_pretty(&Config::default())?;

    write(dir.join("config.json"), content).await?;

    for folder in ["endpoints", "tests", "web"] {
        create_dir_all(dir.join(folder)).await?;
    }

    Ok(())
}

/// Connects to the project's databases: creates the internal database if needed, loads the
/// connections and runs the migrations. Connections can only be loaded once per process, so a
/// failure leaves nothing loaded and can be retried.
pub async fn connect_databases(config: &Config) -> Result<()> {
    if SETUP.read().await.connected {
        bail!("The databases are already connected. Restart the server to change them.");
    }

    let internal = config.databases_conn().internal().to_owned();

    // The internal database is created with the same credentials, connecting without a database.
    if let Some(internal) = &internal {
        let server_conn = MySQLDbConnectionConfig::new(
            internal.host().to_owned(),
            internal.username().to_owned(),
            internal.password().to_owned(),
            "".into(),
        );

        create_internal_db(&server_conn, Some(internal.db().to_owned())).await?;
    }

    DatabasesManager::load(config.into_database_config()).await?;

    run_migrations(internal.map(|internal| internal.db().to_owned())).await?;

    let mut state = SETUP.write().await;
    state.connected = true;
    state.error = None;

    Ok(())
}

/// Discovers the database's schema and replaces the generated endpoints in the runtime.
/// Returns how many endpoints are generated.
pub async fn load_generated_endpoints() -> Result<usize> {
    if !SETUP.read().await.connected {
        bail!("Configure and connect the databases first.");
    }

    let discovered = AppCx::acquire().discover_endpoints().await?;
    let count = discovered.inner().len();

    {
        let mut build = RuntimeCx::acquire().build().write().await;
        let endpoints = build.endpoints_mut();

        // Drop the previously generated endpoints (the internal ones are kept).
        endpoints.inner_mut().retain(|endpoint| {
            let auto_generated = match endpoint.execution_target() {
                ExecutionTarget::Http(http_target) => *http_target.auto_generated(),
                ExecutionTarget::Socket(_) => false,
            };

            !auto_generated || is_endpoint_internal(endpoint)
        });

        endpoints.merge(discovered)?;
    }

    RuntimeCx::acquire().build_router().await?;

    Ok(count)
}

/// Serves `/_setup/*`:
/// - `GET status`: `{connected, error, local_admin}`.
/// - `GET config` / `PUT config` (a config patch): the project's settings, before connecting.
/// - `POST connect`: connects to the configured databases.
pub async fn handle(request: Request<BoxBody<ConnBytes, eyre::Error>>) -> Response<ConnBody> {
    let method = request.method().to_owned();
    let path = request.uri().path().trim_matches('/').to_owned();
    let local_admin = LOCAL_ADMIN.load(Ordering::Relaxed);

    let reply = |status: u16, value: serde_json::Value| {
        Response::builder()
            .status(status)
            .header("Content-Type", "application/json; charset=utf-8")
            .header("Cache-Control", "no-store")
            .body(json_conn_body(&value))
            .unwrap()
    };

    let error = |status: u16, message: String| reply(status, json!({ "error": message }));

    if path == "_setup/status" && method == hyper::Method::GET {
        let state = SETUP.read().await.to_owned();

        return reply(
            200,
            json!({ "connected": state.connected, "error": state.error, "local_admin": local_admin }),
        );
    }

    if !local_admin {
        return error(
            403,
            "The setup is only available when the server listens on a loopback address.".into(),
        );
    }

    match (method, path.as_str()) {
        (hyper::Method::GET, "_setup/config") => {
            let config = AppCx::acquire().config().read().await.to_owned();

            reply(200, serde_json::to_value(config).unwrap_or_default())
        }
        (hyper::Method::PUT, "_setup/config") => {
            if SETUP.read().await.connected {
                return error(
                    409,
                    "The databases are already connected. Use the settings page.".into(),
                );
            }

            let body = match request.into_body().collect().await {
                Ok(body) => body.to_bytes(),
                Err(err) => return error(400, format!("Cannot read the request's body. {}", err)),
            };

            let patch = match serde_json::from_slice::<ConfigPatch>(&body) {
                Ok(patch) => patch,
                Err(err) => return error(400, format!("Invalid settings. {}", err)),
            };

            AppCx::acquire().config().write().await.apply(patch);

            match AppCx::acquire().set_config().await {
                Ok(()) => reply(200, json!({})),
                Err(err) => error(500, format!("Cannot save the settings. {}", err)),
            }
        }
        (hyper::Method::POST, "_setup/connect") => {
            let config = AppCx::acquire().config().read().await.to_owned();

            match connect_databases(&config).await {
                Ok(()) => {
                    info!("Connected to the databases.");
                    reply(200, json!({ "connected": true }))
                }
                Err(err) => {
                    let message = format!("{:#}", err);
                    warn!("Cannot connect to the databases: {}", message);
                    SETUP.write().await.error = Some(message.to_owned());
                    error(400, message)
                }
            }
        }
        _ => error(404, "Resource not found.".into()),
    }
}
