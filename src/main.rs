// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

use silence::*;

use silence::internal_endpoints::{console::*, mysql_proxy::*};

use waveless_commons::{databases::*, endpoint::*, *};
use waveless_runtime::*;

use waveless_sql::databases::mysql::*;
use waveless_sql::http_executor::mysql::*;

use logging::*;
use runtime::handle_main;

use server::serve;

use std::net::SocketAddr;

use rustyrosetta::*;

use clap::{Parser, Subcommand};
use color_eyre::Section;
use compact_str::*;
use eyre::{Result, eyre};
use iocraft::prelude::*;
use mimalloc::MiMalloc;
use nestify::*;
use tower::util::BoxCloneService;
use tracing_subscriber::{filter::LevelFilter, *};

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

nest! {
    #[derive(Parser)]
    #[command(
        name = "silence",
        version,
        about = "An educational framework for deploying APIs based on a MySQL schema and web applications.",
        propagate_version = true,
        subcommand_required = true,
        arg_required_else_help = true,
    )]
    struct SilenceCLI {
        /// Whether to enable debug mode.
        #[arg(short = 'D', long = "debug", default_value_t = false)]
        debug: bool,

        #[command(subcommand)]
        subcommand: Option<
            #[derive(Subcommand)]
            enum Subcommands {
                /// Starts the server.
                Run  {
                    /// Whether to show all the loaded endpoints on start.
                    #[arg(
                        short = 'd',
                        long = "display_endpoints",
                        default_value_t = false,
                        help = "Whether to show all the loaded endpoints on start."
                    )]
                    display_endpoints_on_start: bool,

                    /// Server listening address.
                    #[arg(short = 'l', long = "listen", help = "Server listening address.")]
                    addr: Option<SocketAddr>,
                },

                /// Creates a new Silence project.
                #[command(about = "Creates a new Silence project.")]
                New {
                    #[arg(help = "Project's name")]
                    name: CompactString,

                    #[arg(long = "db_host", help = "Database's address.")]
                    db_host: Option<SocketAddr>,

                    #[arg(short = 'n', long = "db_name", help = "Database's name.")]
                    db_name: Option<CompactString>,

                    #[arg(long = "internal_db_name", help = "Internal database's name.")]
                    internal_db_name: Option<CompactString>,

                    #[arg(short = 'u', long = "db_user", help = "Database's user.")]
                    db_user: Option<CompactString>,

                    #[arg(short = 'p', long = "db_password", help = "Database's password.")]
                    db_password: Option<CompactString>,

                    #[arg(long = "skip_internal_db", default_value_t = false)]
                    skip_internal_db: bool,

                    #[arg(long = "prefer_web_directory", default_value_t = true)]
                    prefer_web_directory: bool,
                },

                #[command(about = "Runs Silence's migrations.")]
                Migrations
            }
        >
    }
}

fn main() -> Result<()> {
    handle_main(try_main)
}

