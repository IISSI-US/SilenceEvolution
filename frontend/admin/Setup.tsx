// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

import { createResource, createSignal, Show } from "solid-js";

import type { ConfigStruct, DatabaseConn } from "@admin/Config";

/**
 * Setup page, shown while the databases aren't connected (e.g. after `silence run` in an empty
 * directory): saves the connections and connects. Once connected, the page reloads and the rest of
 * the panel (users, endpoints, tests) becomes available.
 */
export default (props: { error?: string | null | undefined }) => {
    const [config] = createResource(async () => {
        const res = await fetch("/_setup/config", { cache: "no-store" });
        return (await res.json()) as ConfigStruct;
    });

    const [error, set_error] = createSignal<string | null | undefined>(
        props.error,
    );
    const [busy, set_busy] = createSignal(false);
    const [separate_internal, set_separate_internal] = createSignal<
        boolean | undefined
    >(undefined);

    const use_internal = () =>
        separate_internal() ?? config()?.databases_conn.internal != null;

    const read_connection = (form: FormData, prefix: string): DatabaseConn => ({
        host: String(form.get(`${prefix}_host`) ?? "").trim(),
        db: String(form.get(`${prefix}_db`) ?? "").trim(),
        username: String(form.get(`${prefix}_username`) ?? "").trim(),
        password: String(form.get(`${prefix}_password`) ?? ""),
    });

    const submit = async (event: SubmitEvent) => {
        event.preventDefault();

        const form = new FormData(event.currentTarget as HTMLFormElement);

        set_busy(true);
        set_error(null);

        const databases_conn = {
            main: read_connection(form, "main"),
            internal: use_internal() ? read_connection(form, "internal") : null,
        };

        const saved = await fetch("/_setup/config", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ databases_conn }),
        });

        if (!saved.ok) {
            set_error(((await saved.json()) as { error: string }).error);
            set_busy(false);
            return;
        }

        const connected = await fetch("/_setup/connect", { method: "POST" });

        if (connected.ok) {
            // Reload so that every section loads its data now that the databases are connected.
            location.reload();
        } else {
            set_error(((await connected.json()) as { error: string }).error);
            set_busy(false);
        }
    };

    const connection_fields = (
        title: string,
        prefix: string,
        connection: () => DatabaseConn | null | undefined,
    ) => (
        <fieldset class="fieldset bg-base-100 border border-base-300 rounded-box p-4">
            <legend class="fieldset-legend">{title}</legend>
            <div class="grid grid-cols-1 lg:grid-cols-4 gap-3">
                <label>
                    <span class="label">Host (IP:port)</span>
                    <input
                        name={`${prefix}_host`}
                        class="input"
                        required
                        pattern="^(\d{1,3}\.){3}\d{1,3}:\d{1,5}$"
                        value={connection()?.host ?? "127.0.0.1:3306"}
                    />
                </label>
                <label>
                    <span class="label">Database</span>
                    <input
                        name={`${prefix}_db`}
                        class="input"
                        required
                        value={connection()?.db ?? ""}
                    />
                </label>
                <label>
                    <span class="label">User</span>
                    <input
                        name={`${prefix}_username`}
                        class="input"
                        required
                        value={connection()?.username ?? ""}
                    />
                </label>
                <label>
                    <span class="label">Password</span>
                    <input
                        name={`${prefix}_password`}
                        type="password"
                        class="input"
                        value={connection()?.password ?? ""}
                    />
                </label>
            </div>
        </fieldset>
    );

    return (
        <div class="flex flex-col gap-4 max-w-5xl">
            <div>
                <h1 class="text-4xl font-bold">Set up the databases</h1>
                <p class="text-sm text-base-content/60 mt-2">
                    The project has no database connection yet. Configure the
                    database of your app and the one for its users (accounts,
                    sessions and roles); then the rest of the panel becomes
                    available.
                </p>
            </div>

            <Show when={error()}>
                <div class="bg-error text-error-content rounded-box p-3 text-sm">
                    Cannot connect to the databases. {error()}
                </div>
            </Show>

            <Show when={config()}>
                <form class="flex flex-col gap-4" onSubmit={submit}>
                    {connection_fields(
                        "App database",
                        "main",
                        () => config()?.databases_conn.main,
                    )}

                    <label class="label cursor-pointer gap-2 w-fit">
                        <input
                            type="checkbox"
                            class="checkbox"
                            checked={use_internal()}
                            onChange={(event) =>
                                set_separate_internal(
                                    event.currentTarget.checked,
                                )
                            }
                        />
                        Store users in a separate database (otherwise in the app
                        database)
                    </label>

                    <Show when={use_internal()}>
                        {connection_fields(
                            "Users database",
                            "internal",
                            () => config()?.databases_conn.internal,
                        )}
                    </Show>

                    <div>
                        <button
                            type="submit"
                            class="btn btn-primary"
                            disabled={busy()}
                        >
                            {busy() ? "Connecting…" : "Save and connect"}
                        </button>
                    </div>
                </form>
            </Show>
        </div>
    );
};
