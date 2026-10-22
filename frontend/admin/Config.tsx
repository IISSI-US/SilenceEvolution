// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import { setup_status } from "@admin/Session";
import AlertBox, { type AlertStruct } from "@admin/components/AlertContainer";

import {
    children,
    createEffect,
    createResource,
    createSignal,
    on,
    Show,
    type ResourceReturn,
} from "solid-js";

import { type RouteSectionProps } from "@solidjs/router";

import { pipe, entries, find } from "remeda";

export type ConfigContext = ResourceReturn<ConfigStruct, any>;

export interface ConfigStruct {
    listening_addr: string;
    serve_static_files: boolean;
    internal_params: {
        users_target_table: string;
        sessions_target_table: string;
        roles_target_table: string;
    };
    skip_endpoints_ids: Array<string>;
    databases_conn: {
        main: DatabaseConn;
        internal: DatabaseConn;
    };
}

export interface DatabaseConn {
    host: string;
    username: string;
    password: string;
    db: string;
}

export const fetcher = async (): Promise<ConfigStruct> => {
    // Until the databases are connected the settings are served by the setup API.
    const { connected } = await setup_status();
    const res = await fetch(
        connected ? "/api/internal/admin/config" : "/_setup/config",
    );

    if (!res.ok) console.clear();

    if (res.status === 200) {
        const data = await res.json();
        return data as ConfigStruct;
    } else {
        throw new Error("Couldn't load project's config.");
    }
};

