// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

import { createResource, createSignal, For, Show } from "solid-js";

import type { ConfigStruct, DatabaseConn } from "@admin/Config";

interface ServerDatabase {
    name: string;
    tables: number;
    has_users: boolean;
}

/**
 * Setup page, shown while the databases aren't connected (e.g. after `silence run` in an empty
 * directory): connect to the database server, pick the app database and the users database, and
 * connect. Once connected, the page reloads and the rest of the panel becomes available.
 * Both databases use the same server and credentials.
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
    const [databases, set_databases] = createSignal<ServerDatabase[]>();
    const [app_db, set_app_db] = createSignal<string>();
    const [separate_users, set_separate_users] = createSignal<boolean>();

    let server_form: HTMLFormElement | undefined;
    let users_db_input: HTMLInputElement | undefined;

    const main = () => config()?.databases_conn.main;
    const internal = () =>
        config()?.databases_conn.internal as DatabaseConn | null | undefined;

    const selected_app_db = () => app_db() ?? main()?.db ?? "";
    const use_separate_users = () => separate_users() ?? internal() != null;

    // Default users database: the configured one, or one named after the app database (the
    // `_db` suffix keeps it within the privileges of the class user, granted on `%db`).
    const suggested_users_db = () =>
        internal()?.db && internal()!.db !== "silence"
            ? internal()!.db
            : `${selected_app_db().replace(/_db$/, "")}_silence_db`;

    const server = () => {
        const form = new FormData(server_form);
        return {
            host: String(form.get("host") ?? "").trim(),
            username: String(form.get("username") ?? "").trim(),
            password: String(form.get("password") ?? ""),
        };
    };

    const browse = async (event: SubmitEvent) => {
        event.preventDefault();

        set_busy(true);
        set_error(null);

        const res = await fetch("/_setup/databases", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(server()),
        });

        const body = await res.json();

        if (res.ok) {
            set_databases(body as ServerDatabase[]);
        } else {
            set_databases(undefined);
            set_error((body as { error: string }).error);
        }

        set_busy(false);
    };

    const connect = async () => {
        if (!server_form?.reportValidity()) return;

        if (!selected_app_db()) {
            set_error("Choose the app database.");
            return;
        }

        set_busy(true);
        set_error(null);

        const connection = (db: string) => ({ ...server(), db });

        const databases_conn = {
            main: connection(selected_app_db()),
            internal: use_separate_users()
                ? connection(
                      (users_db_input?.value ?? "").trim() ||
                          suggested_users_db(),
                  )
                : null,
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

    return (
        <div class="flex flex-col gap-4 max-w-5xl">
            <div>
                <h1 class="text-4xl font-bold">Set up the databases</h1>
                <p class="text-sm text-base-content/60 mt-2">
                    The project has no database connection yet. Connect to the
                    database server, choose the database of your app and where
                    its users (accounts, sessions and roles) are stored; then
                    the rest of the panel becomes available.
                </p>
            </div>

            <Show when={error()}>
                <div class="bg-error text-error-content rounded-box p-3 text-sm break-words">
                    {error()}
                </div>
            </Show>

            <Show when={config()}>
                <form
                    ref={server_form}
                    class="fieldset bg-base-100 border border-base-300 rounded-box p-4"
                    onSubmit={browse}
                >
                    <legend class="fieldset-legend">1. Database server</legend>
                    <div class="grid grid-cols-1 lg:grid-cols-4 gap-3 items-end">
                        <label>
                            <span class="label">Host (IP:port)</span>
                            <input
                                name="host"
                                class="input"
                                required
                                pattern="^(\d{1,3}\.){3}\d{1,3}:\d{1,5}$"
                                value={main()?.host ?? "127.0.0.1:3306"}
                            />
                        </label>
                        <label>
                            <span class="label">User</span>
                            <input
                                name="username"
                                class="input"
                                required
                                value={main()?.username ?? ""}
                            />
                        </label>
                        <label>
                            <span class="label">Password</span>
                            <input
                                name="password"
                                type="password"
                                class="input"
                                value={main()?.password ?? ""}
                            />
                        </label>
                        <div>
                            <button type="submit" class="btn" disabled={busy()}>
                                Browse databases
                            </button>
                        </div>
                    </div>
                </form>

                <fieldset class="fieldset bg-base-100 border border-base-300 rounded-box p-4">
                    <legend class="fieldset-legend">2. App database</legend>
                    <Show
                        when={databases()}
                        fallback={
                            <label>
                                <span class="label">
                                    Database (or browse the server to choose
                                    one)
                                </span>
                                <input
                                    class="input"
                                    value={selected_app_db()}
                                    onInput={(event) =>
                                        set_app_db(event.currentTarget.value)
                                    }
                                />
                            </label>
                        }
                    >
                        <Show
                            when={databases()!.length > 0}
                            fallback={
                                <p class="text-sm">
                                    This user can't access any database on the
                                    server.
                                </p>
                            }
                        >
                            <div class="max-h-72 overflow-y-auto border border-base-300 rounded-box">
                                <table class="table table-sm">
                                    <thead>
                                        <tr>
                                            <th></th>
                                            <th>Database</th>
                                            <th>Tables</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <For each={databases()}>
                                            {(database) => (
                                                <tr
                                                    class="cursor-pointer hover:bg-base-200"
                                                    classList={{
                                                        "bg-base-200":
                                                            selected_app_db() ===
                                                            database.name,
                                                    }}
                                                    onClick={() =>
                                                        set_app_db(
                                                            database.name,
                                                        )
                                                    }
                                                >
                                                    <td>
                                                        <input
                                                            type="radio"
                                                            class="radio radio-sm"
                                                            name="app_db"
                                                            checked={
                                                                selected_app_db() ===
                                                                database.name
                                                            }
                                                        />
                                                    </td>
                                                    <td class="font-mono">
                                                        {database.name}
                                                    </td>
                                                    <td>{database.tables}</td>
                                                    <td class="text-xs text-base-content/60">
                                                        {database.has_users
                                                            ? "has Silence users"
                                                            : ""}
                                                    </td>
                                                </tr>
                                            )}
                                        </For>
                                    </tbody>
                                </table>
                            </div>
                        </Show>
                    </Show>
                </fieldset>

                <fieldset class="fieldset bg-base-100 border border-base-300 rounded-box p-4">
                    <legend class="fieldset-legend">3. Users database</legend>
                    <label class="label cursor-pointer gap-2 w-fit">
                        <input
                            type="checkbox"
                            class="checkbox"
                            checked={use_separate_users()}
                            onChange={(event) =>
                                set_separate_users(event.currentTarget.checked)
                            }
                        />
                        Store users in a separate database (otherwise in the app
                        database)
                    </label>
                    <Show when={use_separate_users()}>
                        <label>
                            <span class="label">
                                Database (created when connecting if it doesn't
                                exist)
                            </span>
                            <input
                                ref={users_db_input}
                                class="input"
                                list="users-databases"
                                placeholder={suggested_users_db()}
                            />
                            <datalist id="users-databases">
                                <For
                                    each={databases()?.filter(
                                        (database) => database.has_users,
                                    )}
                                >
                                    {(database) => (
                                        <option value={database.name} />
                                    )}
                                </For>
                            </datalist>
                        </label>
                    </Show>
                </fieldset>

                <div>
                    <button
                        type="button"
                        class="btn btn-primary"
                        disabled={busy()}
                        onClick={connect}
                    >
                        {busy() ? "Connecting…" : "Save and connect"}
                    </button>
                </div>
            </Show>
        </div>
    );
};
