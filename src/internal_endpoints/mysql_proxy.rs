// Waveless
// Copyright (C) 2026 Oscar Alvarez Gonzalez

use crate::*;

use databases::*;

use http_executor::{request_cx::*, *};

use waveless_sql::http_executor::{mysql::*, *};

/// Proxies MySQL execute queries and injects internal params on runtime.
#[derive(
    Clone, PartialEq, Constructor, Serialize, Deserialize, BoxedAny, Getters, Display, Debug,
)]
#[display("SQL Proxy: {:?}", _0)]
#[getset(get = "pub")]
#[serde(transparent)]
pub struct MySQLExecutorProxy(MySQLExecutor);

impl Default for MySQLExecutorProxy {
    fn default() -> Self {
        Self(SQLQueryWrapper::new("SELECT * FROM example".into()).into())
    }
}

impl From<MySQLExecutor> for MySQLExecutorProxy {
    fn from(execute: MySQLExecutor) -> Self {
        Self(execute)
    }
}

impl AnyExt for MySQLExecutorProxy {
    fn name(&self) -> &str {
        "silence_mysql_proxy"
    }
}

#[typetag::serde(name = "MySQLProxy")]
#[async_trait]
impl AnyHttpExecutor for MySQLExecutorProxy {
    async fn execute(&self, cx: PipelineCx, db_conns: DbConns) -> PipelineResult {
        let MySQLExecutorProxy(mysql_execute) = self;

        let PipelineCx { mut request, .. } = cx;

        let endpoint_id = request.endpoint.id().to_string();
        let started = std::time::Instant::now();

        let RequestCx { request_params, .. } = &mut request;

        // Inject runtime parameters.
        let _config_guard = AppCx::acquire().config().read().await;

        request_params.insert(
            "users_target_table".to_compact_string(),
            ParamValue::Internal(
                _config_guard
                    .internal_params()
                    .users_target_table()
                    .to_owned(),
            ),
        );
        request_params.insert(
            "sessions_target_table".to_compact_string(),
            ParamValue::Internal(
                _config_guard
                    .internal_params()
                    .sessions_target_table()
                    .to_owned(),
            ),
        );
        request_params.insert(
            "roles_target_table".to_compact_string(),
            ParamValue::Internal(
                _config_guard
                    .internal_params()
                    .roles_target_table()
                    .to_owned(),
            ),
        );

        let result = mysql_execute
            .execute(
                PipelineCx {
                    request,
                    response: None,
                },
                db_conns,
            )
            .await;

        // Usage statistics (see `stats.rs`).
        let status = match &result {
            Ok((cx, _)) => cx
                .response
                .as_ref()
                .map(|response| response.status().as_u16())
                .unwrap_or(200),
            Err(RequestError::Expected(status, _)) => status.as_u16(),
            Err(RequestError::Other(_)) => 500,
        };

        stats::record_execution(&endpoint_id, status, started.elapsed().as_millis() as u64);

        result
    }
}

/// Proxy for the endpoints that create or modify users: the `password` param is hashed with
/// Argon2 (as the signup does) so that the user can log in. An empty password is dropped, which
/// keeps the current one when updating.
#[derive(
    Clone, PartialEq, Constructor, Serialize, Deserialize, BoxedAny, Getters, Display, Debug,
)]
#[display("SQL users proxy: {:?}", _0)]
#[getset(get = "pub")]
#[serde(transparent)]
pub struct MySQLUserProxy(MySQLExecutorProxy);

impl AnyExt for MySQLUserProxy {
    fn name(&self) -> &str {
        "silence_mysql_user_proxy"
    }
}

#[typetag::serde(name = "MySQLUserProxy")]
#[async_trait]
impl AnyHttpExecutor for MySQLUserProxy {
    async fn execute(&self, cx: PipelineCx, db_conns: DbConns) -> PipelineResult {
        let MySQLUserProxy(proxy) = self;

        let PipelineCx { mut request, .. } = cx;

        let RequestCx { request_params, .. } = &mut request;

        match request_params.get("password").cloned() {
            Some(ParamValue::Client(Some(password))) if !password.is_empty() => {
                let hasher = argon2::Argon2::new(
                    argon2::Algorithm::default(),
                    argon2::Version::default(),
                    argon2::Params::default(),
                );

                let hashed = argon2::PasswordHasher::hash_password(&hasher, password.as_bytes())
                    .map_err(|err| {
                        RequestError::Other(eyre!("Cannot hash the password. {}", err))
                    })?;

                request_params.insert(
                    "password".to_compact_string(),
                    ParamValue::Client(Some(hashed.to_string().to_compact_string())),
                );
            }
            Some(_) => {
                request_params.remove("password");
            }
            None => (),
        }

        proxy
            .execute(
                PipelineCx {
                    request,
                    response: None,
                },
                db_conns,
            )
            .await
    }
}

/// Proxy for the endpoint that opens a session for a user from the admin panel (to run tests as
/// that user): generates the token as Waveless does (32 alphanumeric characters) and injects it as
/// the internal param `new_token`.
#[derive(
    Clone, PartialEq, Constructor, Serialize, Deserialize, BoxedAny, Getters, Display, Debug,
)]
#[display("SQL session proxy: {:?}", _0)]
#[getset(get = "pub")]
#[serde(transparent)]
pub struct MySQLSessionProxy(MySQLExecutorProxy);

impl AnyExt for MySQLSessionProxy {
    fn name(&self) -> &str {
        "silence_mysql_session_proxy"
    }
}

#[typetag::serde(name = "MySQLSessionProxy")]
#[async_trait]
impl AnyHttpExecutor for MySQLSessionProxy {
    async fn execute(&self, cx: PipelineCx, db_conns: DbConns) -> PipelineResult {
        use rand::distr::{Alphanumeric, SampleString};

        let MySQLSessionProxy(proxy) = self;

        let PipelineCx { mut request, .. } = cx;

        let RequestCx { request_params, .. } = &mut request;

        let token = Alphanumeric.sample_string(&mut rand::rng(), 32);

        request_params.insert(
            "new_token".to_compact_string(),
            ParamValue::Internal(token.to_compact_string()),
        );

        proxy
            .execute(
                PipelineCx {
                    request,
                    response: None,
                },
                db_conns,
            )
            .await
    }
}
