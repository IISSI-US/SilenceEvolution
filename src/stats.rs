// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

//!
//! Usage statistics of the server, shown in the admin panel's Stats section. They are kept in
//! memory, saved to the project's `stats.json` (not in the database) every few seconds when they
//! change, and can be reset.
//!
//! Two sources, neither changes the API nor Waveless:
//! - Requests: Waveless logs every request that reaches an endpoint ("`GET` request at `/path`");
//!   `StatsLayer` (a `tracing` layer) counts them by method and path. This includes requests
//!   rejected before running (authentication, missing params).
//! - Executions: `MySQLExecutorProxy` (every SQL endpoint, generated ones included, see
//!   `AppCx::discover_endpoints`) records the status and duration of each execution.
//!
//! The front-end (the project's `web/` files, served by `StaticService`) is counted apart from
//! the API: requests, missing files and bytes by path.
//!

use crate::*;

use std::collections::BTreeMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

use regex::Regex;

const STATS_FILE: &str = "stats.json";

/// Distinct `METHOD path` keys kept (paths with ids would grow without bound).
const MAX_REQUEST_KEYS: usize = 5000;

/// How often the statistics are saved when they change.
const SAVE_INTERVAL: std::time::Duration = std::time::Duration::from_secs(10);

#[derive(Clone, Default, Serialize, Deserialize, Debug)]
pub struct Stats {
    /// When the statistics started (or were last reset), RFC 3339.
    since: String,
    /// Requests by `METHOD path`.
    requests: BTreeMap<String, u64>,
    /// Executions by endpoint id.
    executions: BTreeMap<String, Execution>,
    /// Front-end files by path (`stats.json` files saved before this existed have none).
    #[serde(default)]
    web: BTreeMap<String, WebFile>,
}

#[derive(Clone, Default, Serialize, Deserialize, Debug)]
pub struct WebFile {
    count: u64,
    /// Requests for a file that doesn't exist (404).
    not_found: u64,
    bytes: u64,
}

#[derive(Clone, Default, Serialize, Deserialize, Debug)]
pub struct Execution {
    count: u64,
    /// Executions answered with a 4xx or 5xx status.
    errors: u64,
    total_ms: u64,
    max_ms: u64,
    /// Executions by status code.
    statuses: BTreeMap<u16, u64>,
}

static STATS: LazyLock<Mutex<Stats>> = LazyLock::new(|| Mutex::new(fresh()));
static DIRTY: AtomicBool = AtomicBool::new(false);

fn fresh() -> Stats {
    Stats {
        since: Utc::now().to_rfc3339(),
        ..Default::default()
    }
}

fn stats_file() -> Result<PathBuf> {
    Ok(get_workspace_root("config.json")
        .unwrap_or(current_dir()?)
        .join(STATS_FILE))
}

/// Loads the saved statistics and saves them periodically from now on.
pub async fn start() -> Result<()> {
    if let Ok(content) = read(stats_file()?).await {
        match serde_json::from_slice::<Stats>(&content) {
            Ok(saved) => *STATS.lock().unwrap() = saved,
            Err(err) => warn!("Ignoring `{}`: {}", STATS_FILE, err),
        }
    }

    tokio::spawn(async {
        loop {
            tokio::time::sleep(SAVE_INTERVAL).await;

            if DIRTY.swap(false, Ordering::Relaxed) {
                if let Err(err) = save().await {
                    warn!("Cannot save `{}`: {}", STATS_FILE, err);
                }
            }
        }
    });

    Ok(())
}

async fn save() -> Result<()> {
    let content = serde_json::to_string_pretty(&*STATS.lock().unwrap())?;
    write(stats_file()?, content).await?;
    Ok(())
}

/// Clears the statistics (and the saved file).
pub async fn reset() -> Result<()> {
    *STATS.lock().unwrap() = fresh();
    DIRTY.store(false, Ordering::Relaxed);
    save().await
}