async fn try_main() -> Result<ResultContext> {
    let cli = SilenceCLI::parse();

    // Setup logging.
    let console = fmt::layer()
        .with_writer(ConsoleTracingWriter::new().await)
        .with_target(true)
        .with_filter(if cli.debug {
            LevelFilter::DEBUG
        } else {
            LevelFilter::INFO
        });

    subscribe_logging(
        cli.debug,
        // CheapVec::from_iter([ConsoleTracingLayer.boxed()]),
        CheapVec::from_iter([console.boxed()]),
    )?;

    match cli.subcommand {
        Some(Subcommands::Run {
            display_endpoints_on_start,
            addr,
        }) => {
            // Loads Silence's app's context.
            let app_cx = AppCx::from_workspace().await?;

            match app_cx {
                Some(_app_cx) => {
                    // Create internal database if necessary.
                    let internal_db_name =
                        match _app_cx.config().read().await.databases_conn().internal() {
                            Some(db_conns_config) => Some(db_conns_config.db().to_owned()),
                            None => None,
                        };

                    if let Some(internal_db_name) = &internal_db_name {
                        let config = _app_cx.config().read().await;

                        create_internal_db(
                            config.databases_conn().main(),
                            Some(internal_db_name.to_owned()),
                        )
                        .await?;
                    }

                    // Load the Silence's app's database into the databases manager (`waveless_commons::databases::DatabasesConnections`).
                    DatabasesManager::load(_app_cx.config().read().await.into_database_config())
                        .await?;

                    // Run database migrations.
                    run_migrations(internal_db_name).await?;

                    // Set App's CX globally.
                    _app_cx.set_global_cx().await?;

                    if display_endpoints_on_start {
                        let runtime_build = RuntimeCx::acquire().build().read().await;

                        let mut endpoints = runtime_build.endpoints().inner().to_owned();

                        // The Waveless' internal endpoints are added here temporarily to allow them to be shown in the table, as they are only injected when building the router.
                        endpoints.append(&mut CheapVec::<endpoint::Endpoint>::from_vec(
                            INTERNAL_ENDPOINTS
                                .iter()
                                .map(|(_, endpoint)| endpoint)
                                .cloned()
                                .collect(),
                        ));

                        macro_rules! print_bool {
                            ($cond: expr) => {
                                if $cond {
                                    element! {
                                        Text(content: "Yes", color: Color::Green)
                                    }
                                } else {
                                    element! {
                                        Text(content: "No", color: Color::Red)
                                    }
                                }
                            };
                        }

                        element! {
                            View(
                                margin_top: 1,
                                margin_bottom: 1,
                                width: terminal_size::terminal_size().ok_or(eyre!("Cannot get the terminal size."))?.0.0,
                                flex_direction: FlexDirection::Column,
                                border_style: BorderStyle::Round,
                                border_color: Color::DarkBlue,
                            ) {
                                View(border_style: BorderStyle::Single, border_edges: Edges::Bottom, border_color: Color::Grey) {
                                    View(width: 200pct, justify_content: JustifyContent::End, padding_right: 2) {
                                        Text(content: "Id", weight: Weight::Bold, decoration: TextDecoration::Underline)
                                    }
                                    #(
                                        {
                                            const COLUMNS: &[&str] = &["Method", "Route", "Query", "Requires auth", "Injects auth metadata", "Allowed Roles", "Auto Generated"];

                                            COLUMNS.iter().map(|column| element! {
                                                View(width: 250pct) {
                                                    Text(content: *column, weight: Weight::Bold, decoration: TextDecoration::Underline)
                                                }
                                            })
                                        }
                                    )
                                }

                                #(endpoints.iter().enumerate().map(|(i, endpoint)| element! {
                                    View(background_color: if i % 2 == 0 { None } else { Some(Color::Rgb { r: 20, g: 20, b: 20 }) }) {
                                        View(width: 200pct, justify_content: JustifyContent::End, padding_right: 2) {
                                            Text(content: endpoint.id().to_string(), color: Color::Green, weight: Weight::Bold)
                                        }
                                        View(width: 250pct) {
                                            #(
                                                match endpoint.execution_target() {
                                                    ExecutionTarget::Http(http_target) => element! {
                                                        Text(content: http_target.method().to_string())
                                                    },
                                                    _ => element! {
                                                        Text(content: "—")
                                                    },
                                                }
                                            )
                                        }
                                        View(width: 250pct) {
                                            #(
                                                match endpoint.execution_target() {
                                                    ExecutionTarget::Http(http_target) => element! {
                                                        Text(content: format!("api/{}{}", http_target.version().to_owned().map(|path| format!("{}/", path.trim_matches('/'))).unwrap_or_default(), http_target.route().to_string().trim_matches('/')))
                                                    },
                                                    _ => element! {
                                                        Text(content: "—")
                                                    },
                                                }
                                            )
                                        }
                                        View(width: 250pct) {
                                            #(
                                                match endpoint.execution_target() {
                                                    ExecutionTarget::Http(http_target) => {
                                                        match (
                                                            http_target
                                                                .execution_pipeline()
                                                                .to_owned()
                                                                .map(|execute| execute.executor().to_owned().into_arc_any().downcast::<MySQLExecutor>().ok())
                                                                .flatten(),
                                                            http_target
                                                                .execution_pipeline()
                                                                .to_owned()
                                                                .map(|execute| execute.executor().to_owned().into_arc_any().downcast::<MySQLExecutorProxy>().ok())
                                                                .flatten()
                                                        ) {
                                                            (Some(execute), None) => element! {
                                                                View {
                                                                    Text(content: format!("{:?}", execute))
                                                                }
                                                            },
                                                            (None, Some(execute)) => element! {
                                                                View(flex_direction: FlexDirection::Column) {
                                                                    Text(content: format!("{:?}", execute))
                                                                    Text(content: "(runtime parameters injected)", color: Color::DarkRed)
                                                                }
                                                            },
                                                            _ => element! {
                                                                View {
                                                                        Text(content: "Internal", color: Color::Blue)
                                                                }
                                                            },
                                                        }
                                                    },
                                                    _ => element! {
                                                        View {
                                                            Text(content: "Socket", color: Color::Blue)
                                                        }
                                                    },
                                                }
                                            )
                                        }
                                        View(width: 250pct) {
                                            #(print_bool!(match *endpoint.auth().level() {
                                                AuthLevel::Required => true,
                                                _ => false
                                            }))
                                        }
                                        View(width: 250pct) {
                                            #(print_bool!(match *endpoint.auth().level() {
                                                AuthLevel::Required => true,
                                                AuthLevel::InjectWhenAvailable => true,
                                                _ => false
                                            }))
                                        }
                                        View(width: 250pct) {
                                            Text(content: if !endpoint.auth().allowed_roles().is_empty() {
                                                endpoint.auth().allowed_roles().iter().map(|role| role.to_string()).collect::<Vec<_>>().join(", ")
                                            } else {
                                                "Any".to_string()
                                            }, color: if !endpoint.auth().allowed_roles().is_empty() {
                                                Color::Green
                                            } else {
                                                Color::Red
                                            })
                                        }
                                        View(width: 250pct) {
                                            #(match endpoint.execution_target() {
                                                ExecutionTarget::Http(http_target) => print_bool!(*http_target.auto_generated()),
                                                _ => element! {
                                                    Text(content: "—")
                                                },
                                            })
                                        }
                                    }
                                }))
                            }
                        }.print();
                    }

                    let runtime_executor = RuntimeCx::acquire()
                        .build()
                        .read()
                        .await
                        .executor()
                        .to_owned();

                    let format_link = |mut link: String| -> String {
                        if !link.starts_with("http") {
                            link.insert_str(0, "http://");
                        }

                        format!("\u{1b}]8;;{}\u{1b}\\{}\u{1b}]8;;\u{1b}\\", link, link)
                    };

                    element! {
                        View(
                            padding_left: 1,
                            padding_right: 1,
                            border_style: BorderStyle::None,
                        ) {
                            MixedText(align: TextAlign::Left, contents: vec![
                                MixedTextContent::new("⚡️ "),
                                MixedTextContent::new(format!("Silence server running at {}", format_link(runtime_executor.listening_addr().unwrap().to_string()))).color(iocraft::Color::White).weight(Weight::Bold),
                                MixedTextContent::new(format!("\nYou can access the admin panel from {}", format_link([runtime_executor.listening_addr().unwrap().to_string(), "/admin".to_string()].join("")))).color(iocraft::Color::Green),
                            ])
                        }
                    }
                    .print();

                    serve(
                        match runtime_executor.listening_addr() {
                            Some(addr) => Some(addr.to_owned()),
                            None => addr,
                        },
                        None,
                        Some(BoxCloneService::new(StaticService)),
                    )
                    .await?;
                }
                None => {
                    return Err(eyre!(
                        "We couldn't find a Silence project in the current working directory."
                    )
                    .suggestion("Create a new Silence project with the `new` subcommand."));
                }
            }

            Ok("".into())
        }

        Some(Subcommands::New {
            name,
            db_host,
            db_name,
            internal_db_name,
            db_user,
            db_password,
            skip_internal_db,
            prefer_web_directory,
        }) => {
            // Create internal database if necessary.
            if !skip_internal_db {
                if let (Some(db_name), Some(db_user), Some(db_password)) = (
                    db_name.to_owned(),
                    db_user.to_owned(),
                    db_password.to_owned(),
                ) {
                    let db_conn_config = MySQLDbConnectionConfig::new(
                        db_host.unwrap_or(SocketAddr::new("127.0.0.1".parse().unwrap(), 3306)),
                        db_user,
                        db_password,
                        db_name,
                    );

                    create_internal_db(&db_conn_config, internal_db_name.to_owned()).await?;
                }
            }

            new_project(
                name,
                db_host,
                db_name,
                internal_db_name,
                db_user,
                db_password,
                skip_internal_db,
                prefer_web_directory,
            )
            .await
        }

        Some(Subcommands::Migrations) => {
            // Loads Silence's app's context.
            let Some(app_cx) = AppCx::from_workspace().await? else {
                return Err(eyre!(
                    "We couldn't find a Silence project in the current working directory."
                )
                .suggestion("Create a new Silence project with the `new` subcommand."));
            };

            // Create internal database if necessary.
            let internal_db_name = match app_cx.config().read().await.databases_conn().internal() {
                Some(db_conns_config) => Some(db_conns_config.db().to_owned()),
                None => None,
            };

            if let Some(internal_db_name) = &internal_db_name {
                let config = app_cx.config().read().await;

                create_internal_db(
                    config.databases_conn().main(),
                    Some(internal_db_name.to_owned()),
                )
                .await?;
            }

            DatabasesManager::load(app_cx.config().read().await.into_database_config()).await?;

            run_migrations(
                match app_cx.config().read().await.databases_conn().internal() {
                    Some(db_conns_config) => Some(db_conns_config.db().to_owned()),
                    None => None,
                },
            )
            .await?;

            Ok("Migrations ran successfully.".into())
        }

        _ => unreachable!(),
    }
}
