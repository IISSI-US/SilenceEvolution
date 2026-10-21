// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import AppCx from "@admin/AppCx";
import { type Endpoint, type EndpointByFile } from "@admin/endpoints";

import Modal from "@admin/components/Modal";
import AlertBox, { type AlertStruct } from "@admin/components/AlertContainer";
import SearchButton from "@admin/components/SearchButton";
import { SortableColumnCell } from "@admin/components/List";

import {
    children,
    createEffect,
    createResource,
    createSignal,
    Index,
    on,
    Show,
    useContext,
} from "solid-js";

import { Portal } from "solid-js/web";

import { A, useNavigate, type RouteSectionProps } from "@solidjs/router";

import { filter, pipe, sortBy } from "remeda";

import { loadGrammar } from "@arborium/arborium";

export default (props: RouteSectionProps) => {
    const app_cx = useContext(AppCx)!;

    const [endpoints, { refetch }] = app_cx.get_resource("endpoints");

    const navigate = useNavigate();

    const [get_alert, set_alert] = createSignal<AlertStruct | undefined>(
        undefined,
    );

    let table_container: HTMLDivElement | undefined = undefined;

    // Full data.
    const [get_full_data, set_full_data] = createSignal<boolean>(false);

    // Table sort state.
    const [get_table_sort, set_table_sort] = createSignal<{
        field: keyof any;
        order: "asc" | "desc";
    }>({ field: "id", order: "asc" });

    // Search field.
    const [get_search, set_search] = createSignal<string | undefined>(
        undefined,
    );

    // Rendered list.
    const [endpoints_list, set_endpoints_list] = createSignal<
        Array<EndpointByFile>
    >(new Array());

    // Load SQL grammar.
    const [sql_grammar] = createResource(async () => {
        return (await loadGrammar("sql"))!;
    });

    const resolved_children = children(() => props.children);

    createEffect(
        on(resolved_children, (resolved_children) => {
            if (resolved_children !== undefined) {
                document.body.style.overflow = "hidden";
            } else {
                document.body.style.overflow = "";
            }
        }),
    );

    createEffect(() => {
        if (endpoints() !== undefined)
            set_endpoints_list(
                pipe(
                    endpoints()!,
                    filter((endpoint_by_file) => {
                        return (
                            get_full_data() ||
                            (endpoint_by_file.endpoint.execute! !== null &&
                                endpoint_by_file.endpoint.version?.split(
                                    "/",
                                )[0] !== "internal")
                        );
                    }),
                    sortBy([
                        (endpoint_by_file) =>
                            endpoint_by_file.endpoint[
                                get_table_sort().field as keyof Endpoint
                            ]!,
                        get_table_sort().order,
                    ]),
                    filter((endpoint_by_file) => {
                        if (get_search() !== undefined) {
                            const search_term = get_search()!.toLowerCase();

                            return (
                                endpoint_by_file.endpoint
                                    .id!.toLowerCase()
                                    .includes(search_term) ||
                                endpoint_by_file.endpoint
                                    .route!.toLowerCase()
                                    .includes(search_term)
                            );
                        } else return true;
                    }),
                ),
            );
    });

    createEffect(() =>
        set_alert({
            value: "Help: list of all endpoints, select an endpoint to modify or test it. Note that internal endpoints are not listed.",
        }),
    );

    return (
        <>
            <div>
                <div class="flex flex-col gap-3 pb-3 items-center w-full">
                    <div class="flex not-md:flex-col not-md:gap-3 items-center w-full">
                        <h1 class="text-4xl font-bold">Endpoints</h1>
                        <div class="flex gap-2 self-end text-right ml-auto items-center *:rounded-2xl">
                            <A
                                class="btn text-sm self-end text-right ml-auto"
                                href="/endpoints/new"
                            >
                                <span class="material-symbols-outlined md:hidden!">
                                    add
                                </span>
                                <span class="not-md:hidden">
                                    Create new endpoint
                                </span>
                            </A>
                            <SearchButton
                                search={[get_search, set_search]}
                            ></SearchButton>
                            <button
                                class="btn text-sm self-end text-right ml-auto"
                                onClick={refetch}
                            >
                                <span class="material-symbols-outlined">
                                    refresh
                                </span>
                            </button>
                            <div
                                class="py-2 btn btn-ghost bg-base-200 border border-base-300 flex items-baseline-last gap-2"
                                onClick={(_) => {
                                    set_full_data(!get_full_data());
                                }}
                            >
                                <span
                                    class="text-xs text-blue-900 dark:text-blue-500 font-semibold self-center"
                                    classList={{
                                        "text-red-500!": get_full_data(),
                                    }}
                                >
                                    {get_full_data()
                                        ? "Full data"
                                        : "Reduced data"}
                                </span>
                                <input
                                    id="table-mode"
                                    type="checkbox"
                                    class="toggle"
                                    checked={get_full_data()}
                                />
                            </div>
                        </div>
                    </div>

                    <AlertBox
                        alert_signals={[get_alert, set_alert]}
                        hide_timeout={!get_alert()?.is_error ? 5000 : undefined}
                    ></AlertBox>
                </div>

                <Show
                    when={!endpoints.loading}
                    fallback={
                        <div class="flex w-full my-8 justify-center">
                            <span class="loading loading-spinner loading-xl"></span>
                        </div>
                    }
                >
                    <Modal parent_path="/endpoints">{props.children}</Modal>

                    <div
                        class="overflow-x-auto transition-all transition-discrete duration-500 starting:opacity-0 starting:scale-95"
                        ref={table_container}
                    >
                        <div class="table text-sm table-auto border-collapse">
                            <div class="table-header-group border-b-2 border-b-base-300">
                                <div class="table-row font-bold bg-base-300 [&>div]:w-auto [&>div]:p-3 [&_div]:align-middle [&>div]:text-left [&>div]:rounded-none">
                                    <div class="table-cell rounded-tl-xl!"></div>
                                    <SortableColumnCell
                                        title="ID"
                                        field="id"
                                        table_sort={[
                                            get_table_sort,
                                            set_table_sort,
                                        ]}
                                    />
                                    <SortableColumnCell
                                        title="Route"
                                        field="route"
                                        table_sort={[
                                            get_table_sort,
                                            set_table_sort,
                                        ]}
                                    />
                                    <SortableColumnCell
                                        title="Description"
                                        field="description"
                                        classList={{
                                            "hidden!": !get_full_data(),
                                        }}
                                        table_sort={[
                                            get_table_sort,
                                            set_table_sort,
                                        ]}
                                    />
                                    <div class="table-cell">Version</div>
                                    <div class="table-cell">Method</div>
                                    <div
                                        class="table-cell"
                                        classList={{
                                            "hidden!": !get_full_data(),
                                        }}
                                    >
                                        Query params
                                    </div>
                                    <div class="table-cell">Body params</div>
                                    <div
                                        class="table-cell"
                                        classList={{
                                            "hidden!": !get_full_data(),
                                        }}
                                    >
                                        Queries
                                    </div>
                                    <div class="table-cell">Requires auth</div>
                                    <div
                                        class="table-cell"
                                        classList={{
                                            "rounded-tr-xl!": !get_full_data(),
                                        }}
                                    >
                                        Allowed roles
                                    </div>
                                    <div
                                        class="table-cell"
                                        classList={{
                                            "hidden!": !get_full_data(),
                                        }}
                                    >
                                        Injects auth metadata
                                    </div>
                                    <div
                                        class="table-cell"
                                        classList={{
                                            "hidden!": !get_full_data(),
                                        }}
                                    >
                                        Auto-generated
                                    </div>
                                    <div
                                        class="table-cell rounded-tr-xl!"
                                        classList={{
                                            "hidden!": !get_full_data(),
                                        }}
                                    >
                                        Path
                                    </div>
                                </div>
                            </div>
                            <div class="table-row-group [&>div:nth-of-type(even)]:bg-base-200 [&>div]:hover:bg-base-300/80! [&>div]:transition [&>div]:duration-200 [&>div]:hover:scale-101 [&>div]:hover:cursor-pointer">
                                <Index
                                    each={endpoints_list()}
                                    fallback={
                                        <Portal mount={table_container!}>
                                            <div class="flex my-8 justify-center items-center text-center">
                                                <p class="text-sm font-light">
                                                    No endpoints found with
                                                    matching criteria.
                                                </p>
                                            </div>
                                        </Portal>
                                    }
                                >
                                    {(endpoint, ix) => (
                                        <>
                                            <div
                                                class="table-row border-b border-b-base-300 [&_span]:text-xs [&_span]:md:text-sm [&_div]:size-auto [&_div]:p-2 [&_div]:align-middle"
                                                // @ts-ignore
                                                popovertarget={`endpoint-row-${ix}-dropdown`}
                                                style={`anchor-name:--endpoint-row-${ix}`}
                                                onPointerDown={(event) => {
                                                    const target =
                                                        event.currentTarget;

                                                    const any_open_popover =
                                                        document.querySelector(
                                                            ".dropdown:popover-open",
                                                        );
                                                    if (
                                                        any_open_popover !==
                                                        null
                                                    ) {
                                                        target.setAttribute(
                                                            "block_popover",
                                                            "true",
                                                        );
                                                    }
                                                }}
                                                onClick={(event) => {
                                                    const target =
                                                        event.currentTarget;

                                                    const block_popover =
                                                        target.getAttribute(
                                                            "block_popover",
                                                        ) === "true";

                                                    target.removeAttribute(
                                                        "block_popover",
                                                    );

                                                    if (block_popover) return;

                                                    const dropdown =
                                                        target.nextSibling as HTMLUListElement;

                                                    dropdown.togglePopover();
                                                }}
                                            >
                                                <div class="table-cell font-light pl-8! align-middle">
                                                    {ix}
                                                </div>
                                                <div class="table-cell font-black">
                                                    {endpoint().endpoint.id}
                                                </div>
                                                <div class="table-cell font-mono">
                                                    {endpoint().endpoint.route}
                                                </div>
                                                <div
                                                    class="table-cell"
                                                    classList={{
                                                        "hidden!":
                                                            !get_full_data(),
                                                    }}
                                                >
                                                    {endpoint().endpoint
                                                        .description ?? "—"}
                                                </div>
                                                <div class="table-cell font-mono">
                                                    {
                                                        endpoint().endpoint
                                                            .version
                                                    }
                                                </div>
                                                <div
                                                    class="table-cell text-cyan-500"
                                                    classList={{
                                                        "text-green-500!":
                                                            endpoint()
                                                                .endpoint.method.toLowerCase()
                                                                .includes(
                                                                    "get",
                                                                ),
                                                        "text-red-500!":
                                                            endpoint()
                                                                .endpoint.method.toLowerCase()
                                                                .includes(
                                                                    "delete",
                                                                ),
                                                    }}
                                                >
                                                    {endpoint().endpoint.method}
                                                </div>
                                                <div
                                                    class="table-cell font-mono"
                                                    classList={{
                                                        "hidden!":
                                                            !get_full_data(),
                                                    }}
                                                >
                                                    {endpoint().endpoint
                                                        .query_params
                                                        ? endpoint().endpoint.query_params.join(
                                                              ", ",
                                                          )
                                                        : "—"}
                                                </div>
                                                <div class="table-cell font-mono">
                                                    {endpoint().endpoint
                                                        .body_params
                                                        ? endpoint().endpoint.body_params.join(
                                                              ", ",
                                                          )
                                                        : "—"}
                                                </div>
                                                <div
                                                    class="table-cell"
                                                    classList={{
                                                        "hidden!":
                                                            !get_full_data(),
                                                    }}
                                                >
                                                    {
                                                        // @ts-ignore
                                                        (): Element => {
                                                            const [
                                                                formatted_sql,
                                                                set_formatted_sql,
                                                            ] =
                                                                createSignal<string>(
                                                                    "—",
                                                                );

                                                            createEffect(
                                                                async () => {
                                                                    set_formatted_sql(
                                                                        await sql_grammar()?.highlight(
                                                                            endpoint()
                                                                                .endpoint
                                                                                .execute !==
                                                                                null
                                                                                ? endpoint()
                                                                                      .endpoint.execute!.queries!.map(
                                                                                          (
                                                                                              query,
                                                                                          ) =>
                                                                                              query.query,
                                                                                      )
                                                                                      .join(
                                                                                          ";\n",
                                                                                      )
                                                                                : "—",
                                                                        )!,
                                                                    );
                                                                },
                                                            );

                                                            return (
                                                                <>
                                                                    <Show
                                                                        when={
                                                                            !sql_grammar.loading &&
                                                                            formatted_sql() !==
                                                                                undefined
                                                                        }
                                                                    >
                                                                        <span
                                                                            class="font-mono"
                                                                            innerHTML={
                                                                                formatted_sql() as string
                                                                            }
                                                                        ></span>
                                                                    </Show>
                                                                </>
                                                            ) as Element;
                                                        }
                                                    }
                                                </div>
                                                <div
                                                    class="table-cell"
                                                    classList={{
                                                        "text-success":
                                                            endpoint().endpoint
                                                                .require_auth,
                                                        "text-error":
                                                            !endpoint().endpoint
                                                                .require_auth,
                                                    }}
                                                >
                                                    {endpoint().endpoint
                                                        .require_auth
                                                        ? "Yes"
                                                        : "No"}
                                                </div>
                                                <div class="table-cell font-mono">
                                                    {endpoint().endpoint
                                                        .allowed_roles
                                                        ? endpoint().endpoint.allowed_roles.join(
                                                              ", ",
                                                          )
                                                        : "—"}
                                                </div>
                                                <div
                                                    class="table-cell"
                                                    classList={{
                                                        "hidden!":
                                                            !get_full_data(),
                                                        "text-success":
                                                            endpoint().endpoint
                                                                .inject_auth_metadata,
                                                        "text-error":
                                                            !endpoint().endpoint
                                                                .inject_auth_metadata,
                                                    }}
                                                >
                                                    {endpoint().endpoint
                                                        .inject_auth_metadata
                                                        ? "Yes"
                                                        : "No"}
                                                </div>
                                                <div
                                                    class="table-cell"
                                                    classList={{
                                                        "hidden!":
                                                            !get_full_data(),
                                                        "text-success":
                                                            endpoint().endpoint
                                                                .auto_generated,
                                                        "text-error":
                                                            !endpoint().endpoint
                                                                .auto_generated,
                                                    }}
                                                >
                                                    {endpoint().endpoint
                                                        .auto_generated
                                                        ? "Yes"
                                                        : "No"}
                                                </div>
                                                <div
                                                    class="table-cell font-mono pr-4!"
                                                    classList={{
                                                        "hidden!":
                                                            !get_full_data(),
                                                    }}
                                                >
                                                    {endpoint().path ?? "—"}
                                                </div>
                                            </div>
                                            <ul
                                                id={`endpoint-row-${ix}-dropdown`}
                                                class="dropdown menu w-1/4 rounded-box bg-base-200/25 border-base-300 border backdrop-blur-sm backdrop-brightness-110 shadow-lg opacity-0 [&:popover-open]:opacity-100 starting:opacity-0 transition-all transition-discrete duration-200"
                                                classList={{
                                                    hidden:
                                                        resolved_children() !==
                                                        undefined,
                                                }}
                                                style={`position-anchor:--endpoint-row-${ix}; inset: auto; align-self: anchor-center; justify-self: anchor-left; margin: 0.5rem;`}
                                                onClick={(event) =>
                                                    (
                                                        event.currentTarget as HTMLUListElement
                                                    ).togglePopover()
                                                }
                                                onMouseLeave={(event) =>
                                                    (
                                                        event.currentTarget as HTMLUListElement
                                                    ).togglePopover()
                                                }
                                                popover
                                            >
                                                <li>
                                                    <button
                                                        onClick={(_) => {
                                                            navigate(
                                                                `/endpoints/${endpoint().endpoint.id}/modify`,
                                                                {
                                                                    replace: false,
                                                                    scroll: false,
                                                                },
                                                            );
                                                        }}
                                                    >
                                                        <span class="material-symbols-outlined scale-90">
                                                            data_object
                                                        </span>
                                                        <span class="font-bold">
                                                            Modify
                                                        </span>
                                                    </button>
                                                </li>

                                                <li>
                                                    <button
                                                        onClick={(_) => {
                                                            navigate(
                                                                `/endpoints/${endpoint().endpoint.id}/test`,
                                                                {
                                                                    replace: false,
                                                                    scroll: false,
                                                                },
                                                            );
                                                        }}
                                                    >
                                                        <span class="material-symbols-outlined scale-90">
                                                            science
                                                        </span>
                                                        <span class="font-bold">
                                                            Test
                                                        </span>
                                                    </button>
                                                </li>
                                            </ul>
                                        </>
                                    )}
                                </Index>
                            </div>
                        </div>
                    </div>
                </Show>
            </div>
        </>
    );
};
