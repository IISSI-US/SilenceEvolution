// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

use crate::*;

use mysql_proxy::*;

use http_executor::*;

use waveless_sql::http_executor::{mysql::*, *};

/// Silence's endpoint.
/// TODO: add documentation.
#[derive(
    Clone,
    PartialEq,
    Constructor,
    Builder,
    Serialize,
    Deserialize,
    Getters,
    MutGetters,
    Patch,
    Debug,
)]
#[patch(attribute(derive(Clone, PartialEq, Constructor, Builder, Serialize, Deserialize, Debug)))]
#[builder(default, pattern = "mutable", setter(strip_option))]
#[getset(get = "pub", get_mut = "pub")]
pub struct SimpleEndpoint {
    id: CompactString,

    #[serde(default, skip_serializing_if = "should_skip_option")]
    #[patch(skip_wrap)]
    database: Option<DatabaseId>,

    route: CompactString,

    #[serde(default, skip_serializing_if = "should_skip_option")]
    #[patch(skip_wrap)]
    version: Option<CompactString>,

    method: HttpMethod,

    #[serde(default, skip_serializing_if = "should_skip_cheapvec")]
    query_params: CheapVec<CompactString, 0>,

    #[serde(default, skip_serializing_if = "should_skip_cheapvec")]
    body_params: CheapVec<CompactString, 0>,

    #[patch(skip_wrap)]
    execute: Option<MySQLExecutorProxy>,

    #[serde(default, skip_serializing_if = "should_skip_option")]
    #[patch(skip_wrap)]
    description: Option<CompactString>,

    #[serde(default, skip_serializing_if = "not_skip")]
    require_auth: bool,

    #[serde(default, skip_serializing_if = "not_skip")]
    inject_auth_metadata: bool,

    #[serde(default, skip_serializing_if = "should_skip_cheapvec")]
    allowed_roles: CheapVec<CompactString, 0>,

    #[serde(default, skip_serializing_if = "auto_generated_skip")]
    auto_generated: bool,
}

fn not_skip(value: &bool) -> bool {
    should_skip(&(!*value))
}

fn auto_generated_skip(value: &bool) -> bool {
    not_skip(value)
}

impl Default for SimpleEndpoint {
    fn default() -> Self {
        Self {
            id: "Example".to_compact_string(),
            database: None,
            route: "my_endpoint".to_compact_string(),
            version: Some("v1".to_compact_string()),
            method: HttpMethod::Get,
            query_params: CheapVec::new(),
            body_params: CheapVec::new(),
            execute: Some(MySQLExecutorProxy::new(
                SQLQueryWrapper::new("SELECT * FROM example".into()).into(),
            )),
            description: None,
            require_auth: false,
            inject_auth_metadata: false,
            allowed_roles: CheapVec::new(),
            auto_generated: false,
        }
    }
}

impl TryFrom<Endpoint> for SimpleEndpoint {
    type Error = eyre::Error;

    fn try_from(endpoint: Endpoint) -> Result<Self> {
        SimpleEndpoint::try_from(&endpoint)
    }
}

impl<'a> TryFrom<&'a Endpoint> for SimpleEndpoint {
    type Error = eyre::Error;

    fn try_from(endpoint: &'a Endpoint) -> Result<Self> {
        let http_target = match endpoint.execution_target() {
            ExecutionTarget::Http(http_target) => Some(http_target),
            ExecutionTarget::Socket(_) => None,
        };

        let execute = 'outer: {
            if let Some(http_target) = http_target.to_owned() {
                let Some(execution_step) = http_target.execution_pipeline() else {
                    break 'outer None;
                };

                let executor = execution_step.executor();

                match (
                    executor
                        .to_owned()
                        .into_arc_any()
                        .downcast::<MySQLExecutor>()
                        .map(|execute| (*execute).to_owned())
                        .ok(),
                    executor
                        .to_owned()
                        .into_arc_any()
                        .downcast::<MySQLExecutorProxy>()
                        .map(|execute| (*execute).to_owned())
                        .ok(),
                ) {
                    (Some(execute), _) => Some(MySQLExecutorProxy::new(execute)),
                    (_, Some(execute)) => Some(execute),
                    _ => None,
                }
            } else {
                None
            }
        };

        Ok(SimpleEndpoint {
            id: endpoint.id().to_owned(),
            database: endpoint.databases().first().cloned(),
            route: http_target
                .map(|http_target| http_target.route().to_owned())
                .unwrap_or("websockets".into()),
            version: http_target
                .map(|http_target| http_target.version().to_owned())
                .unwrap_or(Some("upgrade".into())),
            description: endpoint.description().to_owned(),
            method: http_target
                .map(|http_target| http_target.method().to_owned())
                .unwrap_or(HttpMethod::Get),
            query_params: http_target
                .map(|http_target| http_target.query_params().to_owned())
                .unwrap_or_default(),
            body_params: http_target
                .map(|http_target| http_target.body_params().to_owned())
                .unwrap_or_default(),
            execute,
            require_auth: match *endpoint.auth().level() {
                AuthLevel::Required => true,
                _ => false,
            },
            allowed_roles: endpoint.auth().allowed_roles().to_owned(),
            inject_auth_metadata: match *endpoint.auth().level() {
                AuthLevel::InjectWhenAvailable => true,
                _ => false,
            },
            auto_generated: http_target
                .map(|http_target| *http_target.auto_generated())
                .unwrap_or_default(),
        })
    }
}

impl Into<Endpoint> for SimpleEndpoint {
    fn into(self) -> Endpoint {
        (&self).into()
    }
}

impl<'a> Into<Endpoint> for &'a SimpleEndpoint {
    fn into(self) -> Endpoint {
        let mut endpoint_builder = &mut EndpointBuilder::default();

        let mut http_target_builder = &mut HttpTargetBuilder::default();

        endpoint_builder = endpoint_builder.id(self.id.to_owned()).auth(
            AuthBuilder::default()
                .level(match (self.require_auth(), self.inject_auth_metadata()) {
                    (true, _) => AuthLevel::Required,
                    (false, true) => AuthLevel::InjectWhenAvailable,
                    _ => AuthLevel::None,
                })
                .allowed_roles(self.allowed_roles.to_owned())
                .build()
                .unwrap(),
        );

        if let Some(description) = self.description.to_owned() {
            endpoint_builder = endpoint_builder.description(description);
        };

        http_target_builder
            .route(self.route.to_owned())
            .method(self.method.to_owned())
            .query_params(self.query_params.to_owned())
            .body_params(self.body_params.to_owned());

        if let Some(version) = self.version.to_owned() {
            http_target_builder = http_target_builder.version(version);
        };

        if let Some(execute) = self.execute.to_owned() {
            http_target_builder = http_target_builder.execution_pipeline(ExecutionStep::new(
                None,
                Arc::new(execute),
                Default::default(),
            ));
        }

        endpoint_builder
            .execution_target(ExecutionTarget::Http(http_target_builder.build().unwrap()));

        endpoint_builder.build().unwrap()
    }
}