pub fn record_request(method: &str, path: &str) {
    let key = format!("{} {}", method, path);
    let mut stats = STATS.lock().unwrap();

    if stats.requests.len() >= MAX_REQUEST_KEYS && !stats.requests.contains_key(&key) {
        *stats
            .requests
            .entry(format!("{} (other paths)", method))
            .or_default() += 1;
    } else {
        *stats.requests.entry(key).or_default() += 1;
    }

    DIRTY.store(true, Ordering::Relaxed);
}

/// Records a request for a front-end file; `bytes` is `None` when it doesn't exist.
pub fn record_web(path: &str, bytes: Option<usize>) {
    let mut stats = STATS.lock().unwrap();
    let key = if stats.web.len() >= MAX_REQUEST_KEYS && !stats.web.contains_key(path) {
        "(other paths)"
    } else {
        path
    };
    let file = stats.web.entry(key.to_string()).or_default();

    file.count += 1;

    match bytes {
        Some(bytes) => file.bytes += bytes as u64,
        None => file.not_found += 1,
    }

    DIRTY.store(true, Ordering::Relaxed);
}

/// Kind of front-end file, from its extension (`/` and folders are pages).
fn web_kind(path: &str) -> &'static str {
    let extension = path
        .rsplit('/')
        .next()
        .and_then(|name| name.rsplit_once('.'))
        .map(|(_, extension)| extension.to_ascii_lowercase());

    match extension.as_deref() {
        None | Some("html" | "htm") => "page",
        Some("css") => "style",
        Some("js" | "mjs") => "script",
        Some("png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" | "ico" | "avif") => "image",
        Some("woff" | "woff2" | "ttf" | "otf") => "font",
        Some("json") => "data",
        _ => "other",
    }
}

pub fn record_execution(endpoint_id: &str, status: u16, elapsed_ms: u64) {
    let mut stats = STATS.lock().unwrap();
    let execution = stats.executions.entry(endpoint_id.to_string()).or_default();

    execution.count += 1;
    execution.total_ms += elapsed_ms;
    execution.max_ms = execution.max_ms.max(elapsed_ms);
    *execution.statuses.entry(status).or_default() += 1;

    if status >= 400 {
        execution.errors += 1;
    }

    DIRTY.store(true, Ordering::Relaxed);
}

