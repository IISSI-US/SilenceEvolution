// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import AppCx from "@admin/AppCx";

import { type Endpoint, type EndpointByFile } from "@admin/endpoints";

import AlertBox, { type AlertStruct } from "@admin/components/AlertContainer";
import RawSchema from "@admin/components/RawSchema";
import { confirm_btn } from "@admin/components/ConfirmButton";

import {
    createEffect,
    createMemo,
    createResource,
    createSignal,
    Show,
    useContext,
} from "solid-js";

import {
    useNavigate,
    useParams,
    type RouteSectionProps,
} from "@solidjs/router";

import { loadGrammar } from "@arborium/arborium";

export default (_: RouteSectionProps) => {
    const app_cx = useContext(AppCx)!;

    const [endpoints, { refetch }] = app_cx.get_resource("endpoints");

    const navigate = useNavigate();

    const [get_alert, set_alert] = createSignal<AlertStruct | undefined>(
        undefined,
    );

    const id = useParams()["id"];

    // Raw schema mode.
    const [get_raw_schema_mode, set_raw_schema_mode] =
        createSignal<boolean>(false);

    // Raw schema.
    const [get_raw_schema, set_raw_schema] = createSignal<string | undefined>(
        undefined,
    );

    const endpoint_by_file = createMemo((): EndpointByFile | undefined => {
        const original_def =
            id !== undefined && endpoints() !== undefined
                ? endpoints()!.filter((endpoint_pair) => {
                      return endpoint_pair.endpoint.id == id;
                  })[0]!
                : undefined;

        if (get_raw_schema()) {
            try {
                return {
                    endpoint: {
                        ...original_def!.endpoint,
                        ...(JSON.parse(get_raw_schema() ?? "") as Endpoint),
                    },
                } as EndpointByFile;
            } catch {
                console.log(
                    "Cannot deserialize the raw schema. Falling back to original definition.",
                );
            }
        }

        return original_def;
    });

    const serialize_fields = () => {
        const form = document.getElementById("form")! as HTMLFormElement;

        const form_data = Object.fromEntries(new FormData(form));

        const req = {
            id: form_data["id"]?.toString(),
            database: form_data["database"]?.toString(),
            route: form_data["route"]?.toString(),
            version: form_data["version"]?.toString(),
            method: form_data["method"]?.toString().toLowerCase(),
            execute: {
                query: form_data["query"]?.toString(),
            },
            query_params: Array.from(
                (form_data["query_params"]?.toString() as string)
                    .replaceAll(" ", "")
                    .split(",")
                    .filter((val) => val.length !== 0),
            ),
            body_params: Array.from(
                (form_data["body_params"]?.toString() as string)
                    .replaceAll(" ", "")
                    .split(",")
                    .filter((val) => val.length !== 0),
            ),
            description: form_data["description"]?.toString(),
            require_auth:
                form_data["require_auth"]?.toString() == "on" ? true : false,
            inject_auth_metadata:
                form_data["inject_auth_metadata"]?.toString() == "on"
                    ? true
                    : false,
            allowed_roles: Array.from(
                (form_data["allowed_roles"]?.toString() as string)
                    .replaceAll(" ", "")
                    .split(",")
                    .filter((val) => val.length !== 0),
            ),
            auto_generated:
                form_data["auto_generated"]?.toString() == "on" ? true : false,
        } as Endpoint;

        if (endpoint_by_file()) {
            for (const field in req) {
                const value = req[field as keyof Endpoint];
                if (
                    value === undefined ||
                    (!Array.isArray(value) && (value as string).length === 0)
                )
                    delete req[field as keyof Endpoint];
            }
        }

        return req;
    };

    const submit_endpoint = async () => {
        const req = serialize_fields();

        const res = await fetch(
            `/api/internal/admin/endpoints/${endpoint_by_file() ? endpoint_by_file()!.endpoint.id : ""}${(req["path" as keyof Endpoint] ?? "".length !== 0) ? `?target_file=${req["path" as keyof Endpoint]}` : ""}`,
            {
                method: endpoint_by_file() ? "put" : "post",
                body: JSON.stringify(req),
            },
        );

        if (!res.ok) {
            console.clear();

            const data = (await res.json()) as {
                error: string;
            };

            set_alert({ value: data.error, is_error: true });

            return;
        }

        refetch();

        navigate("/endpoints", {
            replace: false,
            scroll: false,
        });
    };

    const delete_endpoint = async () => {
        const res = await fetch(
            `/api/internal/admin/endpoints/${endpoint_by_file()!.endpoint.id}`,
            { method: "delete" },
        );

        if (!res.ok) console.clear();

        if (res.status === 200) {
            refetch();

            navigate("/endpoints", {
                replace: false,
                scroll: false,
            });
        } else {
            const data = (await res.json()) as {
                error: string;
            };

            const delete_button = document.getElementById("delete_endpoint")!;

            delete_button.innerText = "Retry";
            delete_button.setAttribute("data-confirmed", "false");

            set_alert({ value: data.error, is_error: true });
        }
    };

    // Load SQL grammar.
    const [sql_grammar] = createResource(async () => {
        return (await loadGrammar("sql"))!;
    });

    const [formatted_sql, set_formatted_sql] = createSignal<string>("—");

    const format_sql = async (value: string) => {
        set_formatted_sql(await sql_grammar()?.highlight(value)!);
    };

    createEffect(async () => {
        if (endpoint_by_file() !== undefined) {
            if (!get_raw_schema_mode())
                set_raw_schema(JSON.stringify(serialize_fields(), null, "\t"));

            format_sql(
                endpoint_by_file()!.endpoint.execute?.queries
                    ? endpoint_by_file()!
                          .endpoint.execute!.queries!.map(
                              (mysql_query) => mysql_query.query,
                          )
                          .join("; ")
                    : endpoint_by_file()!.endpoint.execute?.query!,
            );
        }
    });

    createEffect(() => {
        set_alert({
            value: `Help: ${id ? `modify ${id}'s parameters` : `create a new endpoint`}, note that as soon a change is committed the changes will immediately take effect without reloading the server.`,
        });
    });

    return (
        <>
            <div class="grid gap-2 py-8">
                <div>
                    <h1 class="text-3xl text-center pt-4 font-bold">
                        {endpoint_by_file()
                            ? `✏️ ${endpoint_by_file()!.endpoint.id}`
                            : "New endpoint"}
                    </h1>
                </div>
                <Show
                    when={
                        endpoint_by_file() === undefined ||
                        (endpoint_by_file()!.endpoint.execute !== null &&
                            endpoint_by_file()!.endpoint.version?.split(
                                "/",
                            )[0] !== "internal")
                    }
                    fallback={
                        <span>
                            This endpoint can't be modified nor deleted.
                        </span>
                    }
                >
                    <AlertBox
                        alert_signals={[get_alert, set_alert]}
                        hide_timeout={!get_alert()?.is_error ? 5000 : undefined}
                    ></AlertBox>

                    <form
                        id="form"
                        class="[&_span]:mb-1"
                        classList={{
                            hidden: get_raw_schema_mode(),
                        }}
                        onInput={(event) => {
                            set_alert(undefined);

                            set_raw_schema(
                                JSON.stringify(serialize_fields(), null, "\t"),
                            );

                            let form = event.currentTarget;
                            let submit = document.getElementById("submit");

                            if (form.checkValidity()) {
                                submit?.classList.remove("btn-disabled");
                            } else submit?.classList.add("btn-disabled");
                        }}
                    >
                        <fieldset class="fieldset [&_.input]:w-full lg:grid-cols-2 gap-3">
                            <label>
                                <span class="label">ID</span>
                                <input
                                    name="id"
                                    type="text"
                                    class="input peer"
                                    placeholder={
                                        endpoint_by_file()
                                            ? endpoint_by_file()!.endpoint.id
                                            : "ID"
                                    }
                                    required={endpoint_by_file() === undefined}
                                />
                                <p class="text-info pt-1 hidden peer-focus:block">
                                    An unique identifier for each endpoint.
                                </p>
                            </label>

                            <label>
                                <span class="label">Route</span>
                                <input
                                    name="route"
                                    type="text"
                                    class="input font-mono"
                                    value={
                                        endpoint_by_file()
                                            ? endpoint_by_file()!.endpoint.route
                                            : ""
                                    }
                                    placeholder="Route"
                                    required={endpoint_by_file() === undefined}
                                />
                            </label>

                            <label>
                                <span class="label">Method</span>
                                <input
                                    name="method"
                                    type="text"
                                    class="input peer"
                                    placeholder={
                                        endpoint_by_file() !== undefined
                                            ? endpoint_by_file()!.endpoint
                                                  .method
                                            : "Method"
                                    }
                                    required={endpoint_by_file === undefined}
                                />
                                <p class="text-info pt-1 hidden peer-focus:block">
                                    HINT: available GET, POST, PUT and DELETE.
                                </p>
                            </label>

                            <label>
                                <span class="label">Body params</span>
                                <input
                                    name="body_params"
                                    type="text"
                                    class="input peer font-mono"
                                    value={
                                        endpoint_by_file()
                                            ? (
                                                  endpoint_by_file()!.endpoint
                                                      .body_params ?? [""]
                                              ).join(", ")
                                            : ""
                                    }
                                    placeholder="Body params"
                                />
                                <p class="text-info pt-1 hidden peer-focus:block">
                                    Parameters sent in the request's body that
                                    will be accepted by the endpoint and could
                                    be inserted in the query. Parameters should
                                    be comma-separated.
                                </p>
                            </label>
                        </fieldset>

                        <label class="my-1">
                            <span class="label text-xs">Query</span>
                            <div class="overflow-auto overscroll-contain">
                                <div class="grid grid-cols-1 box-border min-w-0 font-mono **:text-sm **:leading-6 overflow-hidden">
                                    <div
                                        class="bg-base-200/75 p-3 border border-base-300 col-start-1 row-start-1 rounded-2xl w-full h-full inset-0 backdrop-brightness-125 backdrop-blur-xs pointer-events-none whitespace-pre-wrap wrap-break-word z-10 min-w-0 overflow-hidden"
                                        innerHTML={formatted_sql()}
                                    ></div>
                                    <textarea
                                        id="query"
                                        name="query"
                                        class="bg-transparent p-3 border text-transparent caret-info col-start-1 row-start-1 whitespace-pre-wrap w-full min-h-14 not-focus:text-transparent z-20 min-w-0 outline-0  resize-none"
                                        spellcheck="false"
                                        value={
                                            endpoint_by_file()
                                                ? endpoint_by_file()!.endpoint
                                                      .execute !== undefined
                                                    ? endpoint_by_file()!
                                                          .endpoint.execute!
                                                          .queries
                                                        ? endpoint_by_file()!
                                                              .endpoint.execute!.queries!.map(
                                                                  (
                                                                      mysql_query,
                                                                  ) =>
                                                                      mysql_query.query,
                                                              )
                                                              .join("; ")
                                                        : endpoint_by_file()!
                                                              .endpoint.execute!
                                                              .query
                                                    : "Internal"
                                                : ""
                                        }
                                        placeholder="Query"
                                        onInput={async (event) => {
                                            format_sql(
                                                event.currentTarget.value,
                                            );
                                        }}
                                        required={
                                            endpoint_by_file() === undefined
                                        }
                                    />
                                </div>
                            </div>
                        </label>

                        <details class="collapse bg-white/50 dark:bg-base-100/20 border border-base-300 rounded-2xl mt-3 my-1">
                            <summary class="collapse-title font-semibold transition duration-200 hover:bg-base-200">
                                Extras
                            </summary>
                            <div class="collapse-content">
                                <fieldset class="fieldset [&_.input]:w-full lg:grid-cols-3 gap-3">
                                    <label>
                                        <span class="label">Version</span>
                                        <input
                                            name="version"
                                            type="text"
                                            class="input font-mono"
                                            value={
                                                !endpoint_by_file ? "v1" : ""
                                            }
                                            placeholder={
                                                endpoint_by_file()
                                                    ? (endpoint_by_file()!
                                                          .endpoint.version ??
                                                      "—")
                                                    : "Version"
                                            }
                                        />
                                    </label>

                                    <label>
                                        <span class="label">Description</span>
                                        <input
                                            name="description"
                                            type="text"
                                            class="input"
                                            value={
                                                endpoint_by_file()
                                                    ? (endpoint_by_file()!
                                                          .endpoint
                                                          .description ?? "")
                                                    : ""
                                            }
                                            placeholder="Description"
                                        />
                                    </label>

                                    <label>
                                        <span class="label">Query params</span>
                                        <input
                                            name="query_params"
                                            type="text"
                                            class="input peer font-mono"
                                            value={
                                                endpoint_by_file()
                                                    ? (
                                                          endpoint_by_file()!
                                                              .endpoint
                                                              .query_params ?? [
                                                              "",
                                                          ]
                                                      ).join(", ")
                                                    : ""
                                            }
                                            placeholder="Query params"
                                        />
                                        <p class="text-info pt-1 hidden peer-focus:block">
                                            Query params that will be accepted
                                            by the endpoint and could be
                                            inserted in the query (SQL).
                                            Parameters should be
                                            comma-separated.
                                        </p>
                                    </label>

                                    <label>
                                        <span class="label">Allowed roles</span>
                                        <input
                                            name="allowed_roles"
                                            type="text"
                                            class="input font-mono"
                                            value={
                                                endpoint_by_file()
                                                    ? (
                                                          endpoint_by_file()!
                                                              .endpoint
                                                              .allowed_roles ?? [
                                                              "",
                                                          ]
                                                      ).join(", ")
                                                    : ""
                                            }
                                            placeholder="Allowed roles"
                                        />
                                    </label>

                                    <label>
                                        <span class="label">Path</span>
                                        <input
                                            name="path"
                                            type="text"
                                            class="input font-mono"
                                            placeholder={
                                                endpoint_by_file()
                                                    ? (endpoint_by_file()!
                                                          .path ?? "—")
                                                    : "Path"
                                            }
                                            readOnly={
                                                endpoint_by_file() !== undefined
                                            }
                                        />
                                    </label>
                                </fieldset>

                                <fieldset class="fieldset [&_.input]:w-full text-sm lg:grid-cols-3 gap-3 my-1">
                                    <label class="align-middle">
                                        <span class="label mr-2">
                                            Requires auth
                                        </span>
                                        <input
                                            name="require_auth"
                                            type="checkbox"
                                            class="checkbox"
                                            checked={
                                                endpoint_by_file()
                                                    ? endpoint_by_file()!
                                                          .endpoint.require_auth
                                                    : false
                                            }
                                        />
                                    </label>

                                    <label class="align-middle">
                                        <span class="label mr-2">
                                            Injects auth metadata into query
                                        </span>
                                        <input
                                            name="inject_auth_metadata"
                                            type="checkbox"
                                            class="checkbox"
                                            checked={
                                                endpoint_by_file()
                                                    ? endpoint_by_file()!
                                                          .endpoint
                                                          .inject_auth_metadata
                                                    : false
                                            }
                                        />
                                    </label>
                                </fieldset>
                            </div>
                        </details>
                    </form>

                    <div classList={{ hidden: !get_raw_schema_mode() }}>
                        <RawSchema
                            schema={[get_raw_schema, set_raw_schema]}
                        ></RawSchema>
                    </div>

                    <div class="flex gap-2 [&_button]:rounded-xl [&_button]:hover:shadow">
                        <button
                            id="delete_endpoint"
                            class="btn btn-active hover:text-white hover:bg-red-600"
                            classList={{
                                hidden: endpoint_by_file() === undefined,
                            }}
                            data-confirmed={false}
                            onClick={confirm_btn(delete_endpoint)}
                        >
                            Delete endpoint
                        </button>
                        <button
                            id="submit"
                            type="submit"
                            class="btn btn-active hover:text-black hover:btn-success"
                            classList={{
                                "btn-disabled":
                                    endpoint_by_file() === undefined,
                            }}
                            data-confirmed={false}
                            onClick={confirm_btn(submit_endpoint)}
                        >
                            {endpoint_by_file() ? "Update" : "Create endpoint"}
                        </button>
                        <div
                            class="py-2 btn btn-ghost bg-base-200 border border-base-300 rounded-2xl flex items-baseline-last gap-2"
                            onClick={(_) => {
                                set_raw_schema_mode(!get_raw_schema_mode());
                            }}
                        >
                            <span
                                class="text-xs text-blue-900 dark:text-blue-500 font-semibold self-center"
                                classList={{
                                    "text-red-500!": get_raw_schema_mode(),
                                }}
                            >
                                {get_raw_schema_mode()
                                    ? "Raw schema"
                                    : "Fields input"}
                            </span>
                            <input
                                id="table-mode"
                                type="checkbox"
                                class="toggle"
                                checked={get_raw_schema_mode()}
                            />
                        </div>
                    </div>
                </Show>
            </div>
        </>
    );
};
