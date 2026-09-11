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

        mysql_execute
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