/// Statistics grouped for the panel: the project's API (endpoints on the project's database),
/// Silence's own API (`/api/internal`, the admin panel's traffic) and the front-end. Each API by
/// method, by endpoint (requests are matched to the endpoints' routes) and by status.
pub async fn report() -> serde_json::Value {
    let database = serde_json::to_value(AppCx::acquire().config().read().await.databases_conn())
        .ok()
        .and_then(|conn| conn["main"]["db"].as_str().map(str::to_owned))
        .unwrap_or_default();
    let api_prefix = RuntimeCx::acquire()
        .build()
        .read()
        .await
        .executor()
        .api_prefix()
        .trim_matches('/')
        .to_string();
    let stats = STATS.lock().unwrap().to_owned();

    // Route patterns of the loaded HTTP endpoints: `/api/{version}/{route}` with `{param}` as one
    // path segment.
    let patterns = {
        let build = RuntimeCx::acquire().build().read().await;

        build
            .endpoints()
            .inner()
            .iter()
            .filter_map(|endpoint| {
                let ExecutionTarget::Http(http_target) = endpoint.execution_target() else {
                    return None;
                };

                let path = ["", &api_prefix]
                    .into_iter()
                    .chain(http_target.version().as_deref())
                    .chain([http_target.route().as_str()])
                    .map(|part| part.trim_matches('/'))
                    .filter(|part| !part.is_empty())
                    .collect::<Vec<_>>()
                    .join("/");

                let pattern = format!(
                    "^/{}/?$",
                    regex::escape(&path)
                        .replace(r"\{", "{")
                        .replace(r"\}", "}")
                        .split('/')
                        .map(|segment| if segment.starts_with('{') {
                            "[^/]+"
                        } else {
                            segment
                        })
                        .collect::<Vec<_>>()
                        .join("/")
                );

                Some((
                    endpoint.id().to_string(),
                    http_target.method().to_string().to_uppercase(),
                    format!("/{}", path),
                    Regex::new(&pattern).ok()?,
                    is_measured(http_target),
                    http_target
                        .version()
                        .as_deref()
                        .unwrap_or_default()
                        .starts_with("internal"),
                ))
            })
            .collect::<Vec<_>>()
    };

    // Requests that match no loaded endpoint (removed ones) go to the API their path belongs to.
    let internal_prefix = format!("/{}/internal", api_prefix).replace("//", "/");

    let api = api_report(
        &stats,
        &patterns,
        |path| !path.starts_with(&internal_prefix),
        false,
    );
    let silence = api_report(
        &stats,
        &patterns,
        |path| path.starts_with(&internal_prefix),
        true,
    );

    let mut web_by_kind = BTreeMap::<&str, u64>::new();
    let mut web_files = stats
        .web
        .iter()
        .map(|(path, file)| {
            *web_by_kind.entry(web_kind(path)).or_default() += file.count;

            json!({
                "path": path,
                "kind": web_kind(path),
                "requests": file.count,
                "not_found": file.not_found,
                "bytes": file.bytes,
            })
        })
        .collect::<Vec<_>>();

    web_files.sort_by_key(|file| std::cmp::Reverse(file["requests"].as_u64()));

    let web = json!({
        "requests": stats.web.values().map(|file| file.count).sum::<u64>(),
        "pages": web_by_kind.get("page").copied().unwrap_or(0),
        "not_found": stats.web.values().map(|file| file.not_found).sum::<u64>(),
        "bytes": stats.web.values().map(|file| file.bytes).sum::<u64>(),
        "by_kind": web_by_kind,
        "files": web_files,
    });

    json!({
        "since": stats.since,
        "database": database,
        "api": api,
        "silence": silence,
        "web": web,
    })
}

/// `(id, METHOD, route, route regex, measured, internal)` of a loaded HTTP endpoint.
type RoutePattern = (String, String, String, Regex, bool, bool);

/// Whether the endpoint's executions are measured: only the SQL ones (`MySQLExecutorProxy`, also
/// inside the users and sessions proxies). The others (endpoints and tests managers, config...)
/// have requests but no executions.
fn is_measured(http_target: &HttpTarget) -> bool {
    use crate::internal_endpoints::mysql_proxy::*;

    http_target
        .execution_pipeline()
        .as_ref()
        .is_some_and(|atom| {
            let executor = atom.executor().to_owned().into_arc_any();

            executor.is::<MySQLExecutorProxy>()
                || executor.is::<MySQLUserProxy>()
                || executor.is::<MySQLSessionProxy>()
        })
}

