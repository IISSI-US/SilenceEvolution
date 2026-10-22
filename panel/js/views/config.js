// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Project settings (`config.json`). The server replaces nested objects as a whole, so the full
// configuration is always sent back.

import { createResource, createSignal, Show } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import html from "solid-js/html";

import { api } from "../api.js";
import { toast } from "../dom.js";
import { codeBlock, highlightJSON } from "../highlight.js";
import { Await, Chips, Field, Icon, PageHeader } from "../ui.js";

const SOCKET_ADDR = "^(\\d{1,3}\\.){3}\\d{1,3}:\\d{1,5}$";

/** Text input bound to a store path: `bind(conn, "host")`. */
function Input(props) {
    return html`<input
        class="input"
        type=${() => props.type ?? "text"}
        required=${() => props.required ?? false}
        pattern=${() => props.pattern}
        title=${() => props.title}
        placeholder=${() => props.placeholder}
        autocomplete=${() => props.autocomplete ?? "off"}
        value=${() => props.value ?? ""}
        onInput=${(event) => props.onInput(event.target.value)}
    />`;
}

/** Connection fields for a database, bound to `props.conn` (store) through `props.set(key, value)`. */
function Connection(props) {
    const [reveal, setReveal] = createSignal(false);

    return html`
        <div class="form-grid">
            <${Field} label="Host" hint="IP:port (host names aren't supported)">
                <${Input}
                    required=${true}
                    pattern=${SOCKET_ADDR}
                    title="IP address and port, e.g. 127.0.0.1:3306"
                    value=${() => props.conn.host}
                    onInput=${(value) => props.set("host", value)}
                />
            <//>
            <${Field} label="Database">
                <${Input} required=${true} value=${() => props.conn.db} onInput=${(value) => props.set("db", value)} />
            <//>
            <${Field} label="User">
                <${Input} required=${true} value=${() => props.conn.username} onInput=${(value) => props.set("username", value)} />
            <//>
            <${Field} label="Password">
                <div class="row" style="flex-wrap: nowrap">
                    <${Input}
                        type=${() => (reveal() ? "text" : "password")}
                        autocomplete="new-password"
                        value=${() => props.conn.password}
                        onInput=${(value) => props.set("password", value)}
                    />
                    <button class="btn ghost small" type="button" onClick=${() => setReveal(!reveal())}>${() => (reveal() ? "Hide" : "Show")}</button>
                </div>
            <//>
        </div>
    `;
}

