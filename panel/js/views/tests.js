// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Tests: an API client to try endpoints, whose requests can be saved as tests in the project's
// `tests` folder. Stored test metadata (compatible with the previous panel):
// `route_params` {name: value}, `query_params` {name: value}, `body` (JSON), `response`
// {route, status, time, body}.

import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import html from "solid-js/html";
import { A, useLocation, useNavigate, useParams } from "@solidjs/router";

import { api, endpointUrl, errorMessage, query, readBody, routeParams } from "../api.js";
import { confirmAction, toast } from "../dom.js";
import { codeBlock, highlightJSON } from "../highlight.js";
import { Await, Field, Icon, MethodBadge, PageHeader } from "../ui.js";
import { fetchEndpoints } from "./endpoints.js";

const TOKEN_KEY = "silence.test_token";
const NAME_PATTERN = "[A-Za-z0-9 _.\\-]+";

const ORIGINS = [
    ["user", "Project"],
    ["generated", "Generated from the database"],
    ["internal", "Internal"],
];

function storedToken() {
    try {
        return localStorage.getItem(TOKEN_KEY) ?? "";
    } catch {
        return "";
    }
}

function storeToken(token) {
    try {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
    } catch {}
}

/** Route params are not decoded by the router. */
function decodeParam(value) {
    if (value === undefined) return undefined;

    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

async function fetchData() {
    const [groups, endpoints] = await Promise.all([api("GET", "/api/internal/admin/tests"), fetchEndpoints()]);
    const tests = (groups ?? []).flatMap(([path, tests]) => tests.map((test) => ({ path, test })));
    return { tests, endpoints };
}

function TestList(props) {
    const files = createMemo(() => [...new Set(props.tests.map((entry) => entry.path ?? ""))].sort());

    return html`
        <div class="card test-list">
            <div class="card-body" style="padding-bottom: 12px">
                <${A} class="btn primary" href="/tests/new" style="width: 100%"><${Icon} name="plus" /> New request<//>
            </div>
            <div class="test-list-items">
                <${Show} when=${() => props.tests.length === 0}><p class="empty">No saved tests yet.</p><//>
                <${For} each=${files}>
                    ${(file) => html`
                        <div class="file-group">tests/${file}</div>
                        <${For}
                            each=${() =>
                                props.tests.filter((entry) => (entry.path ?? "") === file).sort((a, b) => a.test.name.localeCompare(b.test.name))}
                        >
                            ${({ test }) => html`
                                <a
                                    href=${`#/tests/${encodeURIComponent(test.name)}`}
                                    aria-current=${() => (test.name === props.current ? "page" : undefined)}
                                >
                                    <span>${test.name}</span>
                                    <small>${test.target_endpoint_id}</small>
                                </a>
                            `}
                        <//>
                    `}
                <//>
            </div>
        </div>
    `;
}

function ResponseView(props) {
    const body = () => {
        let value = props.response.body;

        if (typeof value === "string") {
            try {
                value = JSON.parse(value);
            } catch {}
        }

        return value;
    };

    const ok = () => props.response.status >= 200 && props.response.status < 300;

    return html`
        <div>
            <div class="response-meta">
                <span class=${() => `badge ${ok() ? "success" : "danger"}`}>${() => String(props.response.status)}</span>
                <${Show} when=${() => props.response.duration !== undefined}><span>${() => `${props.response.duration} ms`}</span><//>
                <span class="mono">${() => props.response.route}</span>
                <${Show} when=${() => props.response.time}><span>${() => props.response.time}</span><//>
            </div>
            ${() => {
                const value = body();

                if (value === null || value === undefined || value === "") return html`<p class="muted">Empty response body.</p>`;

                return codeBlock(typeof value === "string" ? document.createTextNode(value) : highlightJSON(value), "response-body");
            }}
        </div>
    `;
}

/**
 * Request editor. Mounted once per selected test / new request, so its state is initialized from
 * `props.test` (null for a new request) and `props.endpointId`.
 */
function RequestEditor(props) {
    const navigate = useNavigate();
    const test = props.test;
    const endpoints = props.endpoints;

    const [endpointId, setEndpointId] = createSignal(
        test?.target_endpoint_id ?? props.endpointId ?? endpoints.find((entry) => entry.origin !== "internal")?.endpoint.id ?? "",
    );
    const [routeValues, setRouteValues] = createSignal({ ...(test?.route_params ?? {}) });
    const [queryRows, setQueryRows] = createSignal(Object.entries(test?.query_params ?? {}).map(([key, value]) => ({ key, value })));
    const [body, setBody] = createSignal(
        test?.body === undefined ? "" : typeof test.body === "string" ? test.body : JSON.stringify(test.body, null, 2),
    );
    const [token, setToken] = createSignal(storedToken());
    const [response, setResponse] = createSignal(test?.response ?? null);
    const [sending, setSending] = createSignal(false);

    const endpoint = createMemo(() => endpoints.find((entry) => entry.endpoint.id === endpointId())?.endpoint ?? null);
    const params = createMemo(() => routeParams(endpoint()?.route));
    const hasBody = () => endpoint() && endpoint().method.toLowerCase() !== "get";

    const queryObject = () =>
        Object.fromEntries(
            queryRows()
                .filter((row) => row.key.trim() !== "")
                .map((row) => [row.key.trim(), row.value]),
        );

    const url = createMemo(() => {
        const current = endpoint();
        if (!current) return "";

        let value = endpointUrl(current);

        for (const param of params()) {
            value = value.replace(new RegExp(`\\{\\s*${param}\\s*\\}`), routeValues()[param] ?? "");
        }

        return value + query(queryObject());
    });

    const selectEndpoint = (id) => {
        setEndpointId(id);
        setRouteValues({});

        const current = endpoint();
        setQueryRows((current?.query_params ?? []).map((key) => ({ key, value: "" })));

        const skeleton = Object.fromEntries((current?.body_params ?? []).map((param) => [param, ""]));
        setBody(Object.keys(skeleton).length ? JSON.stringify(skeleton, null, 2) : "");
    };

    // A new request starts from the declared params of the preselected endpoint.
    if (test === null) selectEndpoint(endpointId());

    const updateToken = (value) => {
        setToken(value);
        storeToken(value.trim());
    };

    const setRow = (ix, field, value) => setQueryRows(queryRows().map((row, other) => (other === ix ? { ...row, [field]: value } : row)));

    const send = async () => {
        const current = endpoint();
        if (!current) return;

        const target = url();
        const method = current.method.toUpperCase();
        const headers = { "Cache-Control": "no-cache" };

        if (token().trim()) headers.Authorization = token().trim();

        let requestBody;

        if (method !== "GET" && body().trim() !== "") {
            try {
                JSON.parse(body());
            } catch (err) {
                toast(`The body isn't valid JSON: ${err.message}`, "error");
                return;
            }

            requestBody = body();
            headers["Content-Type"] = "application/json";
        }

        setSending(true);
        const started = performance.now();

        try {
            // `omit` keeps the admin's session out of the request: only the token above is used.
            const res = await fetch(target, { method, headers, body: requestBody, credentials: "omit" });
            const data = await readBody(res);

            setResponse({
                route: target,
                status: res.status,
                time: res.headers.get("Date") ?? new Date().toUTCString(),
                duration: Math.round(performance.now() - started),
                body: data,
            });

            if (data && typeof data === "object" && !Array.isArray(data) && typeof data.token === "string") {
                updateToken(data.token);
                toast("Session token captured: next requests will be authenticated.", "success");
            }

            if (res.status === 401) {
                toast(`${errorMessage(data, 401)} Sign in through the Login endpoint (internal) to get a token.`, "error");
            }
        } catch (err) {
            setResponse({ route: target, status: 0, body: `Network error: ${err.message}` });
        } finally {
            setSending(false);
        }
    };

    // Save as test.
    let nameInput;
    let fileInput;
    const [name, setName] = createSignal(test?.name ?? "");
    const [description, setDescription] = createSignal(test?.description ?? "");
    const [file, setFile] = createSignal(props.path ?? "default.json");

    const collect = () => {
        const value = {
            name: name().trim(),
            target_endpoint_id: endpointId(),
            route_params: routeValues(),
            query_params: queryObject(),
        };

        if (description().trim()) value.description = description().trim();

        if (body().trim()) {
            try {
                value.body = JSON.parse(body());
            } catch {
                value.body = body();
            }
        }

        if (response()) {
            const { duration, ...stored } = response();
            value.response = stored;
        }

        return value;
    };

    const save = async () => {
        if (!nameInput.reportValidity() || !fileInput.reportValidity()) return;

        // The DOM validation above may disagree with the state if the input was changed without an
        // `input` event (e.g. autofill): validate the value that is actually sent.
        if (!new RegExp(`^${NAME_PATTERN}$`).test(name().trim())) {
            toast("The test needs a name: letters, digits, spaces, `_`, `.` and `-`.", "error");
            nameInput.focus();
            return;
        }

        const value = collect();

        try {
            if (test === null) {
                await api("POST", "/api/internal/admin/tests" + query({ target_file: file().trim() }), value);
            } else {
                await api("PUT", `/api/internal/admin/tests/${encodeURIComponent(test.name)}`, value);
            }

            toast(`Test ${value.name} saved.`, "success");
            props.onChange();
            navigate(`/tests/${encodeURIComponent(value.name)}`);
        } catch (err) {
            toast(err.message, "error");
        }
    };

    const remove = async () => {
        if (!(await confirmAction("Delete test", `${test.name} will be removed from tests/${props.path}.`))) return;

        try {
            await api("DELETE", `/api/internal/admin/tests/${encodeURIComponent(test.name)}`);
            toast(`Test ${test.name} deleted.`, "success");
            props.onChange();
            navigate("/tests");
        } catch (err) {
            toast(err.message, "error");
        }
    };

    const onKeyDown = (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            send();
        }
    };

    const optionLabel = (entry) => `${entry.method.toUpperCase().padEnd(6, " ")} ${endpointUrl(entry)}  ·  ${entry.id}`;

    return html`
        <div class="stack" onKeyDown=${onKeyDown}>
            <div class="card card-body stack">
                <div class="request-bar">
                    <select class="select" aria-label="Endpoint" onChange=${(event) => selectEndpoint(event.target.value)}>
                        <${For} each=${ORIGINS}>
                            ${([origin, label]) => html`
                                <optgroup label=${label}>
                                    <${For}
                                        each=${endpoints
                                            .filter((entry) => entry.origin === origin)
                                            .sort((a, b) => endpointUrl(a.endpoint).localeCompare(endpointUrl(b.endpoint)))}
                                    >
                                        ${(entry) => html`
                                            <option value=${entry.endpoint.id} selected=${() => entry.endpoint.id === endpointId()}>
                                                ${optionLabel(entry.endpoint)}
                                            </option>
                                        `}
                                    <//>
                                </optgroup>
                            `}
                        <//>
                    </select>
                    <button class="btn primary" type="button" disabled=${sending} onClick=${send}><${Icon} name="play" /> Send</button>
                </div>

                <div class="url-preview">
                    <${Show} when=${endpoint}><${MethodBadge} method=${() => endpoint().method} /><//>
                    <span>${url}</span>
                </div>

                <section class="form-section">
                    <header><h3>Path params</h3></header>
                    <div class="param-table">
                        <${Show}
                            when=${() => params().length > 0}
                            fallback=${html`<span class="muted" style="grid-column: 1 / -1">This route has no path params.</span>`}
                        >
                            <${For} each=${params}>
                                ${(param) => html`
                                    <label for=${`rp-${param}`}>{${param}}</label>
                                    <input
                                        class="input"
                                        id=${`rp-${param}`}
                                        value=${routeValues()[param] ?? ""}
                                        onInput=${(event) => setRouteValues({ ...routeValues(), [param]: event.target.value })}
                                    />
                                `}
                            <//>
                        <//>
                    </div>
                </section>

                <section class="form-section">
                    <header><h3>Query params</h3></header>
                    <div class="stack" style="gap: 6px">
                        <${For} each=${queryRows}>
                            ${(row, ix) => html`
                                <div class="row" style="flex-wrap: nowrap">
                                    <input
                                        class="input mono"
                                        placeholder="name"
                                        style="max-width: 200px"
                                        value=${row.key}
                                        onInput=${(event) => setRow(ix(), "key", event.target.value)}
                                    />
                                    <input class="input" placeholder="value" value=${row.value} onInput=${(event) => setRow(ix(), "value", event.target.value)} />
                                    <button
                                        class="btn ghost small"
                                        type="button"
                                        aria-label="Remove param"
                                        onClick=${() => setQueryRows(queryRows().filter((_, other) => other !== ix()))}
                                    >
                                        <${Icon} name="x" />
                                    </button>
                                </div>
                            `}
                        <//>
                        <div>
                            <button class="btn small" type="button" onClick=${() => setQueryRows([...queryRows(), { key: "", value: "" }])}>
                                <${Icon} name="plus" /> Add query param
                            </button>
                        </div>
                    </div>
                </section>

                <${Show} when=${hasBody}>
                    <section class="form-section">
                        <header>
                            <h3>Body</h3>
                            <p>JSON object. Values are sent to SQL as text.</p>
                        </header>
                        <textarea class="textarea code" rows="8" spellcheck="false" value=${body} onInput=${(event) => setBody(event.target.value)}></textarea>
                    </section>
                <//>

                <section class="form-section">
                    <header>
                        <h3>Session token</h3>
                        <p>Sent as the Authorization header. It's captured automatically from Login/Signup responses.</p>
                    </header>
                    <div class="row" style="flex-wrap: nowrap">
                        <input
                            class="input mono"
                            placeholder="No token: requests are anonymous"
                            value=${token}
                            onInput=${(event) => updateToken(event.target.value)}
                        />
                        <button class="btn" type="button" onClick=${() => updateToken("")}>Clear</button>
                    </div>
                </section>
            </div>

            <div class="card card-body">
                <h2 style="margin-bottom: 12px">Response</h2>
                <${Show} when=${response} fallback=${html`<p class="muted">Send the request to see the response here.</p>`}>
                    <${ResponseView} response=${() => response()} />
                <//>
            </div>

            <div class="card card-body stack">
                <h2>${test ? "Test" : "Save as test"}</h2>
                <div class="form-grid">
                    <${Field} label="Name">
                        <input
                            class="input"
                            required
                            pattern=${NAME_PATTERN}
                            title="Letters, digits, spaces, \`_\`, \`.\` and \`-\`."
                            ref=${(el) => (nameInput = el)}
                            value=${name}
                            onInput=${(event) => setName(event.target.value)}
                        />
                    <//>
                    <${Field} label="File" hint="Inside the project's tests folder">
                        <input
                            class="input"
                            pattern=".+\\.json"
                            readonly=${test !== null}
                            ref=${(el) => (fileInput = el)}
                            value=${file}
                            onInput=${(event) => setFile(event.target.value)}
                        />
                    <//>
                </div>
                <${Field} label="Description">
                    <input class="input" value=${description} onInput=${(event) => setDescription(event.target.value)} />
                <//>
                <div class="row">
                    <button class="btn primary" type="button" onClick=${save}><${Icon} name="save" /> ${test ? "Save changes" : "Save test"}</button>
                    <${Show} when=${test}>
                        <button class="btn danger" type="button" style="margin-left: auto" onClick=${remove}><${Icon} name="trash" /> Delete</button>
                    <//>
                </div>
            </div>
        </div>
    `;
}

