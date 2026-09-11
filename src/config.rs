// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

use crate::*;

use object::*;
use project::*;

use waveless_sql::auth::mysql::*;
use waveless_sql::databases::mysql::*;

/// Silence's project config.
#[derive(
    Clone, PartialEq, Constructor, Serialize, Deserialize, Getters, MutGetters, Patch, Debug,
)]
#[patch(attribute(derive(Clone, PartialEq, Constructor, Builder, Serialize, Deserialize, Debug)))]
#[getset(get = "pub", get_mut = "pub")]
pub struct Config {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    listening_addr: Option<SocketAddr>,

    /// Whether to serve static files in the project's `./static` folder.
    serve_static_files: bool,

    /// Defines the internal parameters.
    internal_params: InternalParams,

    /// Skips the endpoint discovery from these tables.
    #[serde(default, skip_serializing_if = "CheapVec::is_empty")]
    skip_discovery_tables: CheapVec<CompactString>,

    /// Skips discovering endpoints with these ids.
    #[serde(default, skip_serializing_if = "CheapVec::is_empty")]
    skip_endpoints_ids: CheapVec<CompactString>,

    /// Defines MySQL connection config.
    databases_conn: DatabasesConnectionConfig,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            listening_addr: Some(SocketAddr::new("127.0.0.1".parse().unwrap(), 8080)),
            serve_static_files: true,
            internal_params: Default::default(),
            skip_discovery_tables: CheapVec::new(),
            skip_endpoints_ids: CheapVec::new(),
            databases_conn: DatabasesConnectionConfig::default(),
        }
    }
}

/// Defines the parameters that will be used internally to manage authentication and other routines.
#[derive(Clone, PartialEq, Constructor, Serialize, Deserialize, Getters, Patch, Debug)]
#[patch(attribute(derive(Clone, PartialEq, Constructor, Builder, Serialize, Deserialize, Debug)))]
#[getset(get = "pub")]
pub struct InternalParams {
    users_target_table: CompactString,
    sessions_target_table: CompactString,
    roles_target_table: CompactString,
}

impl Default for InternalParams {
    fn default() -> Self {
        Self {
            users_target_table: "silence_users".to_compact_string(),
            sessions_target_table: "silence_sessions".to_compact_string(),
            roles_target_table: "silence_roles".to_compact_string(),
        }
    }
}

/// TODO: add docs here.
#[derive(
    Clone, PartialEq, Constructor, Serialize, Deserialize, Getters, MutGetters, Patch, Debug,
)]
#[patch(attribute(derive(Clone, PartialEq, Constructor, Builder, Serialize, Deserialize, Debug)))]
#[getset(get = "pub", get_mut = "pub")]
pub struct DatabasesConnectionConfig {
    main: MySQLDbConnectionConfig,
    internal: Option<MySQLDbConnectionConfig>,
}

impl Default for DatabasesConnectionConfig {
    fn default() -> Self {
        Self {
            main: MySQLDbConnectionConfig::new(
                SocketAddr::new("127.0.0.1".parse().unwrap(), 3306),
                "iissi_user".to_compact_string(),
                "iissi$user".to_compact_string(),
                "example_db".to_compact_string(),
            ),
            internal: Some(MySQLDbConnectionConfig::new(
                SocketAddr::new("127.0.0.1".parse().unwrap(), 3306),
                "iissi_user".to_compact_string(),
                "iissi$user".to_compact_string(),
                "silence".to_compact_string(),
            )),
        }
    }
}

impl Config {
    pub fn into_database_config(&self) -> CheapVec<DatabaseConfig> {
        let mut database_configs = CheapVec::new();

        let mut skip_tables = self.skip_discovery_tables().to_owned();
        skip_tables.append(&mut CheapVec::<CompactString>::from_vec(vec![
            self.internal_params.users_target_table.to_owned(),
            self.internal_params.sessions_target_table.to_owned(),
            self.internal_params.roles_target_table.to_owned(),
        ]));

        database_configs.push(DatabaseConfig::new(
            "main".to_compact_string(),
            true,
            Arc::new(self.databases_conn.main().to_owned()),
            None,
            None,
        ));

        database_configs.push(DatabaseConfig::new(
            "internal".to_compact_string(),
            false,
            Arc::new(match self.databases_conn().internal() {
                Some(internal_db_config) => internal_db_config.to_owned(),
                None => self.databases_conn().main().to_owned(),
            }),
            None,
            None,
        ));

        database_configs
    }

    pub fn into_build(self, endpoints: Endpoints) -> ObjectArtifact {
        ObjectArtifact::new(
            project::Config::new(
                "Silence App".into(),
                self.into_database_config(),
                Some(Authentication::new(
                    CheapVec::from_vec(vec![Arc::new(MySQLSimpleAuthentication::new(
                        Some("internal".into()),
                        self.internal_params.users_target_table.to_owned(),
                        "user_id".into(),
                        "email".into(),
                        "password".into(),
                        CheapVec::from_vec(vec!["name".into()]),
                        None,
                    ))]),
                    Arc::new(MySQLToken::new(
                        Some("internal".into()),
                        self.internal_params.sessions_target_table.to_owned(),
                        "token_id".into(),
                        "user_id".into(),
                        "created_at".into(),
                        3600,
                    )),
                    Some(Arc::new(MySQLRole::new(
                        Some("internal".into()),
                        self.internal_params.roles_target_table.to_owned(),
                        "user_id".into(),
                        "role".into(),
                    ))),
                    None,
                    true,
                    true,
                )),
                Admin::new(
                    false,
                    CheapVec::from_vec(vec!["admin".to_compact_string()]),
                    false,
                ),
            ),
            Executor::new(
                *self.listening_addr(),
                None,
                "/api".to_compact_string(),
                false,
                0,
            ),
            endpoints,
            CheapVec::new(),
        )
    }
}
