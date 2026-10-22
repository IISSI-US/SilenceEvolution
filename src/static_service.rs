// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

use crate::*;

/// TODO: add docs here.
#[derive(Clone, RustEmbed, Debug)]
#[folder = "./target/frontend"]
pub struct StaticService;

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

            // Setup API (databases configuration), served outside Waveless (see `setup.rs`).
            if route == "_setup" || route.starts_with("_setup/") {
                return Ok(setup::handle(request).await);
            }

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
                    // `/admin2` and `/auth2` serve the same panel, to compare it side by side with the
                    // new panel (branch `experimentos`) at the same URLs.
                    "admin" | "admin2" | "auth" | "auth2" | "internal_assets" => {
                        if let Some(file) = StaticService::get({
                            if route_part.starts_with("admin") {
                                "admin/index.html"
                            } else if route_part.starts_with("auth") {
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
                            } else if route.is_empty() {
                                // No `index.html` in the project yet: show the starting page that
                                // tells the student to build the front-end there.
                                response =
                                    response.header("Content-Type", "text/html; charset=utf-8");

                                Some(setup::WEB_INDEX.as_bytes().to_vec())
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
