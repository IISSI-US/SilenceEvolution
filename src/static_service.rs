// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

use crate::*;

/// TODO: add docs here.
#[derive(Clone, RustEmbed, Debug)]
#[folder = "./target/frontend"]
pub struct StaticService;

/// The new admin panel, served at `/admin2`, `/auth2` and `/_silence/*`. Debug builds read
/// `panel/` from disk; release builds embed the minified copy made by `build.rs`.
#[cfg(debug_assertions)]
#[derive(Clone, RustEmbed, Debug)]
#[folder = "./panel"]
pub struct PanelFiles;

#[cfg(not(debug_assertions))]
#[derive(Clone, RustEmbed, Debug)]
#[folder = "./target/panel_dist"]
pub struct PanelFiles;

/// The admin panel's styles, compiled from `panel/styles` by `build.rs`.
#[derive(Clone, RustEmbed, Debug)]
#[folder = "./target/panel_styles"]
pub struct PanelStyles;

/// Returns the content and mime type of a panel's file given its route.
fn get_panel_file(route: &str) -> Option<(Vec<u8>, String)> {
    if route.contains("..") {
        return None;
    }

    let (route_part, path) = route.split_once('/').unwrap_or((route, ""));

    let file = match route_part {
        "admin2" => PanelFiles::get("admin.html"),
        "auth2" => PanelFiles::get("auth.html"),
        _ if path == "panel.css" => PanelStyles::get("panel.css"),
        _ if path.ends_with(".scss") => None,
        _ => PanelFiles::get(path),
    }?;

    Some((
        file.data().to_vec(),
        file.mime_type()
            .map(|mime_type| mime_type.to_string())
            .unwrap_or("application/octet-stream".to_string()),
    ))
}

impl Service<Request<ConnBody>> for StaticService {
    type Response = Response<ConnBody>;

    type Error = Infallible;

    type Future = BoxFuture<'static, Result<Self::Response, Self::Error>>;

    fn poll_ready(
        &mut self,
        _cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::result::Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, request: Request<BoxBody<ConnBytes, eyre::Error>>) -> Self::Future {
        Box::pin(async move {
            let route = request.uri().path().trim_matches('/').to_owned();

            let mut response = Response::builder().header(
                "Cache-Control",
                format!(
                    "max-age={}",
                    (*RuntimeCx::acquire()
                        .build()
                        .read()
                        .await
                        .executor()
                        .http_cache_time()) as u32
                ),
            );

            let body = match route.split('/').next() {
                Some(route_part) => match route_part {
                    "admin2" | "auth2" | "_silence" => match get_panel_file(&route) {
                        Some((content, mime_type)) => {
                            response = response.header("Content-Type", mime_type);
                            Some(content)
                        }
                        None => {
                            response =
                                response.header("Content-Type", "application/json; charset=utf-8");
                            None
                        }
                    },
                    "admin" | "auth" | "internal_assets" => {
                        if let Some(file) = StaticService::get({
                            if route_part == "admin" {
                                "admin/index.html"
                            } else if route_part == "auth" {
                                "auth/index.html"
                            } else {
                                &route
                            }
                        }) {
                            response = response.header("Content-Type", file.mime_type().unwrap());

                            let content = file.data();

                            Some(content.to_vec()) // it requires `.to_vec()` at release.
                        } else {
                            response =
                                response.header("Content-Type", "application/json; charset=utf-8");
                            None
                        }
                    }
                    _ => {
                        // Get static file from Silence's project folder.
                        if *AppCx::acquire().config().read().await.serve_static_files() {
                            let workspace_root =
                                get_workspace_root("config.json").unwrap_or(current_dir().unwrap());

                            let mut static_path = workspace_root.join("static");

                            if let Ok(false) = try_exists(static_path.to_owned()).await {
                                static_path = workspace_root.join("web"); // for academic purposes we will use the directory `web` as a fallback.
                            }

                            assert!(!route.contains("..")); // listing directories outside `static` is explicitly forbidden.

                            // If the route is empty default to the `index.html` file.
                            if route.trim_start_matches('/').is_empty() {
                                static_path.push("index.html");
                            } else {
                                static_path.push(&route);
                            }

                            if let Ok(content) = read(static_path.to_owned()).await {
                                response = response.header(
                                    "Content-Type",
                                    mime_guess::from_path(static_path)
                                        .first_raw()
                                        .unwrap_or("text/plain"),
                                );

                                Some(content)
                            } else {
                                None
                            }
                        } else {
                            warn!(
                                "Trying to get a static file from Silence's project but `serve_static_files` is disabled."
                            );
                            info!("HINT: maybe you meant to set `serve_static_files`?");
                            None
                        }
                    }
                },
                None => unreachable!(),
            };

            if let Some(body) = body {
                Ok(response
                    .status(200)
                    .body(
                        Full::new(ConnBytes::from_iter(body))
                            .map_err(|_| unreachable!())
                            .boxed(),
                    )
                    .unwrap())
            } else {
                Ok(response
                    .status(404)
                    .body(json_conn_body(&json!({
                        "error": "Resource not found."
                    })))
                    .unwrap())
            }
        })
    }
}
