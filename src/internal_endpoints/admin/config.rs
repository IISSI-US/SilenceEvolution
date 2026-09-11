// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

use crate::*;

use config::*;

use databases::*;
use http_executor::{request_cx::*, *};

#[derive(Clone, Serialize, Deserialize, BoxedAny, Getters, Display, Debug)]
#[display("Config manager.")]
pub struct ConfigManager;

impl AnyExt for ConfigManager {
    fn name(&self) -> &str {
        "silence_config"
    }
}

/// TODO: add docs here.
#[typetag::serde(name = "ConfigManager")]
#[async_trait]
impl AnyHttpExecutor for ConfigManager {
    async fn execute(&self, cx: PipelineCx, _db_conns: DbConns) -> PipelineResult {
        let PipelineCx {
            mut request,
            response,
        } = cx;

        let RequestCx {
            request: body,
            method,
            ..
        } = &mut request;

        let mut response = response.unwrap_or_default();

        *response.body_mut() = None; // Empty the response body set by previous execution steps.

        match method {
            HttpMethod::Get => {
                let config = AppCx::acquire().config().read().await.to_owned();

                let res = serde_json::to_value(config).map_err(|err| {
                    RequestError::Other(eyre!(err).wrap_err("Cannot serialize endpoints"))
                })?;

                *response.body_mut() = Some(BodyValue::Json(res));

                Ok((
                    PipelineCx {
                        request,
                        response: Some(response),
                    },
                    PipelineAction::Continue(None),
                ))
            }
            HttpMethod::Put => {
                {
                    let mut config_guard = AppCx::acquire().config().write().await;

                    let config_patch = serde_json::from_slice::<ConfigPatch>(
                        &body
                            .collect()
                            .await
                            .map_err(|err| {
                                RequestError::Expected(
                                    StatusCode::INTERNAL_SERVER_ERROR,
                                    format!("Cannot get request's body. {}", err).into(),
                                )
                            })?
                            .to_bytes()
                            .to_vec(),
                    )
                    .map_err(|err| {
                        RequestError::Expected(
                            StatusCode::BAD_REQUEST,
                            format!("Cannot deserialize config's patch. {}", err)
                                .to_compact_string(),
                        )
                    })?;

                    config_guard.apply(config_patch);
                }

                AppCx::acquire().set_config().await?;

                Ok((
                    PipelineCx {
                        request,
                        response: Some(response),
                    },
                    PipelineAction::Continue(None),
                ))
            }
            _ => unreachable!(),
        }
    }
}
