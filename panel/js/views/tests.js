// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Tests: an API client to try endpoints, whose requests can be saved as tests in the project's
// `tests` folder. Stored test metadata (compatible with the previous panel):
// `route_params` {name: value}, `query_params` {name: value}, `body` (JSON), `response`
// {route, status, time, body}.

import { api, endpointUrl, errorMessage, query, readBody, routeParams } from "../api.js";
import { confirmAction, h, icon, mount, toast } from "../dom.js";
import { codeBlock, highlightJSON } from "../highlight.js";
import { link, refresh } from "../router.js";
import { fetchEndpoints, methodBadge } from "./endpoints.js";

const TOKEN_KEY = "silence.test_token";
const NAME_PATTERN = "[A-Za-z0-9 _.\\-]+";

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

async function fetchTests() {
    const groups = (await api("GET", "/api/internal/admin/tests")) ?? [];
    return groups.flatMap(([path, tests]) => tests.map((test) => ({ path, test })));
}

function testList(tests, current) {
    const files = [...new Set(tests.map((entry) => entry.path ?? ""))].sort();

    return h(
        "div",
        { class: "card test-list" },
        h("div", { class: "card-body", style: { paddingBottom: "12px" } }, h("a", { class: "btn primary", href: "#/tests/new", style: { width: "100%" } }, icon("plus"), "New request")),
        h(
            "div",
            { class: "test-list-items" },
            tests.length === 0 && h("p", { class: "empty" }, "No saved tests yet."),
            files.map((file) => [
                h("div", { class: "file-group" }, `tests/${file}`),
                tests
                    .filter((entry) => (entry.path ?? "") === file)
                    .sort((a, b) => a.test.name.localeCompare(b.test.name))
                    .map(({ test }) =>
                        h(
                            "a",
                            { href: link("tests", test.name), "aria-current": test.name === current ? "page" : undefined },
                            h("span", {}, test.name),
                            h("small", {}, test.target_endpoint_id),
                        ),
                    ),
            ]),
        ),
    );
}

/** Editable key/value rows for query params. Returns `{ el, get }`. */
function queryRowsEditor(rows) {
    const list = h("div", { class: "stack", style: { gap: "6px" } });
    let items = rows.length ? rows.map(([key, value]) => ({ key, value })) : [];

    const render = () => {
        mount(
            list,
            items.map((item, ix) =>
                h(
                    "div",
                    { class: "row", style: { flexWrap: "nowrap" } },
                    h("input", { class: "input mono", placeholder: "name", value: item.key, style: { maxWidth: "200px" }, onInput: (e) => (item.key = e.target.value) }),
                    h("input", { class: "input", placeholder: "value", value: item.value, onInput: (e) => (item.value = e.target.value) }),
                    h(
                        "button",
                        {
                            class: "btn ghost small",
                            type: "button",
                            "aria-label": "Remove param",
                            onClick: () => {
                                items.splice(ix, 1);
                                render();
                            },
                        },
                        icon("x"),
                    ),
                ),
            ),
            h(
                "div",
                {},
                h(
                    "button",
                    {
                        class: "btn small",
                        type: "button",
                        onClick: () => {
                            items.push({ key: "", value: "" });
                            render();
                        },
                    },
                    icon("plus"),
                    "Add query param",
                ),
            ),
        );
    };

    render();

    return { el: list, get: () => items.filter((item) => item.key.trim() !== "").map((item) => [item.key.trim(), item.value]) };
}

function responseView(response) {
    if (!response) return h("p", { class: "muted" }, "Send the request to see the response here.");

    const ok = response.status >= 200 && response.status < 300;
    let body = response.body;

    if (typeof body === "string") {
        try {
            body = JSON.parse(body);
        } catch {}
    }

    return h(
        "div",
        {},
        h(
            "div",
            { class: "response-meta" },
            h("span", { class: `badge ${ok ? "success" : "danger"}` }, String(response.status)),
            response.duration !== undefined && h("span", {}, `${response.duration} ms`),
            h("span", { class: "mono" }, response.route),
            response.time && h("span", {}, response.time),
        ),
        body === null || body === undefined || body === ""
            ? h("p", { class: "muted" }, "Empty response body.")
            : codeBlock(typeof body === "string" ? document.createTextNode(body) : highlightJSON(body), "response-body"),
    );
}

export async function view({ name, isNew = false, endpointId } = {}) {
    const [tests, endpoints] = await Promise.all([fetchTests(), fetchEndpoints()]);

    const entry = name !== undefined ? tests.find((candidate) => candidate.test.name === name) : null;

    if (name !== undefined && !entry) toast(`Test \`${name}\` doesn't exist.`, "error");

    const test = entry?.test ?? null;

    const header = h(
        "header",
        { class: "page-header" },
        h("div", {}, h("h1", {}, "Tests"), h("p", {}, "Try any endpoint and save the request as a test of your project.")),
    );

    if (!test && !isNew) {
        return h(
            "div",
            {},
            header,
            h(
                "div",
                { class: "tests-layout" },
                testList(tests, null),
                h("div", { class: "card card-body empty" }, "Select a test, or start a new request."),
            ),
        );
    }

    return h("div", {}, header, h("div", { class: "tests-layout" }, testList(tests, test?.name ?? null), requestEditor({ test, path: entry?.path, endpoints, endpointId })));
}

