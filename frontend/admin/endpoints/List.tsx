// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import AppCx from "@admin/AppCx";
import { type Endpoint, type EndpointByFile } from "@admin/endpoints";

import SubPage from "@admin/components/SubPage";
import Dialog from "@admin/components/Dialog";
import AlertBox, { type AlertStruct } from "@admin/components/AlertContainer";
import SearchButton from "@admin/components/SearchButton";
import { SortableColumnCell } from "@admin/components/List";

import {
    children,
    createEffect,
    createMemo,
    createResource,
    createSignal,
    For,
    Index,
    on,
    Show,
    useContext,
} from "solid-js";

import { Portal } from "solid-js/web";

import {
    A,
    useLocation,
    useNavigate,
    type RouteSectionProps,
} from "@solidjs/router";

import { filter, pipe, sortBy } from "remeda";

import { loadGrammar } from "@arborium/arborium";
import Icon from "@admin/components/Icon";

export default (props: RouteSectionProps) => {
    const app_cx = useContext(AppCx)!;

    const [endpoints, { refetch }] = app_cx.get_resource("endpoints");
    const [users] = app_cx.get_resource("users");

    // Roles offered in the grid: the users' roles plus those already used by endpoints.
    const known_roles = createMemo(() =>
        [
            ...new Set([
                ...(users() ?? []).map((user) => user.role ?? ""),
                ...(endpoints() ?? []).flatMap(
                    (entry) => entry.endpoint.allowed_roles ?? [],
                ),
            ]),
        ]
            .filter((role) => role.length > 0)
            .sort(),
    );

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

    // Internal endpoints (Silence's own API) can't be modified.
    const is_editable = (entry: EndpointByFile) =>
        entry.path !== null ||
        (entry.endpoint.execute !== null &&
            !(entry.endpoint.version ?? "").startsWith("internal"));

    /** Saves a change of an endpoint's access from the grid. */
    const update_endpoint = async (
        entry: EndpointByFile,
        patch: Partial<Endpoint>,
    ) => {
        const res = await fetch(
            `/api/internal/admin/endpoints/${entry.endpoint.id}`,
            {
                method: "PUT",
                headers: { "Cache-Control": "no-cache" },
                body: JSON.stringify(patch),
            },
        );

        if (res.ok) {
            set_alert({
                value:
                    entry.path === null
                        ? `Endpoint ${entry.endpoint.id} updated; as it was generated from the database, it's now saved in endpoints/default.json.`
                        : `Endpoint ${entry.endpoint.id} updated.`,
            });
        } else {
            const body = (await res.json().catch(() => ({}))) as {
                error?: string;
            };
            set_alert({
                value: body.error ?? "Cannot update the endpoint.",
                is_error: true,
            });
        }

        refetch();
    };

    /** Saves the roles chosen in the grid (`value`: a role, several comma separated, or ""). */
    const save_roles = (entry: EndpointByFile, text: string) => {
        const roles = text
            .split(",")
            .map((role) => role.trim())
            .filter((role) => role.length > 0);

        const current = entry.endpoint.allowed_roles ?? [];

        // A role can only be checked for an authenticated user: choosing one requires auth.
        if (roles.join(",") !== current.join(","))
            update_endpoint(entry, {
                allowed_roles: roles,
                ...(roles.length > 0 ? { require_auth: true } : {}),
            });
    };

    // `Load endpoints`: discovers the database's schema and (re)loads the generated endpoints.
    const [loading_endpoints, set_loading_endpoints] = createSignal(false);

    const load_endpoints = async () => {
        set_loading_endpoints(true);

        const res = await fetch("/api/internal/admin/endpoints/load", {
            method: "POST",
        });
        const body = (await res.json().catch(() => ({}))) as {
            loaded?: number;
            error?: string;
        };

        set_alert(
            res.ok
                ? {
                      value: `Loaded ${body.loaded} endpoints from the database.`,
                  }
                : {
                      value: body.error ?? "Cannot load the endpoints.",
                      is_error: true,
                  },
        );

        set_loading_endpoints(false);
        refetch();
    };

    // A sub-route (edit, test...) is shown as a full page that replaces the list.
    const sub_page = children(() => props.children);

    // Testing an endpoint opens a modal over the list; editing replaces the list with a page.
    const location = useLocation();
    const is_test = () => location.pathname.endsWith("/test");

    return (
        <>
            <Show when={sub_page() !== undefined && !is_test()}>
                <SubPage parent_path="/endpoints" parent_title="Endpoints">
                    {sub_page()}
                </SubPage>
            </Show>
            <Show when={sub_page() !== undefined && is_test()}>
                <Dialog parent_path="/endpoints">{sub_page()}</Dialog>
            </Show>
            <div classList={{ hidden: sub_page() !== undefined && !is_test() }}>
                <div class="flex flex-col gap-3 pb-3 items-center w-full">
                    <div class="flex not-lg:flex-col not-lg:gap-3 items-center w-full">
                        <h1 class="text-4xl font-bold">Endpoints</h1>
                        <div class="flex gap-2 self-end text-right ml-auto items-center">
                            <button
                                class="btn text-sm"
                                disabled={loading_endpoints()}
                                onClick={load_endpoints}
                            >
                                <Icon name="refresh" class="lg:hidden!" />
                                <span class="not-lg:hidden">
                                    Load endpoints
                                </span>
                            </button>
                            <A
                                class="btn text-sm self-end text-right ml-auto"
                                href="/endpoints/new"
                            >
                                <Icon name="plus" class="lg:hidden!" />
                                <span class="not-lg:hidden">
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
                                <Icon name="refresh" />
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
                                    <div
                                        class="table-cell"
                                        classList={{
                                            "hidden!": !get_full_data(),
                                        }}
                                    >
                                        Version
                                    </div>
                                    <div class="table-cell">Method</div>
                                    <div
                                        class="table-cell"
                                        classList={{
                                            "hidden!": !get_full_data(),
                                        }}
                                    >
                                        Query params
                                    </div>
                                    <div
                                        class="table-cell"
                                        classList={{
                                            "hidden!": !get_full_data(),
                                        }}
                                    >
                                        Body params
                                    </div>
                                    <div
                                        class="table-cell"
                                        classList={{
                                            "hidden!": !get_full_data(),
                                        }}
                                    >
                                        Queries
                                    </div>
                                    <div class="table-cell">Requires auth</div>
                                    <div class="table-cell">Allowed roles</div>
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
                                        class="table-cell"
                                        classList={{
                                            "hidden!": !get_full_data(),
                                        }}
                                    >
                                        Path
                                    </div>
                                    <div class="table-cell rounded-tr-xl!"></div>
                                </div>
                            </div>
                            <div class="table-row-group [&>div:nth-of-type(even)]:bg-base-200 [&>div]:hover:bg-base-300! [&>div]:transition [&>div]:duration-200 [&>div]:hover:scale-101 [&>div]:hover:cursor-pointer">
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
                                                class="table-row border-b border-b-base-300 [&_span]:text-xs [&_span]:lg:text-sm [&_div]:size-auto [&_div]:p-2 [&_div]:align-middle"
                                                onClick={() =>
                                                    navigate(
                                                        `/endpoints/${endpoint().endpoint.id}/modify`,
                                                        {
                                                            replace: false,
                                                            scroll: false,
                                                        },
                                                    )
                                                }
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
                                                <div
                                                    class="table-cell font-mono"
                                                    classList={{
                                                        "hidden!":
                                                            !get_full_data(),
                                                    }}
                                                >
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
                                                <div
                                                    class="table-cell font-mono"
                                                    classList={{
                                                        "hidden!":
                                                            !get_full_data(),
                                                    }}
                                                >
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
                                                {/* Access is edited in place (saved on change). */}
                                                <div
                                                    class="table-cell"
                                                    onClick={(event) =>
                                                        event.stopPropagation()
                                                    }
                                                >
                                                    <input
                                                        type="checkbox"
                                                        class="toggle toggle-sm toggle-success"
                                                        title="Requires authentication"
                                                        checked={
                                                            endpoint().endpoint
                                                                .require_auth
                                                        }
                                                        disabled={
                                                            !is_editable(
                                                                endpoint(),
                                                            )
                                                        }
                                                        onChange={(event) =>
                                                            update_endpoint(
                                                                endpoint(),
                                                                {
                                                                    require_auth:
                                                                        event
                                                                            .currentTarget
                                                                            .checked,
                                                                },
                                                            )
                                                        }
                                                    />
                                                </div>
                                                <div
                                                    class="table-cell font-mono"
                                                    onClick={(event) =>
                                                        event.stopPropagation()
                                                    }
                                                >
                                                    <select
                                                        class="select select-xs w-36 font-mono"
                                                        title="Allowed roles"
                                                        disabled={
                                                            !is_editable(
                                                                endpoint(),
                                                            )
                                                        }
                                                        onChange={(event) =>
                                                            save_roles(
                                                                endpoint(),
                                                                event
                                                                    .currentTarget
                                                                    .value,
                                                            )
                                                        }
                                                    >
                                                        <option
                                                            value=""
                                                            selected={
                                                                (
                                                                    endpoint()
                                                                        .endpoint
                                                                        .allowed_roles ??
                                                                    []
                                                                ).length === 0
                                                            }
                                                        >
                                                            any role
                                                        </option>
                                                        {/* Several roles (set in the editor) are kept as one option. */}
                                                        <Show
                                                            when={
                                                                (
                                                                    endpoint()
                                                                        .endpoint
                                                                        .allowed_roles ??
                                                                    []
                                                                ).length > 1
                                                            }
                                                        >
                                                            <option
                                                                value={endpoint().endpoint.allowed_roles.join(
                                                                    ",",
                                                                )}
                                                                selected
                                                            >
                                                                {endpoint().endpoint.allowed_roles.join(
                                                                    ", ",
                                                                )}
                                                            </option>
                                                        </Show>
                                                        <For
                                                            each={known_roles()}
                                                        >
                                                            {(role) => (
                                                                <option
                                                                    value={role}
                                                                    selected={
                                                                        (
                                                                            endpoint()
                                                                                .endpoint
                                                                                .allowed_roles ??
                                                                            []
                                                                        )
                                                                            .length ===
                                                                            1 &&
                                                                        endpoint()
                                                                            .endpoint
                                                                            .allowed_roles[0] ===
                                                                            role
                                                                    }
                                                                >
                                                                    {role}
                                                                </option>
                                                            )}
                                                        </For>
                                                    </select>
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
                                                <div class="table-cell pr-4!">
                                                    <button
                                                        class="btn btn-xs"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            navigate(
                                                                `/endpoints/${endpoint().endpoint.id}/test`,
                                                                {
                                                                    replace: false,
                                                                    scroll: false,
                                                                },
                                                            );
                                                        }}
                                                    >
                                                        <Icon
                                                            name="tests"
                                                            class="size-4"
                                                        />
                                                        Test
                                                    </button>
                                                </div>
                                            </div>
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
