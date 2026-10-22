// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Endpoints: list grouped by origin + side drawer editor.
// Written with Solid without a build step: `html` tagged templates instead of JSX.

import { createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import html from "solid-js/html";
import { useNavigate, useParams } from "@solidjs/router";

import { api, endpointUrl, query } from "../api.js";
import { confirmAction, toast } from "../dom.js";
import { sqlEditor } from "../highlight.js";
import { Chips, Field, Icon, Loading, MethodBadge, PageHeader, Tabs } from "../ui.js";

const METHODS = ["get", "post", "put", "delete"];
const BEHAVIOURS = [
    ["permissive", "Return all rows"],
    ["unique", "Exactly one row (returns an object)"],
    ["fail_on_empty", "Fail when there are no rows"],
];

// The server compares the user's role in lowercase against `allowed_roles` as written.
const ROLE_CASE_WARNING = "Roles with uppercase letters never match: the server compares roles in lowercase. Write them in lowercase.";

const ORIGIN_LABELS = {
    user: "Defined in the project",
    generated: "Generated from the database",
    internal: "Silence internal",
};

/**
 * Origin of an endpoint:
 * - "user": defined in a file of the project's `endpoints` folder.
 * - "generated": discovered from the database schema.
 * - "internal": Silence's own endpoints (auth, admin API, websockets).
 */
export function origin({ path, endpoint }) {
    if (path !== null) return "user";
    if (endpoint.execute && (endpoint.version ?? "").split("/")[0] !== "internal") return "generated";
    return "internal";
}

/** Fetches all endpoints flattened to `{ path, endpoint, origin }`. */
export async function fetchEndpoints() {
    const groups = (await api("GET", "/api/internal/endpoints")) ?? [];

    return groups.flatMap(([path, endpoints]) =>
        endpoints.map((endpoint) => {
            const entry = { path, endpoint };
            return { ...entry, origin: origin(entry) };
        }),
    );
}

/** Link to the Tests view with the endpoint preselected. */
const tryHref = (id) => `#/tests/new/${encodeURIComponent(id)}`;

/** Auth badges of an endpoint, warning about roles that can never match. */
function Access(props) {
    return html`
        <div class="flags">
            <${Show} when=${() => props.endpoint.require_auth}><span class="badge warning">auth</span><//>
            <${Show} when=${() => !props.endpoint.require_auth && props.endpoint.inject_auth_metadata}>
                <span class="badge">optional auth</span>
            <//>
            <${For} each=${() => props.endpoint.allowed_roles ?? []}>
                ${(role) =>
                    role === role.toLowerCase()
                        ? html`<span class="badge accent">${role}</span>`
                        : html`<span class="badge danger" title=${ROLE_CASE_WARNING}>${role} ⚠</span>`}
            <//>
        </div>
    `;
}

/** Groups the visible entries: one group per user file, then generated, then internal. */
function groupEntries(entries) {
    const groups = [];

    for (const originKey of ["user", "generated", "internal"]) {
        const ofOrigin = entries.filter((entry) => entry.origin === originKey);
        if (!ofOrigin.length) continue;

        if (originKey === "user") {
            const files = [...new Set(ofOrigin.map((entry) => entry.path))].sort();
            for (const file of files) {
                groups.push({ label: `${ORIGIN_LABELS.user} · endpoints/${file}`, entries: ofOrigin.filter((entry) => entry.path === file) });
            }
        } else {
            groups.push({ label: ORIGIN_LABELS[originKey], entries: ofOrigin });
        }
    }

    for (const group of groups) {
        group.entries.sort(
            (a, b) => endpointUrl(a.endpoint).localeCompare(endpointUrl(b.endpoint)) || a.endpoint.method.localeCompare(b.endpoint.method),
        );
    }

    return groups;
}

export function Endpoints() {
    const params = useParams();
    const navigate = useNavigate();

    const [entries, { refetch }] = createResource(fetchEndpoints);
    const [filter, setFilter] = createSignal("");
    const [showInternal, setShowInternal] = createSignal(false);

    const visible = createMemo(() => {
        const text = filter().trim().toLowerCase();

        return (entries() ?? []).filter(
            ({ origin, endpoint }) =>
                (showInternal() || origin !== "internal") &&
                (!text ||
                    [endpoint.id, endpointUrl(endpoint), endpoint.method, endpoint.description ?? ""].some((value) =>
                        value.toLowerCase().includes(text),
                    )),
        );
    });

    const groups = createMemo(() => groupEntries(visible()));

    const open = (id) => navigate(`/endpoints/${encodeURIComponent(id)}`);
    const close = () => navigate("/endpoints");

    // The editor is keyed by the selected id (once the list is loaded): it's recreated when the
    // selection changes, but not when the list is refetched.
    const selection = () => (entries() ? params.id : undefined);

    const editorFor = (id) => {
        const entry = id === "new" ? null : entries().find((candidate) => candidate.endpoint.id === id);

        if (entry === undefined) {
            queueMicrotask(() => {
                toast(`Endpoint \`${id}\` doesn't exist.`, "error");
                close();
            });
            return null;
        }

        // `onDone` takes an argument on purpose: solid-js/html turns zero-argument function props
        // into getters, which would call the handler on access.
        const onDone = async (result) => {
            if (result) await refetch();
            if (result?.saved) open(result.saved);
            else close();
        };

        return html`<${Editor} entry=${entry} onDone=${onDone} />`;
    };

    return html`
        <div>
            <${PageHeader}
                title="Endpoints"
                description="REST API of your project: endpoints you define plus the CRUD generated from the database."
                actions=${html`<a class="btn primary" href="#/endpoints/new"><${Icon} name="plus" /> New endpoint</a>`}
            />

            <div class="toolbar">
                <input
                    class="input search"
                    type="search"
                    placeholder="Filter by id, route or method…"
                    aria-label="Filter endpoints"
                    onInput=${(event) => setFilter(event.target.value)}
                />
                <label class="check">
                    <input type="checkbox" checked=${() => showInternal()} onChange=${(event) => setShowInternal(event.target.checked)} />
                    Show internal
                </label>
                <span class="muted" style="margin-left: auto; font-size: 12.5px">
                    ${() => `${visible().length} of ${entries()?.length ?? 0} endpoints`}
                </span>
            </div>

            <${Show} when=${() => !entries.error} fallback=${() => html`<div class="alert danger">${() => entries.error?.message}</div>`}>
                <${Show} when=${() => entries()} fallback=${html`<${Loading} />`}>
                    <div class="table-wrap">
                        <table class="table">
                            <thead>
                                <tr><th>Method</th><th>URL</th><th>Id</th><th>Access</th><th></th></tr>
                            </thead>
                            <tbody>
                                <${For}
                                    each=${groups}
                                    fallback=${html`<tr><td colspan="5" class="empty">No endpoints match the filter.</td></tr>`}
                                >
                                    ${(group) => [
                                        html`<tr class="group"><td colspan="5">${group.label}</td></tr>`,
                                        html`
                                            <${For} each=${group.entries}>
                                                ${(entry) => html`
                                                    <tr
                                                        class=${() => (params.id === entry.endpoint.id ? "clickable selected" : "clickable")}
                                                        onClick=${() => open(entry.endpoint.id)}
                                                    >
                                                        <td><${MethodBadge} method=${entry.endpoint.method} /></td>
                                                        <td><span class="endpoint-route">${endpointUrl(entry.endpoint)}</span></td>
                                                        <td><span class="endpoint-id">${entry.endpoint.id}</span></td>
                                                        <td><${Access} endpoint=${entry.endpoint} /></td>
                                                        <td class="actions">
                                                            <a
                                                                class="btn ghost small"
                                                                href=${tryHref(entry.endpoint.id)}
                                                                title="Try this endpoint"
                                                                onClick=${(event) => event.stopPropagation()}
                                                            >
                                                                <${Icon} name="play" /> Try
                                                            </a>
                                                        </td>
                                                    </tr>
                                                `}
                                            <//>
                                        `,
                                    ]}
                                <//>
                            </tbody>
                        </table>
                    </div>
                <//>
            <//>

            <${Show} when=${selection} keyed=${true}>${(id) => editorFor(id)}<//>
        </div>
    `;
}

/** Normalizes `execute` to the `{ queries: [...] }` form. */
function queriesOf(endpoint) {
    const execute = endpoint?.execute;
    if (!execute) return [];
    if (Array.isArray(execute.queries)) return execute.queries.map((q) => ({ ...q }));
    if (typeof execute.query === "string") return [{ query: execute.query, include: execute.include, behaviour: execute.behaviour }];
    return [];
}

/** State of one SQL query of the editor: its code editor plus `include` and `behaviour`. */
function queryBlock(entry, readonly) {
    const [include, setInclude] = createSignal(entry.include !== false);
    const [behaviour, setBehaviour] = createSignal(entry.behaviour ?? "permissive");

    return {
        editor: sqlEditor(entry.query ?? "", { readonly, rows: 4 }),
        include,
        setInclude,
        behaviour,
        setBehaviour,
        get() {
            const value = { query: this.editor.get().trim() };
            if (!include()) value.include = false;
            if (behaviour() !== "permissive") value.behaviour = behaviour();
            return value;
        },
    };
}

/**
 * Drawer editor. `props.entry` is null for a new endpoint. `props.onDone(result)` is called with
 * `{ saved: id }`, `{ deleted: true }` or `null` (closed without changes).
 */
function Editor(props) {
    const entry = props.entry;
    const isNew = entry === null;
    const endpoint = entry?.endpoint ?? { id: "", method: "get", version: "v1", route: "", execute: { queries: [{ query: "" }] } };
    const kind = entry?.origin ?? "user";
    const readonly = kind === "internal";

    const [id, setId] = createSignal(endpoint.id ?? "");
    const [method, setMethod] = createSignal((endpoint.method ?? "get").toLowerCase());
    const [version, setVersion] = createSignal(endpoint.version ?? "");
    const [route, setRoute] = createSignal(endpoint.route ?? "");
    const [description, setDescription] = createSignal(endpoint.description ?? "");
    const [file, setFile] = createSignal(entry?.path ?? "default.json");
    const [requireAuth, setRequireAuth] = createSignal(!!endpoint.require_auth);
    const [injectAuth, setInjectAuth] = createSignal(!!endpoint.inject_auth_metadata);

    let queryParams = [...(endpoint.query_params ?? [])];
    let bodyParams = [...(endpoint.body_params ?? [])];
    let roles = [...(endpoint.allowed_roles ?? [])];

    const initialQueries = queriesOf(endpoint).length ? queriesOf(endpoint) : [{ query: "" }];
    const [blocks, setBlocks] = createSignal(initialQueries.map((q) => queryBlock(q, readonly)));

    // Form / JSON tabs: the JSON tab shows (and lets you edit) the exact body sent to the server.
    const [tab, setTab] = createSignal("form");
    const [json, setJson] = createSignal("");

    let idInput;
    let routeInput;
    let fileInput;

    /** Builds the endpoint definition from the form. */
    const collect = () => {
        const value = {
            id: id().trim(),
            route: route().trim().replace(/^\/+/, ""),
            method: method(),
            execute: { queries: blocks().map((block) => block.get()).filter((q) => q.query !== "") },
            query_params: queryParams,
            body_params: bodyParams,
            allowed_roles: roles,
            require_auth: requireAuth(),
            inject_auth_metadata: injectAuth(),
        };

        if (version().trim()) value.version = version().trim();
        if (description().trim()) value.description = description().trim();

        return value;
    };

    const changeTab = (next) => {
        if (next === tab()) return;
        if (next === "json") setJson(JSON.stringify(readonly ? endpoint : collect(), null, 2));
        setTab(next);
    };

    const save = async () => {
        let body;

        if (tab() === "json") {
            try {
                body = JSON.parse(json());
            } catch (err) {
                toast(`Invalid JSON: ${err.message}`, "error");
                return;
            }
        } else {
            if (!idInput.reportValidity() || !routeInput.reportValidity() || (isNew && !fileInput.reportValidity())) return;
            body = collect();
        }

        try {
            if (isNew) {
                await api("POST", "/api/internal/admin/endpoints" + query({ target_file: file().trim() }), body);
            } else {
                await api("PUT", `/api/internal/admin/endpoints/${encodeURIComponent(endpoint.id)}`, body);
            }

            toast(`Endpoint ${body.id} saved.`, "success");
            props.onDone({ saved: body.id });
        } catch (err) {
            toast(err.message, "error");
        }
    };

    const remove = async () => {
        const message =
            kind === "generated"
                ? `${endpoint.id} will be hidden (added to skip_endpoints_ids in the settings). You can restore it from Settings.`
                : `${endpoint.id} will be removed from endpoints/${entry.path}.`;

        if (!(await confirmAction("Delete endpoint", message))) return;

        try {
            await api("DELETE", `/api/internal/admin/endpoints/${encodeURIComponent(endpoint.id)}`);
            toast(`Endpoint ${endpoint.id} deleted.`, "success");
            props.onDone({ deleted: true });
        } catch (err) {
            toast(err.message, "error");
        }
    };

    const onKey = (event) => {
        if (event.key === "Escape" && !document.querySelector("dialog[open]")) props.onDone(null);
        if ((event.ctrlKey || event.metaKey) && event.key === "s" && !readonly) {
            event.preventDefault();
            save();
        }
    };

    onMount(() => document.addEventListener("keydown", onKey));
    onCleanup(() => document.removeEventListener("keydown", onKey));

    const addQuery = () => setBlocks([...blocks(), queryBlock({ query: "" }, readonly)]);
    const removeQuery = (block) => setBlocks(blocks().filter((other) => other !== block));

    const QueryBlock = (block) => html`
        <div class="stack" style="gap: 8px">
            ${block.editor.el}
            <div class="row">
                <label class="check">
                    <input
                        type="checkbox"
                        checked=${() => block.include()}
                        disabled=${readonly}
                        onChange=${(event) => block.setInclude(event.target.checked)}
                    />
                    Include result in the response
                </label>
                <select class="select" style="width: auto" disabled=${readonly} onChange=${(event) => block.setBehaviour(event.target.value)}>
                    ${BEHAVIOURS.map(([value, label]) => html`<option value=${value} selected=${block.behaviour() === value}>${label}</option>`)}
                </select>
                <${Show} when=${() => !readonly && blocks().length > 1}>
                    <button class="btn ghost small danger" type="button" style="margin-left: auto" onClick=${() => removeQuery(block)}>
                        <${Icon} name="trash" /> Remove query
                    </button>
                <//>
            </div>
        </div>
    `;

    const form = html`
        <div>
            <${Show} when=${kind === "generated"}>
                <div class="alert info origin-note">
                    Generated from the database schema. Saving changes turns it into an endpoint of your project (stored in
                    endpoints/default.json).
                </div>
            <//>
            <${Show} when=${kind === "internal"}>
                <div class="alert origin-note">Internal endpoint of Silence: it can't be modified or deleted.</div>
            <//>

            <section class="form-section">
                <header><h3>Request</h3></header>
                <div class="form-grid">
                    <${Field} label="Id">
                        <input
                            ref=${(el) => (idInput = el)}
                            class="input"
                            name="id"
                            required
                            pattern="[A-Za-z0-9_.\\-]+"
                            title="Letters, digits, \`_\`, \`.\` and \`-\`."
                            readonly=${readonly}
                            value=${id()}
                            onInput=${(event) => setId(event.target.value)}
                        />
                    <//>
                    <${Field} label="Method">
                        <select class="select" name="method" disabled=${readonly} onChange=${(event) => setMethod(event.target.value)}>
                            ${METHODS.map((value) => html`<option value=${value} selected=${method() === value}>${value.toUpperCase()}</option>`)}
                        </select>
                    <//>
                </div>
                <div class="form-grid">
                    <${Field} label="Version" hint="Optional URL prefix after /api">
                        <input
                            class="input"
                            name="version"
                            placeholder="v1"
                            readonly=${readonly}
                            value=${version()}
                            onInput=${(event) => setVersion(event.target.value)}
                        />
                    <//>
                    <${Field} label="Route" hint="Use {name} for path params">
                        <input
                            ref=${(el) => (routeInput = el)}
                            class="input"
                            name="route"
                            required
                            placeholder="employees/{id}"
                            readonly=${readonly}
                            value=${route()}
                            onInput=${(event) => setRoute(event.target.value)}
                        />
                    <//>
                </div>
                <div class="url-preview">
                    <${MethodBadge} method=${method} />
                    <code>${() => endpointUrl({ version: version(), route: route() })}</code>
                </div>
                <${Field} label="Query params" hint="Read from ?name=value">
                    <${Chips} value=${queryParams} placeholder="Add query param…" readonly=${readonly} onChange=${(list) => (queryParams = list)} />
                <//>
                <${Field} label="Body params" hint="Read from the JSON body">
                    <${Chips} value=${bodyParams} placeholder="Add body param…" readonly=${readonly} onChange=${(list) => (bodyParams = list)} />
                <//>
            </section>

            <section class="form-section">
                <header>
                    <h3>SQL</h3>
                    <p>{param} binds a request param. |user_id| is the authenticated user. Queries run in order.</p>
                </header>
                <div class="stack"><${For} each=${blocks}>${(block) => QueryBlock(block)}<//></div>
                <${Show} when=${!readonly}>
                    <div>
                        <button class="btn small" type="button" onClick=${addQuery}><${Icon} name="plus" /> Add query</button>
                    </div>
                <//>
            </section>

            <section class="form-section">
                <header><h3>Access</h3></header>
                <label class="check">
                    <input type="checkbox" checked=${requireAuth()} disabled=${readonly} onChange=${(event) => setRequireAuth(event.target.checked)} />
                    Require authentication
                </label>
                <label class="check">
                    <input type="checkbox" checked=${injectAuth()} disabled=${readonly} onChange=${(event) => setInjectAuth(event.target.checked)} />
                    Make the user available when signed in (|user_id|)
                </label>
                <${Field} label="Allowed roles" hint="Empty: any authenticated user. Write roles in lowercase.">
                    <${Chips} value=${roles} placeholder="Add role…" readonly=${readonly} onChange=${(list) => (roles = list)} />
                <//>
            </section>

            <section class="form-section">
                <header><h3>Details</h3></header>
                <${Field} label="Description">
                    <textarea
                        class="textarea"
                        rows="2"
                        readonly=${readonly}
                        value=${description()}
                        onInput=${(event) => setDescription(event.target.value)}
                    ></textarea>
                <//>
                <${Field} label="File" hint=${isNew ? "Inside the project's endpoints folder" : undefined}>
                    <input
                        ref=${(el) => (fileInput = el)}
                        class="input"
                        name="file"
                        placeholder="default.json"
                        pattern=".+\\.json"
                        readonly=${!isNew}
                        value=${file()}
                        onInput=${(event) => setFile(event.target.value)}
                    />
                <//>
            </section>
        </div>
    `;

    return html`
        <div>
            <div class="drawer-backdrop" onClick=${() => props.onDone(null)}></div>
            <aside class="drawer" role="dialog" aria-label="Endpoint editor">
                <header>
                    <h2>${isNew ? "New endpoint" : endpoint.id}</h2>
                    <div class="row">
                        <${Tabs} tabs=${[["form", "Form"], ["json", "JSON"]]} value=${tab} onChange=${changeTab} />
                        <button class="btn ghost small" type="button" aria-label="Close" onClick=${() => props.onDone(null)}><${Icon} name="x" /></button>
                    </div>
                </header>
                <div class="drawer-body">
                    <div hidden=${() => tab() !== "form"}>${form}</div>
                    <div hidden=${() => tab() !== "json"}>
                        <textarea
                            class="textarea code"
                            rows="22"
                            spellcheck="false"
                            readonly=${readonly}
                            value=${() => json()}
                            onInput=${(event) => setJson(event.target.value)}
                        ></textarea>
                        <small class="muted">Editing the JSON and saving sends it as is.</small>
                    </div>
                </div>
                <footer>
                    <${Show} when=${!readonly}>
                        <button class="btn primary" type="button" onClick=${save}><${Icon} name="save" /> Save</button>
                    <//>
                    <${Show} when=${!isNew}>
                        <a class="btn" href=${tryHref(endpoint.id)}><${Icon} name="play" /> Try</a>
                    <//>
                    <span class="spacer"></span>
                    <${Show} when=${!isNew && !readonly}>
                        <button class="btn danger" type="button" onClick=${remove}><${Icon} name="trash" /> Delete</button>
                    <//>
                </footer>
            </aside>
        </div>
    `;
}