function requestEditor({ test, path, endpoints, endpointId }) {
    const state = {
        endpointId: test?.target_endpoint_id ?? endpointId ?? endpoints.find((e) => e.origin !== "internal")?.endpoint.id ?? "",
        routeValues: { ...(test?.route_params ?? {}) },
        response: test?.response ?? null,
    };

    const currentEndpoint = () => endpoints.find((entry) => entry.endpoint.id === state.endpointId)?.endpoint ?? null;

    // Endpoint selector, grouped by origin.
    const select = h(
        "select",
        { class: "select", "aria-label": "Endpoint" },
        [
            ["user", "Project"],
            ["generated", "Generated from the database"],
            ["internal", "Internal"],
        ].map(([origin, label]) =>
            h(
                "optgroup",
                { label },
                endpoints
                    .filter((entry) => entry.origin === origin)
                    .sort((a, b) => endpointUrl(a.endpoint).localeCompare(endpointUrl(b.endpoint)))
                    .map(({ endpoint }) =>
                        h("option", { value: endpoint.id, selected: endpoint.id === state.endpointId }, `${endpoint.method.toUpperCase().padEnd(6, " ")} ${endpointUrl(endpoint)}  ·  ${endpoint.id}`),
                    ),
            ),
        ),
    );

    const sendButton = h("button", { class: "btn primary", type: "button", onClick: () => send() }, icon("play"), "Send");
    const urlPreview = h("div", { class: "url-preview" });
    const routeParamsBox = h("div", { class: "param-table" });
    const bodyArea = h("textarea", { class: "textarea code", rows: 8, spellcheck: false });
    const bodySection = h("section", { class: "form-section" });
    const responseBox = h("div", {});

    let queryRows = queryRowsEditor(Object.entries(test?.query_params ?? {}));
    const queryBox = h("div", {}, queryRows.el);

    const tokenInput = h("input", { class: "input mono", value: storedToken(), placeholder: "No token: requests are anonymous", onInput: () => storeToken(tokenInput.value.trim()) });

    const buildUrl = () => {
        const endpoint = currentEndpoint();
        if (!endpoint) return "";

        let url = endpointUrl(endpoint);

        for (const param of routeParams(endpoint.route)) {
            url = url.replace(new RegExp(`\\{\\s*${param}\\s*\\}`), state.routeValues[param] ?? "");
        }

        return url + query(Object.fromEntries(queryRows.get()));
    };

    const updatePreview = () => {
        const endpoint = currentEndpoint();
        mount(urlPreview, endpoint && methodBadge(endpoint.method), h("span", {}, buildUrl()));
    };

    const renderEndpoint = ({ resetBody }) => {
        const endpoint = currentEndpoint();

        const params = routeParams(endpoint?.route);

        mount(
            routeParamsBox,
            params.length === 0
                ? h("span", { class: "muted", style: { gridColumn: "1 / -1" } }, "This route has no path params.")
                : params.map((param) => [
                      h("label", { for: `rp-${param}` }, `{${param}}`),
                      h("input", {
                          class: "input",
                          id: `rp-${param}`,
                          value: state.routeValues[param] ?? "",
                          onInput: (event) => {
                              state.routeValues[param] = event.target.value;
                              updatePreview();
                          },
                      }),
                  ]),
        );

        if (resetBody) {
            const declared = endpoint?.query_params ?? [];
            queryRows = queryRowsEditor(declared.map((key) => [key, ""]));
            mount(queryBox, queryRows.el);

            const skeleton = Object.fromEntries((endpoint?.body_params ?? []).map((param) => [param, ""]));
            bodyArea.value = Object.keys(skeleton).length ? JSON.stringify(skeleton, null, 2) : "";
        }

        const hasBody = endpoint && endpoint.method.toLowerCase() !== "get";
        bodySection.hidden = !hasBody;

        updatePreview();
    };

    queryBox.addEventListener("input", updatePreview);
    queryBox.addEventListener("click", () => setTimeout(updatePreview));

    select.addEventListener("change", () => {
        state.endpointId = select.value;
        state.routeValues = {};
        renderEndpoint({ resetBody: true });
    });

    if (test?.body !== undefined) bodyArea.value = typeof test.body === "string" ? test.body : JSON.stringify(test.body, null, 2);

    renderEndpoint({ resetBody: test === null });
    mount(responseBox, responseView(state.response));

    async function send() {
        const endpoint = currentEndpoint();
        if (!endpoint) return;

        const url = buildUrl();
        const method = endpoint.method.toUpperCase();
        const headers = { "Cache-Control": "no-cache" };
        const token = tokenInput.value.trim();

        if (token) headers.Authorization = token;

        let body;

        if (method !== "GET" && bodyArea.value.trim() !== "") {
            try {
                JSON.parse(bodyArea.value);
            } catch (err) {
                toast(`The body isn't valid JSON: ${err.message}`, "error");
                return;
            }

            body = bodyArea.value;
            headers["Content-Type"] = "application/json";
        }

        sendButton.disabled = true;
        const started = performance.now();

        try {
            // `omit` keeps the admin's session out of the request: only the token above is used.
            const response = await fetch(url, { method, headers, body, credentials: "omit" });
            const data = await readBody(response);

            state.response = {
                route: url,
                status: response.status,
                time: response.headers.get("Date") ?? new Date().toUTCString(),
                duration: Math.round(performance.now() - started),
                body: data,
            };

            if (data && typeof data === "object" && !Array.isArray(data) && typeof data.token === "string") {
                tokenInput.value = data.token;
                storeToken(data.token);
                toast("Session token captured: next requests will be authenticated.", "success");
            }

            if (!response.ok && response.status === 401) {
                toast(`${errorMessage(data, 401)} Sign in through the Login endpoint (internal) to get a token.`, "error");
            }
        } catch (err) {
            state.response = { route: url, status: 0, body: `Network error: ${err.message}` };
        } finally {
            sendButton.disabled = false;
        }

        mount(responseBox, responseView(state.response));
    }

    // Save as test.
    const nameInput = h("input", { class: "input", required: true, pattern: NAME_PATTERN, title: "Letters, digits, spaces, `_`, `.` and `-`.", value: test?.name ?? "" });
    const descriptionInput = h("input", { class: "input", value: test?.description ?? "" });
    const fileInput = h("input", { class: "input", value: path ?? "default.json", readonly: test !== null, pattern: ".+\\.json" });

    const collect = () => {
        const value = {
            name: nameInput.value.trim(),
            target_endpoint_id: state.endpointId,
            route_params: state.routeValues,
            query_params: Object.fromEntries(queryRows.get()),
        };

        if (descriptionInput.value.trim()) value.description = descriptionInput.value.trim();

        if (bodyArea.value.trim()) {
            try {
                value.body = JSON.parse(bodyArea.value);
            } catch {
                value.body = bodyArea.value;
            }
        }

        if (state.response) {
            const { duration, ...response } = state.response;
            value.response = response;
        }

        return value;
    };

    const save = async () => {
        if (!nameInput.reportValidity() || !fileInput.reportValidity()) return;

        const body = collect();

        try {
            if (test === null) {
                await api("POST", "/api/internal/admin/tests" + query({ target_file: fileInput.value.trim() }), body);
            } else {
                await api("PUT", `/api/internal/admin/tests/${encodeURIComponent(test.name)}`, body);
            }

            toast(`Test ${body.name} saved.`, "success");
            refresh(link("tests", body.name));
        } catch (err) {
            toast(err.message, "error");
        }
    };

    const remove = async () => {
        if (!(await confirmAction("Delete test", `${test.name} will be removed from tests/${path}.`))) return;

        try {
            await api("DELETE", `/api/internal/admin/tests/${encodeURIComponent(test.name)}`);
            toast(`Test ${test.name} deleted.`, "success");
            refresh("#/tests");
        } catch (err) {
            toast(err.message, "error");
        }
    };

    const root = h(
        "div",
        { class: "stack" },
        h(
            "div",
            { class: "card card-body stack" },
            h("div", { class: "request-bar" }, select, sendButton),
            urlPreview,
            h("section", { class: "form-section" }, h("header", {}, h("h3", {}, "Path params")), routeParamsBox),
            h("section", { class: "form-section" }, h("header", {}, h("h3", {}, "Query params")), queryBox),
            mount(bodySection, h("header", {}, h("h3", {}, "Body"), h("p", {}, "JSON object. Values are sent to SQL as text.")), bodyArea),
            h(
                "section",
                { class: "form-section" },
                h("header", {}, h("h3", {}, "Session token"), h("p", {}, "Sent as the Authorization header. It's captured automatically from Login/Signup responses.")),
                h("div", { class: "row", style: { flexWrap: "nowrap" } }, tokenInput, h("button", { class: "btn", type: "button", onClick: () => { tokenInput.value = ""; storeToken(""); } }, "Clear")),
            ),
        ),
        h("div", { class: "card card-body" }, h("h2", { style: { marginBottom: "12px" } }, "Response"), responseBox),
        h(
            "div",
            { class: "card card-body stack" },
            h("h2", {}, test ? "Test" : "Save as test"),
            h(
                "div",
                { class: "form-grid" },
                h("label", { class: "field" }, h("span", {}, "Name"), nameInput),
                h("label", { class: "field" }, h("span", {}, "File"), fileInput, h("small", {}, "Inside the project's tests folder")),
            ),
            h("label", { class: "field" }, h("span", {}, "Description"), descriptionInput),
            h(
                "div",
                { class: "row" },
                h("button", { class: "btn primary", type: "button", onClick: save }, icon("save"), test ? "Save changes" : "Save test"),
                test && h("button", { class: "btn danger", type: "button", style: { marginLeft: "auto" }, onClick: remove }, icon("trash"), "Delete"),
            ),
        ),
    );

    root.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            send();
        }
    });

    return root;
}
