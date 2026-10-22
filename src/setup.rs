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

/// Starting page of a new project's `web/` folder: tells the student to build the front-end there.
pub const WEB_INDEX: &str = include_str!("../templates/web/index.html");

/// Creates the project's files in `dir`: `config.json` with the default settings, the
/// `endpoints`, `tests` and `web` folders, and `web/index.html`.
pub async fn init_project(dir: &Path) -> Result<()> {
    let content = serde_json::to_string_pretty(&Config::default())?;

    write(dir.join("config.json"), content).await?;

    for folder in ["endpoints", "tests", "web"] {
        create_dir_all(dir.join(folder)).await?;
    }

    write(dir.join("web").join("index.html"), WEB_INDEX).await?;

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

/// A database of the server, as offered by the setup page.
#[derive(Serialize, Debug)]
pub struct ServerDatabase {
    name: String,
    /// Number of tables.
    tables: i64,
    /// Whether it already holds Silence's users table (a candidate for the users database).
    has_users: bool,
}

/// Credentials to browse a database server from the setup page.
#[derive(Deserialize, Debug)]
pub struct ServerCredentials {
    host: SocketAddr,
    username: String,
    password: String,
}

/// Lists the databases the user can access on the server (MariaDB only lists those).
pub async fn list_databases(credentials: &ServerCredentials) -> Result<Vec<ServerDatabase>> {
    use sea_orm::sqlx::{self, ConnectOptions, Row, mysql::MySqlConnectOptions};

    let mut conn = MySqlConnectOptions::new()
        .host(&credentials.host.ip().to_string())
        .port(credentials.host.port())
        .username(&credentials.username)
        .password(&credentials.password)
        .connect()
        .await?;

    let rows = sqlx::query(
        "SELECT CAST(s.schema_name AS CHAR) AS name,
                CAST(COUNT(t.table_name) AS SIGNED) AS tables,
                CAST(COALESCE(MAX(t.table_name = 'silence_users'), 0) AS SIGNED) AS has_users
         FROM information_schema.schemata s
         LEFT JOIN information_schema.tables t ON t.table_schema = s.schema_name
         WHERE s.schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
         GROUP BY s.schema_name
         ORDER BY s.schema_name",
    )
    .fetch_all(&mut conn)
    .await?;

    rows.iter()
        .map(|row| {
            Ok(ServerDatabase {
                name: row.try_get("name")?,
                tables: row.try_get("tables")?,
                has_users: row.try_get::<i64, _>("has_users")? != 0,
            })
        })
        .collect()
}

/// Serves `/_setup/*`:
/// - `GET status`: `{connected, error, local_admin}`.
/// - `GET config` / `PUT config` (a config patch): the project's settings, before connecting.
/// - `POST databases` (`{host, username, password}`): the databases of that server.
/// - `POST connect`: connects to the configured databases.
/// - `GET console`: the server's log as Server-Sent Events (one `data:` line per log line).
/// - `GET stats` / `DELETE stats`: usage statistics (see `stats.rs`) / reset them.
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
        (hyper::Method::POST, "_setup/databases") => {
            let body = match request.into_body().collect().await {
                Ok(body) => body.to_bytes(),
                Err(err) => return error(400, format!("Cannot read the request's body. {}", err)),
            };

            let credentials = match serde_json::from_slice::<ServerCredentials>(&body) {
                Ok(credentials) => credentials,
                Err(err) => return error(400, format!("Invalid server credentials. {}", err)),
            };

            match list_databases(&credentials).await {
                Ok(databases) => reply(200, serde_json::to_value(databases).unwrap_or_default()),
                Err(err) => error(400, format!("Cannot connect to the server. {:#}", err)),
            }
        }
        (hyper::Method::GET, "_setup/stats") => reply(200, stats::report().await),
        (hyper::Method::DELETE, "_setup/stats") => match stats::reset().await {
            Ok(()) => reply(200, json!({})),
            Err(err) => error(500, format!("Cannot reset the statistics. {}", err)),
        },
        (hyper::Method::GET, "_setup/console") => {
            let Some(receiver) = console::subscribe() else {
                return error(503, "The console isn't available.".into());
            };

            let events = futures::stream::unfold(receiver, |mut receiver| async move {
                let text = match receiver.recv().await {
                    Ok(entry) => String::from_utf8_lossy(&entry).into_owned(),
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                        format!("[{} log lines skipped]", skipped)
                    }
                    Err(_) => return None,
                };

                let event = text
                    .trim_end_matches('\n')
                    .split('\n')
                    .map(|line| format!("data: {}\n", line))
                    .collect::<String>()
                    + "\n";

                Some((
                    Ok::<_, eyre::Error>(hyper::body::Frame::data(ConnBytes::from(event))),
                    receiver,
                ))
            });

            Response::builder()
                .status(200)
                .header("Content-Type", "text/event-stream")
                .header("Cache-Control", "no-store")
                .body(BoxBody::new(http_body_util::StreamBody::new(events)))
                .unwrap()
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