function SettingsForm(props) {
    const initial = props.config;
    const conns = initial.databases_conn ?? {};

    const [config, setConfig] = createStore({
        listening_addr: initial.listening_addr ?? "",
        serve_static_files: !!initial.serve_static_files,
        internal_params: { ...initial.internal_params },
        skip_discovery_tables: [...(initial.skip_discovery_tables ?? [])],
        skip_endpoints_ids: [...(initial.skip_endpoints_ids ?? [])],
        main: { ...conns.main },
        // When there's no separate internal database, prefill the fields from the main one.
        internal: { ...(conns.internal ?? { ...conns.main, db: "silence_db" }) },
        useInternal: !!conns.internal,
    });

    const [saving, setSaving] = createSignal(false);

    const collect = () => {
        const value = unwrap(config);
        const body = {
            serve_static_files: value.serve_static_files,
            internal_params: { ...value.internal_params },
            skip_discovery_tables: [...value.skip_discovery_tables],
            skip_endpoints_ids: [...value.skip_endpoints_ids],
            databases_conn: {
                main: { ...value.main },
                internal: value.useInternal ? { ...value.internal } : null,
            },
        };

        if (value.listening_addr.trim()) body.listening_addr = value.listening_addr.trim();

        return body;
    };

    const submit = async (event) => {
        event.preventDefault();

        setSaving(true);

        try {
            await api("PUT", "/api/internal/admin/config", collect());
            toast("Settings saved. Restart the server to apply database and discovery changes.", "success");
            props.onSaved();
        } catch (err) {
            toast(err.message, "error");
        } finally {
            setSaving(false);
        }
    };

    const table = (key, label) => html`
        <${Field} label=${label}>
            <${Input}
                required=${true}
                value=${() => config.internal_params[key]}
                onInput=${(value) => setConfig("internal_params", key, value)}
            />
        <//>
    `;

    return html`
        <form class="card card-body" onSubmit=${submit}>
            <section class="form-section">
                <header><h2>Server</h2><p>Changes to the listening address apply on the next start.</p></header>
                <div class="form-grid">
                    <${Field} label="Listening address" hint="IP:port">
                        <${Input}
                            pattern=${SOCKET_ADDR}
                            placeholder="127.0.0.1:8080"
                            value=${() => config.listening_addr}
                            onInput=${(value) => setConfig("listening_addr", value)}
                        />
                    <//>
                </div>
                <label class="check">
                    <input
                        type="checkbox"
                        checked=${() => config.serve_static_files}
                        onChange=${(event) => setConfig("serve_static_files", event.target.checked)}
                    />
                    Serve the project's web/ (or static/) folder at /
                </label>
            </section>

            <section class="form-section">
                <header><h2>Database</h2><p>Database of your app. Its tables are exposed as CRUD endpoints.</p></header>
                <${Connection} conn=${config.main} set=${(key, value) => setConfig("main", key, value)} />
            </section>

            <section class="form-section">
                <header><h2>Users database</h2><p>Where accounts, sessions and roles are stored.</p></header>
                <label class="check">
                    <input type="checkbox" checked=${() => config.useInternal} onChange=${(event) => setConfig("useInternal", event.target.checked)} />
                    Use a separate database (otherwise, the main one)
                </label>
                <${Show} when=${() => config.useInternal}>
                    <${Connection} conn=${config.internal} set=${(key, value) => setConfig("internal", key, value)} />
                <//>
                <div class="form-grid">
                    ${table("users_target_table", "Users table")} ${table("sessions_target_table", "Sessions table")}
                    ${table("roles_target_table", "Roles table")}
                </div>
            </section>

            <section class="form-section">
                <header><h2>Endpoint discovery</h2><p>Tables and generated endpoints left out of the API. Restart the server to apply.</p></header>
                <${Field} label="Skipped tables">
                    <${Chips} value=${initial.skip_discovery_tables ?? []} placeholder="Add table…" onChange=${(list) => setConfig("skip_discovery_tables", list)} />
                <//>
                <${Field} label="Hidden endpoints" hint="Deleting a generated endpoint adds it here; remove it to restore the endpoint.">
                    <${Chips} value=${initial.skip_endpoints_ids ?? []} placeholder="Add endpoint id…" onChange=${(list) => setConfig("skip_endpoints_ids", list)} />
                <//>
            </section>

            <div class="row" style="padding-top: 16px; border-top: 1px solid var(--border)">
                <button class="btn primary" type="submit" disabled=${saving}><${Icon} name="save" /> Save settings</button>
            </div>
        </form>

        <details class="card card-body" style="margin-top: 16px">
            <summary style="cursor: pointer; font-weight: 600">config.json</summary>
            <div style="margin-top: 12px">${codeBlock(highlightJSON(initial))}</div>
        </details>
    `;
}

export function Settings() {
    const [config, { refetch }] = createResource(() => api("GET", "/api/internal/admin/config"));

    return html`
        <div style="max-width: 900px">
            <${PageHeader} title="Settings" description="Project configuration, stored in config.json." />
            <div class="alert" style="margin-bottom: 16px">Database passwords are shown to admins and saved in plain text in config.json.</div>
            <${Await} resource=${() => config}>${(value) => html`<${SettingsForm} config=${value} onSaved=${(_result) => refetch()} />`}<//>
        </div>
    `;
}