export default (props: RouteSectionProps) => {
    const [get_alert, set_alert] = createSignal<AlertStruct | undefined>(
        undefined,
    );

    // Load config.
    const [config, { refetch }] = createResource(
        async (): Promise<ConfigStruct> => {
            const res = await fetch("/api/internal/admin/config");

            if (!res.ok) console.clear();

            if (res.status === 200) {
                const data = (await res.json()) as ConfigStruct;

                return data;
            } else {
                return {} as ConfigStruct;
            }
        },
    );

    const update_config = async () => {
        const form = document.getElementById("form")! as HTMLFormElement;

        const form_data = Object.fromEntries(new FormData(form));

        const req = {
            listening_addr: form_data["listening_addr"]
                ?.toString()
                .toLowerCase(),
            serve_static_files:
                form_data["serve_static_files"]?.toString() == "on"
                    ? true
                    : false,
            internal_params: {
                users_target_table: form_data["users_target_table"]
                    ?.toString()
                    .toLowerCase(),
                sessions_target_table: form_data["sessions_target_table"]
                    ?.toString()
                    .toLowerCase(),
                roles_target_table: form_data["roles_target_table"]
                    ?.toString()
                    .toLowerCase(),
            },
            skip_endpoints_ids: Array.from(
                (form_data["skip_endpoints_ids"]?.toString() as string)
                    .replaceAll(" ", "")
                    .split(",")
                    .filter((val) => val.length !== 0),
            ),
            databases_conn: {
                main: {
                    host: form_data["db_host"]?.toString().toLowerCase(),
                    username: form_data["db_username"]
                        ?.toString()
                        .toLowerCase(),
                    password: form_data["db_password"]
                        ?.toString()
                        .toLowerCase(),
                    db: form_data["db_name"]?.toString().toLowerCase(),
                },
                internal: {
                    host: form_data["internal_db_host"]
                        ?.toString()
                        .toLowerCase(),
                    username: form_data["internal_db_username"]
                        ?.toString()
                        .toLowerCase(),
                    password: form_data["internal_db_password"]
                        ?.toString()
                        .toLowerCase(),
                    db: form_data["internal_db_name"]?.toString().toLowerCase(),
                },
            },
        } as ConfigStruct;

        if (
            pipe(
                req.databases_conn.internal,
                entries,
                find(([_, value]) => value === undefined || value.length === 0),
                Boolean,
            )
        ) {
            // @ts-ignore
            delete req.databases_conn["internal"];
        }

        for (const field in req) {
            const value = req[field as keyof ConfigStruct];
            if (
                value === undefined ||
                (!Array.isArray(value) && (value as string).length === 0)
            )
                delete req[field as keyof ConfigStruct];
        }

        const res = await fetch(`/api/internal/admin/config`, {
            method: "put",
            body: JSON.stringify(req),
        });

        if (!res.ok) {
            console.clear();

            const data = (await res.json()) as {
                error: string;
            };

            set_alert({ value: data.error, is_error: true });

            return;
        }

        refetch();
    };

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
        set_alert({
            value: "Some changes may require a manual server restart.",
        });
    });

    return (
        <>
            <div>
                <div class="flex items-center w-full">
                    <h1 class="text-4xl font-bold">Config</h1>
                </div>
                <Show when={!config.loading}>
                    <div class="grid gap gap-2 py-3">
                        <AlertBox
                            alert_signals={[get_alert, set_alert]}
                            hide_timeout={
                                !get_alert()?.is_error ? 5000 : undefined
                            }
                        ></AlertBox>

                        <form
                            id="form"
                            class="[&_span]:mb-1"
                            onInput={(event) => {
                                set_alert(undefined);

                                let form = event.currentTarget;
                                let submit = document.getElementById("submit");

                                if (form.checkValidity()) {
                                    submit?.classList.remove("btn-disabled");
                                } else submit?.classList.add("btn-disabled");
                            }}
                        >
                            <fieldset class="fieldset [&_.input]:w-full lg:grid-cols-2 gap-3">
                                <label>
                                    <span class="label">
                                        Server listening address
                                    </span>
                                    <input
                                        name="name"
                                        type="text"
                                        class="input"
                                        placeholder={config()?.listening_addr}
                                        value={config()?.listening_addr}
                                    />
                                </label>

                                <label>
                                    <span class="label">
                                        Skip endpoints IDs
                                    </span>
                                    <input
                                        name="skip_endpoints_ids"
                                        type="text"
                                        class="input"
                                        value={
                                            config()?.skip_endpoints_ids
                                                ? (
                                                      config()
                                                          ?.skip_endpoints_ids ?? [
                                                          "",
                                                      ]
                                                  ).join(", ")
                                                : ""
                                        }
                                        placeholder="—"
                                    />
                                </label>
                            </fieldset>

                            <details
                                class="collapse bg-base-100 border border-base-300 rounded-box mt-3 my-1"
                                open
                            >
                                <summary class="collapse-title font-semibold transition duration-200 hover:bg-base-300">
                                    Database
                                </summary>
                                <div class="collapse-content">
                                    <fieldset class="fieldset [&_.input]:w-full lg:grid-cols-3 gap-3">
                                        <label>
                                            <span class="label">Host</span>
                                            <input
                                                name="db_host"
                                                type="text"
                                                class="input"
                                                placeholder={
                                                    config()?.databases_conn
                                                        .main.host
                                                }
                                                value={
                                                    config()?.databases_conn
                                                        .main.host
                                                }
                                            />
                                        </label>

                                        <label>
                                            <span class="label">Name</span>
                                            <input
                                                name="db_name"
                                                type="text"
                                                class="input"
                                                placeholder={
                                                    config()?.databases_conn
                                                        .main.db
                                                }
                                                value={
                                                    config()?.databases_conn
                                                        .main.db
                                                }
                                            />
                                        </label>

                                        <label>
                                            <span class="label">Username</span>
                                            <input
                                                name="db_username"
                                                type="text"
                                                class="input"
                                                placeholder={
                                                    config()?.databases_conn
                                                        .main.username
                                                }
                                                value={
                                                    config()?.databases_conn
                                                        .main.username
                                                }
                                            />
                                        </label>

                                        <label>
                                            <span class="label">Password</span>
                                            <input
                                                name="db_password"
                                                type="text"
                                                class="input"
                                                placeholder={
                                                    config()?.databases_conn
                                                        .main.password
                                                }
                                                value={
                                                    config()?.databases_conn
                                                        .main.password
                                                }
                                            />
                                        </label>
                                    </fieldset>
                                </div>
                            </details>

                            <details
                                class="collapse bg-base-100 border border-base-300 rounded-box mt-3 my-1"
                                open
                            >
                                <summary class="collapse-title font-semibold transition duration-200 hover:bg-base-300">
                                    Internal database
                                </summary>
                                <div class="collapse-content">
                                    <fieldset class="fieldset [&_.input]:w-full lg:grid-cols-3 gap-3">
                                        <label>
                                            <span class="label">Host</span>
                                            <input
                                                name="internal_db_host"
                                                type="text"
                                                class="input"
                                                placeholder={
                                                    config()?.databases_conn
                                                        .internal !== null
                                                        ? config()
                                                              ?.databases_conn
                                                              .internal!.host
                                                        : "—"
                                                }
                                                value={
                                                    config()?.databases_conn
                                                        .internal !== null
                                                        ? config()
                                                              ?.databases_conn
                                                              .internal!.host
                                                        : ""
                                                }
                                            />
                                        </label>

                                        <label>
                                            <span class="label">Name</span>
                                            <input
                                                name="internal_db_name"
                                                type="text"
                                                class="input"
                                                placeholder={
                                                    config()?.databases_conn
                                                        .internal !== null
                                                        ? config()
                                                              ?.databases_conn
                                                              .internal!.db
                                                        : "—"
                                                }
                                                value={
                                                    config()?.databases_conn
                                                        .internal !== null
                                                        ? config()
                                                              ?.databases_conn
                                                              .internal!.db
                                                        : ""
                                                }
                                            />
                                        </label>

                                        <label>
                                            <span class="label">Username</span>
                                            <input
                                                name="internal_db_username"
                                                type="text"
                                                class="input"
                                                placeholder={
                                                    config()?.databases_conn
                                                        .internal !== null
                                                        ? config()
                                                              ?.databases_conn
                                                              .internal!
                                                              .username
                                                        : "—"
                                                }
                                                value={
                                                    config()?.databases_conn
                                                        .internal !== null
                                                        ? config()
                                                              ?.databases_conn
                                                              .internal!
                                                              .username
                                                        : ""
                                                }
                                            />
                                        </label>

                                        <label>
                                            <span class="label">Password</span>
                                            <input
                                                name="internal_db_password"
                                                type="text"
                                                class="input"
                                                placeholder={
                                                    config()?.databases_conn
                                                        .internal !== null
                                                        ? config()
                                                              ?.databases_conn
                                                              .internal!
                                                              .password
                                                        : "—"
                                                }
                                                value={
                                                    config()?.databases_conn
                                                        .internal !== null
                                                        ? config()
                                                              ?.databases_conn
                                                              .internal!
                                                              .password
                                                        : ""
                                                }
                                            />
                                        </label>
                                    </fieldset>

                                    <details class="collapse bg-base-100 border border-base-300 rounded-box mt-3 my-1">
                                        <summary class="collapse-title font-semibold transition duration-200 hover:bg-base-300">
                                            Internal tables
                                        </summary>
                                        <div class="collapse-content">
                                            <fieldset class="fieldset [&_.input]:w-full lg:grid-cols-3 gap-3">
                                                <label>
                                                    <span class="label">
                                                        User's target table
                                                    </span>
                                                    <input
                                                        name="users_target_table"
                                                        type="text"
                                                        class="input"
                                                        placeholder={
                                                            config()
                                                                ?.internal_params
                                                                .users_target_table
                                                        }
                                                        value={
                                                            config()
                                                                ?.internal_params
                                                                .users_target_table
                                                        }
                                                    />
                                                </label>

                                                <label>
                                                    <span class="label">
                                                        Session's target table
                                                    </span>
                                                    <input
                                                        name="sessions_target_table"
                                                        type="text"
                                                        class="input"
                                                        placeholder={
                                                            config()
                                                                ?.internal_params
                                                                .sessions_target_table
                                                        }
                                                        value={
                                                            config()
                                                                ?.internal_params
                                                                .sessions_target_table
                                                        }
                                                    />
                                                </label>

                                                <label>
                                                    <span class="label">
                                                        Role's target table
                                                    </span>
                                                    <input
                                                        name="roles_target_table"
                                                        type="text"
                                                        class="input"
                                                        placeholder={
                                                            config()
                                                                ?.internal_params
                                                                .roles_target_table
                                                        }
                                                        value={
                                                            config()
                                                                ?.internal_params
                                                                .roles_target_table
                                                        }
                                                    />
                                                </label>
                                            </fieldset>
                                        </div>
                                    </details>
                                </div>
                            </details>

                            <label class="align-middle">
                                <span class="label mr-2 py-4">
                                    Serve static files
                                </span>
                                <input
                                    name="serve_static_files"
                                    type="checkbox"
                                    class="checkbox"
                                    checked={config()?.serve_static_files}
                                />
                            </label>
                        </form>
                        <div class="flex gap-2 [&_button]:rounded-xl [&_button]:hover:shadow">
                            <button
                                id="submit"
                                type="submit"
                                class="btn hover:btn-success btn-disabled"
                                onClick={update_config}
                            >
                                Update
                            </button>
                        </div>
                    </div>
                </Show>
            </div>
        </>
    );
};