export function Tests() {
    const params = useParams();
    const location = useLocation();
    const [data, { refetch }] = createResource(fetchData);

    const isNew = () => location.pathname.startsWith("/tests/new");
    const name = () => (isNew() ? undefined : decodeParam(params.name));
    const endpointId = () => (isNew() ? decodeParam(params.endpoint) : undefined);

    const entry = createMemo(() => {
        const current = name();
        if (current === undefined || !data()) return null;

        const found = data().tests.find((candidate) => candidate.test.name === current) ?? null;
        if (!found) toast(`Test \`${current}\` doesn't exist.`, "error");
        return found;
    });

    // Key of the editor: it's remounted (and its state reset) whenever it changes.
    const editorKey = createMemo(() => {
        if (!data()) return null;
        if (isNew()) return { kind: "new", endpointId: endpointId() };
        if (entry()) return { kind: "test", entry: entry() };
        return null;
    });

    return html`
        <div>
            <${PageHeader} title="Tests" description="Try any endpoint and save the request as a test of your project." />
            <${Await} resource=${() => data}>
                ${(value) => html`
                    <div class="tests-layout">
                        <${TestList} tests=${value.tests} current=${() => entry()?.test.name ?? null} />
                        <${Show} when=${editorKey} keyed=${true} fallback=${html`<div class="card card-body empty">Select a test, or start a new request.</div>`}>
                            ${(key) => html`
                                <${RequestEditor}
                                    test=${key.kind === "test" ? key.entry.test : null}
                                    path=${key.kind === "test" ? key.entry.path : undefined}
                                    endpointId=${key.endpointId}
                                    endpoints=${value.endpoints}
                                    onChange=${refetch}
                                />
                            `}
                        <//>
                    </div>
                `}
            <//>
        </div>
    `;
}