/// Statistics of one of the APIs: the project's (`internal == false`) or Silence's.
fn api_report(
    stats: &Stats,
    patterns: &[RoutePattern],
    unmatched_belongs: impl Fn(&str) -> bool,
    internal: bool,
) -> serde_json::Value {
    let mut by_method = BTreeMap::<String, u64>::new();
    let mut requests_by_endpoint = BTreeMap::<String, u64>::new();
    let mut unmatched = BTreeMap::<String, u64>::new();
    let mut total = 0;

    for (key, count) in &stats.requests {
        let (method, path) = key.split_once(' ').unwrap_or((key, ""));

        match patterns.iter().find(|(_, endpoint_method, _, regex, ..)| {
            endpoint_method == method && regex.is_match(path)
        }) {
            Some((id, .., endpoint_internal)) if *endpoint_internal == internal => {
                *requests_by_endpoint.entry(id.to_owned()).or_default() += count
            }
            None if unmatched_belongs(path) => {
                *unmatched.entry(key.to_owned()).or_default() += count
            }
            _ => continue,
        }

        total += count;
        *by_method.entry(method.to_string()).or_default() += count;
    }

    // Executions of endpoints no longer loaded count in the project's API.
    let executions = stats
        .executions
        .iter()
        .filter(|(id, _)| {
            patterns
                .iter()
                .find(|(endpoint_id, ..)| endpoint_id == *id)
                .map_or(false, |(.., endpoint_internal)| *endpoint_internal)
                == internal
        })
        .collect::<BTreeMap<_, _>>();

    let mut by_status = BTreeMap::<u16, u64>::new();

    for execution in executions.values() {
        for (status, count) in &execution.statuses {
            *by_status.entry(*status).or_default() += count;
        }
    }

    let ids = requests_by_endpoint
        .keys()
        .chain(executions.keys().copied())
        .cloned()
        .collect::<std::collections::BTreeSet<_>>();

    let endpoints = ids
        .iter()
        .map(|id| {
            let execution = executions.get(id).copied().cloned().unwrap_or_default();
            // Endpoints no longer loaded are measured if they have executions.
            let (method, route, measured) = patterns
                .iter()
                .find(|(endpoint_id, ..)| endpoint_id == id)
                .map(|(_, method, route, _, measured, _)| {
                    (method.to_owned(), route.to_owned(), *measured)
                })
                .unwrap_or((String::new(), String::new(), true));
            let requests = requests_by_endpoint.get(id).copied().unwrap_or(0);

            if !measured {
                return json!({
                    "id": id,
                    "method": method,
                    "route": route,
                    "requests": requests,
                    "executions": null,
                    "rejected": null,
                    "errors": null,
                    "avg_ms": null,
                    "max_ms": null,
                });
            }

            json!({
                "id": id,
                "method": method,
                "route": route,
                "requests": requests,
                "executions": execution.count,
                // Requests that never ran (authentication, missing params...).
                "rejected": requests.saturating_sub(execution.count),
                "errors": execution.errors,
                "avg_ms": if execution.count > 0 { execution.total_ms as f64 / execution.count as f64 } else { 0.0 },
                "max_ms": execution.max_ms,
            })
        })
        .collect::<Vec<_>>();

    let count = executions
        .values()
        .map(|execution| execution.count)
        .sum::<u64>();
    let errors = executions
        .values()
        .map(|execution| execution.errors)
        .sum::<u64>();
    let total_ms = executions
        .values()
        .map(|execution| execution.total_ms)
        .sum::<u64>();

    json!({
        "requests": total,
        "executions": count,
        "errors": errors,
        "avg_ms": if count > 0 { total_ms as f64 / count as f64 } else { 0.0 },
        "by_method": by_method,
        "by_status": by_status,
        "endpoints": endpoints,
        "unmatched": unmatched,
    })
}

/// Counts the requests Waveless logs when they reach an endpoint
/// ("`GET` request at `/api/v1/departments` from `...`").
pub struct StatsLayer;

impl<S: tracing::Subscriber> tracing_subscriber::Layer<S> for StatsLayer {
    fn on_event(&self, event: &tracing::Event<'_>, _cx: tracing_subscriber::layer::Context<'_, S>) {
        if !event
            .metadata()
            .target()
            .ends_with("http_facade::execute_wrapper")
        {
            return;
        }

        struct Message(Option<String>);

        impl tracing::field::Visit for Message {
            fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn Debug) {
                if field.name() == "message" {
                    self.0 = Some(format!("{:?}", value));
                }
            }
        }

        let mut message = Message(None);
        event.record(&mut message);

        // "`GET` request at `/path` from `host`": the method and the path are the first two
        // backquoted values.
        if let Some(message) = message.0 {
            let mut quoted = message.split('`').skip(1).step_by(2);

            if let (Some(method), Some(path)) = (quoted.next(), quoted.next()) {
                record_request(method, path);
            }
        }
    }
}
