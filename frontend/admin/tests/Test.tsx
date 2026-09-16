// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import AppCx from "@admin/AppCx";

import { type Test } from "@admin/tests";

import { current_component } from "@admin/Admin";

import { normalize_route } from "@admin/endpoints";

import AlertBox, { type AlertStruct } from "@admin/components/AlertContainer";
import { confirm_btn } from "@admin/components/ConfirmButton";

import {
    createEffect,
    createMemo,
    createResource,
    createSignal,
    Index,
    Show,
    useContext,
} from "solid-js";

import { createStore } from "solid-js/store";

import {
    useLocation,
    useNavigate,
    useParams,
    type RouteSectionProps,
} from "@solidjs/router";

import { pipe, map, fromEntries, join, entries } from "remeda";

import { loadGrammar } from "@arborium/arborium";

export interface TestBaseSchema {
    base_route?: string;
    route_params?: Array<string>;
    query_params?: Array<string>;
    body_params?: Array<string>;
}

export default (_: RouteSectionProps) => {
    const app_cx = useContext(AppCx)!;

    const [tests, { refetch }] = app_cx.get_resource("tests");
    const [endpoints] = app_cx.get_resource("endpoints");

    const location = useLocation();

    const navigate = useNavigate();

    const is_loaded_test =
        current_component(location.pathname) === "tests" &&
        !location.pathname.includes("new");

    const [get_alert, set_alert] = createSignal<AlertStruct | undefined>(
        undefined,
    );

    const [response, set_response] = createSignal<
        | {
              route: string;
              status: number;
              time: string;
              body: string;
          }
        | undefined
    >(undefined);

    const [authorization, set_authorization] = createSignal<string | undefined>(
        localStorage.getItem("test_authorization") ?? undefined,
    );

    const [req_body, set_req_body] = createSignal<string | undefined>(
        undefined,
    );

    const [id, set_id] = createSignal(useParams()["id"]);

    const [name, _set_name] = createSignal(
        useParams()["name"]?.replaceAll("%20", " "),
    );

    let name_element: HTMLInputElement | undefined = undefined;
    let description_element: HTMLInputElement | undefined = undefined;
    let route_params_element: HTMLFieldSetElement | undefined = undefined;
    let query_params_element: HTMLFieldSetElement | undefined = undefined;
    let req_body_element: HTMLTextAreaElement | undefined = undefined;
    let response_body_element: HTMLDivElement | undefined = undefined;
    let delete_test_element: HTMLButtonElement | undefined = undefined;

    const test_by_file = createMemo(() => {
        check: if (is_loaded_test && name() && tests() !== undefined) {
            const test_by_file = tests()!.filter(
                (test_by_file) => test_by_file.test.name === name(),
            )[0];

            if (!test_by_file) break check;

            set_id(test_by_file.test.target_endpoint_id);

            if (test_by_file.test["response"] !== undefined)
                set_response(test_by_file.test["response"]);

            return test_by_file;
        }

        return undefined;
    });

    const endpoint_by_file = createMemo(() => {
        return id() !== undefined && endpoints() !== undefined
            ? endpoints()!.filter((endpoint_pair) => {
                  return endpoint_pair.endpoint.id == id();
              })[0]!
            : undefined;
    });

    const [test_schema, set_test_schema] = createStore<TestBaseSchema>({});

    const should_show_test = createMemo(() =>
        is_loaded_test
            ? test_by_file() !== undefined &&
              test_schema.base_route !== undefined
            : test_schema.base_route !== undefined,
    );

    createEffect(() => {
        if (endpoint_by_file() !== undefined) {
            const test_query_params = test_by_file()
                ? pipe(
                      test_by_file()!.test["query_params"] as Record<
                          string,
                          string
                      >,
                      entries(),
                      map(([key, _]) => key),
                  )
                : new Array<string>();

            set_test_schema(
                "base_route",
                normalize_route(
                    endpoint_by_file()!.endpoint.route,
                    endpoint_by_file()!.endpoint.version,
                ),
            );

            set_test_schema(
                "route_params",
                pipe(
                    endpoint_by_file()!
                        .endpoint.route.matchAll(/\{(\w+)\}/g)
                        .toArray(),

                    map((match) => match[1]),
                ) as Array<string>,
            );

            set_test_schema(
                "query_params",
                (
                    endpoint_by_file()!.endpoint.query_params ?? new Array()
                ).concat(test_query_params),
            );

            set_test_schema(
                "body_params",
                endpoint_by_file()!.endpoint.body_params ?? new Array(),
            );
        }
    });

    const extractors = {
        route_params: () =>
            pipe(
                Array.from(route_params_element!.children),
                map((element) => {
                    const input = element.querySelector("input")!;
                    return [input.name, input.value];
                }),
            ),
        query_params: () =>
            pipe(
                Array.from(query_params_element!.children),
                map((element) => {
                    const field_name = element.getElementsByClassName(
                        "field_name",
                    )[0]! as HTMLInputElement;
                    const field_value = element.getElementsByClassName(
                        "field_value",
                    )[0]! as HTMLInputElement;

                    return [field_name.value, field_value.value];
                }),
            ),
        body: () => req_body_element!.value,
    };

    const send_req = async () => {
        // Extract all route params.
        const route_params = extractors.route_params();

        // Extract all query params.
        const query_params = extractors.query_params();

        // Build the route.
        let base_route = test_schema.base_route!;

        for (const route_param of route_params) {
            const [name, value] = route_param!;
            base_route = base_route.replace(`{${name!}}`, value!);
        }

        if (query_params.length !== 0) {
            base_route = base_route.concat("?");

            base_route = base_route.concat(
                pipe(
                    query_params,
                    map(([name, value]) => {
                        return `${name}=${value}`;
                    }),
                    join("&"),
                ),
            );
        }

        const res = await fetch(base_route, {
            method: endpoint_by_file()!.endpoint.method,
            headers: {
                Authorization: localStorage.getItem("test_authorization") ?? "",
            },
            body:
                endpoint_by_file()!.endpoint.method.toLowerCase() === "get"
                    ? null
                    : extractors.body(),
            credentials: "omit",
        });

        const body = await res.json().catch((_) => new Object());

        if ("token" in body) {
            localStorage.setItem("test_authorization", body["token"]);
            set_authorization(body["token"]);
        }

        if (!res.ok) {
            if (res.status === 401) {
                localStorage.removeItem("test_authorization");
                set_authorization(undefined);
            }

            set_alert({
                value: body["error"] ?? "Unknown error.",
                is_error: true,
            });
        }

        set_response({
            route: base_route,
            status: res.status,
            time: res.headers.get("Date")!,
            body: JSON.stringify(body, null, "\t"),
        });

        response_body_element!.scrollIntoView({
            behavior: "smooth",
            block: "end",
        });
    };

    const save_test = async () => {
        const req_name =
            name_element!.value !== name() && name_element!.value.length !== 0
                ? name_element!.value
                : name();

        const req_description =
            description_element!.value !== test_by_file()?.test.description
                ? description_element!.value
                : undefined;

        // Extract all test's params.
        const route_params = Object.fromEntries(extractors.route_params());
        const query_params = Object.fromEntries(extractors.query_params());
        const body = (() => {
            try {
                return JSON.parse(extractors.body());
            } catch (err) {
                set_alert({ value: (err as Error).message, is_error: true });
                return undefined;
            }
        })();

        const req = {
            name: req_name,
            target_endpoint_id: id(),
            description: req_description,
            route_params,
            query_params,
            body,
            response: response(),
        } as Test;

        for (const field in req) {
            if (field === "description") continue;

            const value = req[field as keyof Test];

            if (
                value === undefined ||
                (!Array.isArray(value) && (value as string).length === 0)
            )
                delete req[field as keyof Test];
        }

        const res = await fetch(
            `/api/internal/admin/tests/${test_by_file() ? test_by_file()?.test.name : ""}`,
            {
                method: test_by_file() ? "put" : "post",
                body: JSON.stringify(req),
            },
        );

        if (!res.ok) {
            set_alert({
                value: body["error"] ?? "Unknown error.",
                is_error: true,
            });
        }

        refetch();

        if (req_name !== name())
            navigate(`/tests/${req_name}`, {
                replace: false,
                scroll: false,
            });
    };

    const delete_test = async () => {
        const res = await fetch(
            `/api/internal/admin/tests/${test_by_file()!.test.name}`,
            { method: "delete" },
        );

        if (!res.ok) console.clear();

        if (res.status === 200) {
            refetch();

            navigate("/tests", {
                replace: false,
                scroll: false,
            });
        } else {
            const data = (await res.json()) as {
                error: string;
            };

            delete_test_element!.innerText = "Retry";
            delete_test_element!.setAttribute("data-confirmed", "false");

            set_alert({ value: data.error, is_error: true });
        }
    };

    // Load JSON grammar.
    const [json_grammar] = createResource(async () => {
        return (await loadGrammar("json"))!;
    });

    const default_body = createMemo(() => {
        if (test_schema.base_route !== undefined) {
            let skeleton = test_by_file()?.test["body"]
                ? ((test_by_file()!.test["body"] ?? {}) as Record<any, any>)
                : pipe(
                      test_schema.body_params!,
                      map((param) => [param, null] as const),
                      fromEntries,
                  );
            return JSON.stringify(skeleton, null, "\t");
        } else {
            return "{}";
        }
    });

    createEffect(async () => {
        if (response() !== undefined) {
            response_body_element!.innerHTML = await json_grammar()?.highlight(
                response()!.body,
            )!;
        }
    });

    createEffect(() => {
        if (endpoint_by_file() !== undefined)
            set_alert({
                value: `Help: test the endpoint ${id()} on this page, make sure to fill the request's parameters and body as required. Note that the current endpoint ${endpoint_by_file()?.endpoint.require_auth ? "requires authentication" : "doesn't require authentication."}`,
            });
    });

    return (
        <>
            <div class="grid gap-2 py-8">
                <div class="flex flex-col gap-2 overflow-hidden">
                    <h1 class="text-3xl text-center pt-4 font-bold *:align-middle">
                        <span>🧪</span>
                        <textarea
                            class="text-center max-w-full ml-4 rounded-none! bg-transparent! field-sizing-content col-start-1 row-start-1 whitespace-pre-wrap min-w-0 outline-0 resize-none appearance-none!"
                            placeholder="Test name"
                            value={
                                test_by_file()
                                    ? test_by_file()!.test.name
                                    : endpoint_by_file()
                                      ? endpoint_by_file()!.endpoint.id
                                      : "New test"
                            }
                            ref={name_element}
                        ></textarea>
                    </h1>
                    <h2 class="text-xl text-center font-light">
                        <textarea
                            class="text-center w-full rounded-none! bg-transparent! field-sizing-content col-start-1 row-start-1 whitespace-pre-wrap min-w-0 outline-0 resize-none appearance-none!"
                            placeholder="Test's description"
                            value={
                                test_by_file()
                                    ? test_by_file()!.test.description
                                    : endpoint_by_file()
                                      ? endpoint_by_file()!.endpoint.description
                                      : ""
                            }
                            ref={description_element}
                        ></textarea>
                    </h2>
                </div>

                <AlertBox
                    alert_signals={[get_alert, set_alert]}
                    hide_timeout={!get_alert()?.is_error ? 5000 : undefined}
                ></AlertBox>

                <div class="lg:flex lg:flex-row">
                    <div class="lg:basis-full">
                        <form
                            id="form"
                            class="[&_span]:mb-1"
                            onInput={(event) => {
                                if (get_alert()?.is_error) set_alert(undefined);

                                let form = event.currentTarget;
                                let submit = document.getElementById("submit");

                                if (form.checkValidity()) {
                                    submit?.classList.remove("btn-disabled");
                                } else submit?.classList.add("btn-disabled");
                            }}
                        >
                            <fieldset class="fieldset flex gap-1">
                                <input
                                    name="method"
                                    type="text"
                                    class="input p-0 inline-20 text-center font-bold w-min"
                                    classList={{
                                        "hidden!":
                                            endpoint_by_file() === undefined,
                                    }}
                                    value={endpoint_by_file()?.endpoint.method}
                                    readOnly
                                />
                                <input
                                    name="route"
                                    type="text"
                                    class="input w-full"
                                    popovertarget={`endpoint-selector-dropdown`}
                                    style={`anchor-name:--endpoint-selector`}
                                    value={
                                        test_schema.base_route ??
                                        "Select an endpoint"
                                    }
                                    onClick={(event) => {
                                        const target = event.currentTarget;

                                        const dropdown =
                                            target.nextSibling as HTMLUListElement;

                                        dropdown.togglePopover();
                                    }}
                                    readOnly
                                />
                                <ul
                                    id={`endpoint-selector-dropdown`}
                                    class="dropdown menu lg:min-w-1/2 w-max max-w-screen not-lg:m-0! h-1/2 rounded-box bg-base-200/25 border-base-300 overflow-y-scroll overscroll-none border backdrop-blur-sm backdrop-brightness-110 shadow-lg opacity-0 [&:popover-open]:opacity-100 starting:opacity-0 transition-all transition-discrete duration-200"
                                    style={`position-anchor:--endpoint-selector; inset: auto; align-self: anchor-center; justify-self: anchor-center; margin: 0.5rem;`}
                                    onClick={(event) =>
                                        (
                                            event.currentTarget as HTMLUListElement
                                        ).togglePopover()
                                    }
                                    popover
                                >
                                    <Index each={endpoints()}>
                                        {(endpoint_by_file, _) => (
                                            <li>
                                                <button
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        set_id(
                                                            endpoint_by_file()
                                                                .endpoint.id,
                                                        );
                                                    }}
                                                    tabIndex="1"
                                                >
                                                    <div class="flex not-lg:flex-col lg:gap-2">
                                                        <span class="font-bold">
                                                            {
                                                                endpoint_by_file()
                                                                    .endpoint.id
                                                            }
                                                        </span>
                                                        <span>
                                                            {normalize_route(
                                                                endpoint_by_file()!
                                                                    .endpoint
                                                                    .route,
                                                                endpoint_by_file()!
                                                                    .endpoint
                                                                    .version,
                                                            )}
                                                        </span>
                                                    </div>
                                                </button>
                                            </li>
                                        )}
                                    </Index>
                                </ul>
                            </fieldset>

                            <Show when={should_show_test()}>
                                <details
                                    class="collapse bg-white/50 dark:bg-base-100/20 border border-base-300 rounded-2xl mt-3 my-1"
                                    classList={{
                                        hidden:
                                            test_schema.route_params!.length ===
                                            0,
                                    }}
                                    open
                                >
                                    <summary class="collapse-title font-semibold transition duration-200 hover:bg-base-200">
                                        Route params
                                    </summary>
                                    <div class="collapse-content">
                                        <fieldset
                                            class="fieldset [&_.input]:w-full lg:grid-cols-3 gap-3"
                                            ref={route_params_element}
                                        >
                                            <Index
                                                each={test_schema.route_params!}
                                            >
                                                {(param) => {
                                                    return (
                                                        <>
                                                            <label>
                                                                <span class="label">
                                                                    {param()}
                                                                </span>
                                                                <input
                                                                    name={param()}
                                                                    type="text"
                                                                    class="input"
                                                                    placeholder="—"
                                                                    value={
                                                                        test_by_file()
                                                                            ? ((test_by_file()
                                                                                  ?.test[
                                                                                  "route_params"
                                                                              ] ??
                                                                                  "")[
                                                                                  param()
                                                                              ] ??
                                                                              "")
                                                                            : ""
                                                                    }
                                                                    required
                                                                />
                                                            </label>
                                                        </>
                                                    );
                                                }}
                                            </Index>
                                        </fieldset>
                                    </div>
                                </details>

                                <details
                                    class="collapse bg-white/50 dark:bg-base-100/20 border border-base-300 rounded-2xl mt-3 my-1"
                                    open
                                >
                                    <summary class="collapse-title font-semibold transition duration-200 hover:bg-base-200">
                                        Query params
                                    </summary>
                                    <div class="collapse-content">
                                        <fieldset
                                            id="query_params"
                                            class="fieldset [&_.input]:w-full lg:grid-cols-3 gap-3 empty:hidden"
                                            ref={query_params_element}
                                        >
                                            <Index
                                                each={test_schema.query_params!}
                                            >
                                                {(param, _) => {
                                                    return (
                                                        <>
                                                            <label>
                                                                <div class="flex">
                                                                    <input
                                                                        type="text"
                                                                        class="field_name label bg-transparent! outline-0"
                                                                        placeholder="Query param name"
                                                                        value={param()}
                                                                    />
                                                                    <div
                                                                        class="self-end text-right ml-auto opacity-75 scale-75 transition duration-200 hover:opacity-50"
                                                                        onClick={(
                                                                            event,
                                                                        ) => {
                                                                            const parent =
                                                                                event
                                                                                    .currentTarget
                                                                                    .parentElement!
                                                                                    .parentElement;

                                                                            parent!.remove();
                                                                        }}
                                                                    >
                                                                        <span class="material-symbols-outlined">
                                                                            delete
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <input
                                                                    type="text"
                                                                    class="field_value input"
                                                                    placeholder="—"
                                                                    value={
                                                                        test_by_file()
                                                                            ? (test_by_file()
                                                                                  ?.test[
                                                                                  "query_params"
                                                                              ]![
                                                                                  param()
                                                                              ] ??
                                                                              "")
                                                                            : ""
                                                                    }
                                                                />
                                                            </label>
                                                        </>
                                                    );
                                                }}
                                            </Index>
                                        </fieldset>
                                        <div
                                            class="btn text-sm mt-2 text-right"
                                            onClick={(_) => {
                                                let query_params = Array.from(
                                                    test_schema.query_params!,
                                                );

                                                query_params.push("");

                                                set_test_schema(
                                                    "query_params",
                                                    query_params,
                                                );
                                            }}
                                        >
                                            <span class="material-symbols-outlined lg:hidden!">
                                                add
                                            </span>
                                            <span class="not-lg:hidden">
                                                Add query param
                                            </span>
                                        </div>
                                    </div>
                                </details>

                                <label class="my-1">
                                    <span class="label text-xs">Body</span>
                                    <div class="overflow-auto overscroll-contain">
                                        <div class="grid grid-cols-1 box-border min-w-0 font-mono **:text-sm **:leading-6 overflow-hidden">
                                            <div
                                                class="bg-base-200/75 p-3 border border-base-300 col-start-1 row-start-1 rounded-2xl w-full h-full inset-0 backdrop-brightness-125 backdrop-blur-xs pointer-events-none whitespace-pre-wrap wrap-break-word z-10 min-w-0 overflow-hidden"
                                                ref={async (element) => {
                                                    createEffect(async () => {
                                                        if (
                                                            test_schema.base_route !==
                                                            undefined
                                                        ) {
                                                            element.innerHTML =
                                                                await json_grammar()?.highlight(
                                                                    req_body() ??
                                                                        default_body()!,
                                                                )!;
                                                        }
                                                    });
                                                }}
                                            ></div>
                                            <textarea
                                                id="body"
                                                name="body"
                                                class="bg-transparent p-3 border text-transparent caret-info col-start-1 row-start-1 whitespace-pre-wrap w-full min-h-14 not-focus:text-transparent z-20 min-w-0 outline-0 resize-none"
                                                spellcheck="false"
                                                onKeyDown={(event) => {
                                                    let target =
                                                        event.currentTarget;

                                                    if (event.key === "Tab") {
                                                        event.preventDefault();

                                                        let value =
                                                                target.value,
                                                            start =
                                                                target.selectionStart,
                                                            end =
                                                                target.selectionEnd;
                                                        target.value =
                                                            value.substring(
                                                                0,
                                                                start,
                                                            ) +
                                                            "\t" +
                                                            value.substring(
                                                                end,
                                                            );
                                                        target.selectionStart =
                                                            target.selectionEnd =
                                                                start + 1;
                                                    }
                                                }}
                                                value={default_body()}
                                                placeholder="Body"
                                                onInput={async (event) => {
                                                    set_req_body(
                                                        event.currentTarget
                                                            .value,
                                                    );
                                                }}
                                                required={
                                                    endpoint_by_file() ===
                                                    undefined
                                                }
                                                ref={req_body_element}
                                            />
                                        </div>
                                    </div>
                                </label>
                            </Show>
                        </form>
                        <div class="flex gap-1 my-2 text-xs font-bold">
                            <span>Authorization header: </span>
                            <div class="font-mono">
                                {authorization() !== undefined ? (
                                    <span class="text-green-500">
                                        {authorization()!}
                                    </span>
                                ) : (
                                    <span class="text-red-500">no</span>
                                )}
                            </div>
                        </div>
                        <Show when={should_show_test()}>
                            <div class="flex gap-2 [&_button]:rounded-xl [&_button]:hover:shadow">
                                <button
                                    id="submit"
                                    type="submit"
                                    class="btn text-black btn-success"
                                    classList={{
                                        "btn-disabled":
                                            test_by_file() === undefined &&
                                            test_schema.route_params?.length !==
                                                0,
                                    }}
                                    onClick={send_req}
                                >
                                    Send
                                </button>
                                <div class="flex gap-2 ml-auto">
                                    <button
                                        class="btn btn-active hover:text-white hover:bg-red-600"
                                        classList={{
                                            hidden:
                                                test_by_file() === undefined,
                                        }}
                                        data-confirmed={false}
                                        onClick={confirm_btn(delete_test)}
                                        ref={delete_test_element}
                                    >
                                        Delete test
                                    </button>
                                    <button
                                        id="save_test"
                                        class="btn btn-active hover:text-black hover:btn-info"
                                        onClick={save_test}
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                        </Show>
                    </div>

                    <div
                        class="flex flex-col basis-auto min-h-full gap-1.5 bg-base-200/75 border border-base-300 overflow-y-scroll scrollbar-thin max-h-96 backdrop-brightness-125 backdrop-blur-xs shadow-xl rounded-box lg:mx-6 not-lg:my-4 p-4 transition-all transition-discrete ease-in-out duration-500"
                        classList={{
                            "invisible opacity-0 lg:min-w-0! not-lg:min-h-0! w-0! h-0! mx-0! my-0! p-0! *:opacity-0 overflow-hidden pointer-events-none":
                                response() === undefined,
                        }}
                    >
                        <div class="flex items-center">
                            <span class="text-xs">
                                Response from{" "}
                                <span class="font-mono">
                                    {response()?.route}
                                </span>{" "}
                                at{" "}
                                <span class="font-mono">
                                    {response()?.time}
                                </span>{" "}
                                with status{" "}
                                <span class="font-mono">
                                    {response()?.status}
                                </span>
                            </span>

                            <button
                                class="text-sm ml-auto hover:scale-105 duration-200"
                                onClick={() => {
                                    set_response(undefined);
                                }}
                            >
                                CLEAR
                            </button>
                        </div>

                        <p
                            class="text-sm font-mono cursor-text whitespace-pre-wrap"
                            ref={response_body_element}
                        ></p>
                    </div>
                </div>
            </div>
        </>
    );
};
