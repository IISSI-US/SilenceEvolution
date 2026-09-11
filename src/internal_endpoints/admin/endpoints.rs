// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

use crate::*;

use databases::*;
use http_executor::{request_cx::*, *};

#[derive(Clone, Serialize, Deserialize, BoxedAny, Getters, Display, Debug)]
#[display("Endpoint manager.")]
pub struct EndpointsManager;

impl AnyExt for EndpointsManager {
    fn name(&self) -> &str {
        "silence_endpoints"
    }
}

/// TODO: add docs here.
#[typetag::serde(name = "EndpointManager")]
#[async_trait]
impl AnyHttpExecutor for EndpointsManager {
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
                let simple_endpoint_id = request_params.get("endpoint_id");

                match simple_endpoint_id {
                    Some(ParamValue::Client(Some(id))) => {
                        let (target_path, simple_endpoint) = AppCx::acquire()
                            .get_endpoint(Some(id.to_owned()), None, false)
                            .await?
                            .ok_or(RequestError::Expected(
                                StatusCode::BAD_REQUEST,
                                format!("Cannot find endpoint with id `{}`", id)
                                    .to_compact_string(),
                            ))?;

                        let serialized_endpoint = serde_json::to_value((
                            target_path,
                            simple_endpoint,
                        ))
                        .map_err(|err| {
                            RequestError::Other(eyre!(err).wrap_err("Cannot serialize endpoint."))
                        })?;

                        *response.body_mut() = Some(BodyValue::Json(serialized_endpoint));

                        Ok((
                            PipelineCx {
                                request,
                                response: Some(response),
                            },
                            PipelineAction::Continue(None),
                        ))
                    }
                    None => {
                        let simple_endpoints_by_file = AppCx::acquire().get_endpoints().await?;

                        let res =
                            serde_json::to_value(simple_endpoints_by_file).map_err(|err| {
                                RequestError::Other(
                                    eyre!(err).wrap_err("Cannot serialize endpoints."),
                                )
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

                let simple_endpoint =
                    serde_json::from_slice::<SimpleEndpoint>(&req_body).map_err(|err| {
                        RequestError::Expected(
                            StatusCode::BAD_REQUEST,
                            format!("Cannot deserialize endpoint. {}", err).to_compact_string(),
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
                    .add_endpoint(target_file, simple_endpoint)
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

                let simple_endpoint_id = match request_params.get("endpoint_id") {
                    Some(ParamValue::Client(Some(id))) => id.to_owned(),
                    _ => Err(RequestError::Expected(
                        StatusCode::BAD_REQUEST,
                        format!("Endpoint's id to delete was not specified.").to_compact_string(),
                    ))?,
                };

                let simple_endpoint_patch = serde_json::from_slice::<SimpleEndpointPatch>(req_body)
                    .map_err(|err| {
                        RequestError::Expected(
                            StatusCode::BAD_REQUEST,
                            format!("Cannot deserialize endpoint's patch. {}", err)
                                .to_compact_string(),
                        )
                    })?;

                AppCx::acquire()
                    .set_endpoint(simple_endpoint_id, simple_endpoint_patch)
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
                let simple_endpoint_id = match request_params.get("id") {
                    Some(ParamValue::Client(Some(id))) => id.to_owned(),
                    _ => Err(RequestError::Expected(
                        StatusCode::BAD_REQUEST,
                        format!("Endpoint id to delete was not specified.").to_compact_string(),
                    ))?,
                };

                AppCx::acquire()
                    .delete_endpoint(simple_endpoint_id)
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
            HttpMethod::Unknown => unreachable!(),
        }
    }
}
