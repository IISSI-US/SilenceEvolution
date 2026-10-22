// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

use crate::*;

use databases::*;
use http_executor::{request_cx::*, *};

use argon2::*;

/// Mitigation executor to capture the incoming password field and hash it when creating or modifying a user.
/// TODO: implement user modification routines on `waveless_sql`.
#[derive(Clone, Serialize, Deserialize, BoxedAny, Getters, Display, Debug)]
#[display("Config manager.")]
pub struct PasswordHasherStep;

impl AnyExt for PasswordHasherStep {
    fn name(&self) -> &str {
        "silence_password_hasher"
    }
}

/// TODO: add docs here.
#[typetag::serde(name = "EndpointManager")]
#[async_trait]
impl AnyHttpExecutor for PasswordHasherStep {
    async fn execute(&self, cx: PipelineCx, _db_conns: DbConns) -> PipelineResult {
        let PipelineCx {
            mut request,
            response,
        } = cx;

        let RequestCx { request_params, .. } = &mut request;

        let response = response.unwrap_or_default();

        if let Some(ParamValue::Client(Some(password))) = request_params.get_mut("password") {
            let hasher = Argon2::new(Algorithm::default(), Version::default(), Params::default());

            let hashed_password = hasher
                .hash_password(password.as_bytes())
                .map_err(|err| RequestError::Other(eyre!(err).wrap_err("Cannot hash password.")))?;

            *password = hashed_password.to_string().into();
        }

        Ok((
            PipelineCx {
                request,
                response: Some(response),
            },
            PipelineAction::Continue(None),
        ))
    }
}
