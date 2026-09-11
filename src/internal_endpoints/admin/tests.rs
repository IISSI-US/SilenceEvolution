// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

use crate::*;

use databases::*;
use http_executor::{request_cx::*, *};

#[derive(Clone, Serialize, Deserialize, BoxedAny, Getters, Display, Debug)]
#[display("Tests manager.")]
pub struct EndpointTestsManager;

impl AnyExt for EndpointTestsManager {
    fn name(&self) -> &str {
        "silence_endpoint_tests"
    }
}

/// TODO: add docs here.
#[typetag::serde(name = "TestsManager")]
#[async_trait]
impl AnyHttpExecutor for EndpointTestsManager {
    async fn execute(&self, cx: PipelineCx, _db_conns: DbConns) -> PipelineResult {
        let PipelineCx {
            mut request,
            response,
        } = cx;

        let RequestCx {
            request: body,
            method,
            request_params,
            ..
        } = &mut request;

        let mut response = response.unwrap_or_default();

        *response.body_mut() = None; // Empty the response body set by previous execution steps.

        match method {
            HttpMethod::Get => {
                let test_name = request_params.get("test_name").cloned();

                match test_name {
                    Some(ParamValue::Client(Some(mut name))) => {
                        name = name.replace("%20", " ").into();

                        let endpoint_test = AppCx::acquire()
                            .get_test(name.to_owned())
                            .await?
                            .ok_or(RequestError::Expected(
                                StatusCode::BAD_REQUEST,
                                format!("Cannot find test with name `{}`", name)
                                    .to_compact_string(),
                            ))?;

                        let res = serde_json::to_value(endpoint_test).map_err(|err| {
                            RequestError::Other(eyre!(err).wrap_err("Cannot serialize test."))
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
                    None => {
                        let endpoint_tests = AppCx::acquire().get_tests().await?;

                        let res = serde_json::to_value(endpoint_tests).map_err(|err| {
                            RequestError::Other(eyre!(err).wrap_err("Cannot serialize tests."))
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
                    _ => unreachable!(),
                }
            }
            HttpMethod::Post => {
                let req_body = Bytes::from_vec(
                    body.collect()
                        .await
                        .map_err(|err| {
                            RequestError::Expected(
                                StatusCode::INTERNAL_SERVER_ERROR,
                                format!("Cannot get request's body. {}", err).into(),
                            )
                        })?
                        .to_bytes()
                        .to_vec(),
                );

                let endpoint_test =
                    serde_json::from_slice::<EndpointTest>(&req_body).map_err(|err| {
                        RequestError::Expected(
                            StatusCode::BAD_REQUEST,
                            format!("Cannot deserialize test. {}", err).to_compact_string(),
                        )
                    })?;

                let target_file = match request_params.get("target_file") {
                    Some(ParamValue::Client(Some(target_file))) => target_file.to_owned(),
                    _ => "default.json".to_compact_string(),
                };

                if !target_file.ends_with(".json") {
                    Err(RequestError::Expected(
                        StatusCode::BAD_REQUEST,
                        format!("Target file {} doesn't end with `.json`.", target_file)
                            .to_compact_string(),
                    ))?;
                }

                AppCx::acquire()
                    .add_test(target_file, endpoint_test)
                    .await
                    .map_err(|err| {
                        RequestError::Expected(
                            StatusCode::BAD_REQUEST,
                            format!("{}. Operation might have been partially completed.", err)
                                .to_compact_string(),
                        )
                    })?;

                Ok((
                    PipelineCx {
                        request,
                        response: Some(response),
                    },
                    PipelineAction::Continue(None),
                ))
            }
            HttpMethod::Put => {
                let req_body = &body
                    .collect()
                    .await
                    .map_err(|err| {
                        RequestError::Expected(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            format!("Cannot get request's body. {}", err).into(),
                        )
                    })?
                    .to_bytes()
                    .to_vec();

                let endpoint_test_name = match request_params.get("test_name") {
                    Some(ParamValue::Client(Some(name))) => name.to_owned(),
                    _ => Err(RequestError::Expected(
                        StatusCode::BAD_REQUEST,
                        format!("Test's name to delete was not specified.").to_compact_string(),
                    ))?,
                }
                .replace("%20", " ")
                .into();

                let endpoint_test_patch = serde_json::from_slice::<EndpointTestPatch>(req_body)
                    .map_err(|err| {
                        RequestError::Expected(
                            StatusCode::BAD_REQUEST,
                            format!("Cannot deserialize test's patch. {}", err).to_compact_string(),
                        )
                    })?;

                AppCx::acquire()
                    .set_test(endpoint_test_name, endpoint_test_patch)
                    .await
                    .map_err(|err| {
                        RequestError::Expected(
                            StatusCode::BAD_REQUEST,
                            format!("{}. Operation might have been partially completed.", err)
                                .to_compact_string(),
                        )
                    })?;

                Ok((
                    PipelineCx {
                        request,
                        response: Some(response),
                    },
                    PipelineAction::Continue(None),
                ))
            }
            HttpMethod::Delete => {
                let endpoint_test_name = match request_params.get("test_name") {
                    Some(ParamValue::Client(Some(id))) => id.to_owned(),
                    _ => Err(RequestError::Expected(
                        StatusCode::BAD_REQUEST,
                        format!("Test's name to delete was not specified.").to_compact_string(),
                    ))?,
                }
                .replace("%20", " ")
                .into();

                AppCx::acquire()
                    .delete_test(endpoint_test_name)
                    .await
                    .map_err(|err| {
                        RequestError::Expected(
                            StatusCode::BAD_REQUEST,
                            format!("{}. Operation might have been partially completed.", err)
                                .to_compact_string(),
                        )
                    })?;

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
