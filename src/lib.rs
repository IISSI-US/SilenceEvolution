// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

pub mod app_cx;
pub mod config;
pub mod endpoint_test;
pub mod internal_endpoints;
pub mod new;
pub mod simple_endpoint;
pub mod static_service;

pub use app_cx::*;
pub use endpoint_test::*;
pub use internal_endpoints::*;
pub use new::*;
pub use simple_endpoint::*;
pub use static_service::*;

use std::collections::HashMap;
use std::convert::Infallible;
use std::env::current_dir;
use std::fmt::Debug;
use std::io::Write;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock};
use std::task::Poll;

use waveless_commons::{endpoint::*, *};
use waveless_runtime::*;

use boxed_any::*;
use boxed_any_derive::*;
use rustyrosetta::*;

use async_trait::*;
use bytes::Bytes as ConnBytes;
use chrono::Utc;
use compact_str::*;
use derive_builder::*;
use derive_more::Constructor;
use derive_more::Display;
use eyre::{Context, Result, bail, eyre};
use futures::{SinkExt, future::BoxFuture, stream::StreamExt};
use getset::*;
use http_body_util::{BodyExt, Full, combinators::BoxBody};
use hyper::Request;
use hyper::{Response, StatusCode};
use hyper_tungstenite::*;
use rust_embed_for_web::*;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::json;
use struct_patch::*;
use tokio::{
    fs::{create_dir, create_dir_all, read, read_dir, try_exists, write},
    sync::{OnceCell, RwLock, RwLockReadGuard},
};
use tower::Service;
use tracing::*;
use tracing_subscriber::*;
use tungstenite::Message;

pub static APP_CX: OnceCell<AppCx> = OnceCell::const_new();
