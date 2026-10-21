// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Endpoints: list grouped by origin + side drawer editor.

import { api, endpointUrl, query } from "../api.js";
import { chipsInput, confirmAction, debounce, h, icon, mount, toast } from "../dom.js";
import { sqlEditor } from "../highlight.js";
import { link, navigate, refresh } from "../router.js";

const METHODS = ["get", "post", "put", "delete"];
const BEHAVIOURS = [
    ["permissive", "Return all rows"],
    ["unique", "Exactly one row (returns an object)"],
    ["fail_on_empty", "Fail when there are no rows"],
];

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

function methodBadge(method) {
    const value = (method ?? "").toLowerCase();
    return h("span", { class: `method ${value}` }, value.toUpperCase());
}

function flags(endpoint) {
    return h(
        "div",
        { class: "flags" },
        endpoint.require_auth && h("span", { class: "badge warning" }, "auth"),
        !endpoint.require_auth && endpoint.inject_auth_metadata && h("span", { class: "badge" }, "optional auth"),
        (endpoint.allowed_roles ?? []).map((role) =>
            role === role.toLowerCase()
                ? h("span", { class: "badge accent" }, role)
                : h("span", { class: "badge danger", title: ROLE_CASE_WARNING }, `${role} ⚠`),
        ),
    );
}

// The server compares the user's role in lowercase against `allowed_roles` as written.
const ROLE_CASE_WARNING = "Roles with uppercase letters never match: the server compares roles in lowercase. Write them in lowercase.";

const ORIGIN_LABELS = {
    user: "Defined in the project",
    generated: "Generated from the database",
    internal: "Silence internal",
};

export async function view(selectedId) {
    let entries = await fetchEndpoints();

    const state = { filter: "", showInternal: false };

    const tbody = h("tbody");

    const search = h("input", {
        class: "input search",
        type: "search",
        placeholder: "Filter by id, route or method…",
        "aria-label": "Filter endpoints",
        onInput: debounce(() => {
            state.filter = search.value.trim().toLowerCase();
            renderRows();
        }),
    });

    const internalToggle = h("input", {
        type: "checkbox",
        onChange: () => {
            state.showInternal = internalToggle.checked;
            renderRows();
        },
    });

    const summary = h("span", { class: "muted", style: { marginLeft: "auto", fontSize: "12.5px" } });

    const matches = ({ endpoint }) =>
        !state.filter ||
        [endpoint.id, endpointUrl(endpoint), endpoint.method, endpoint.description ?? ""].some((value) =>
            value.toLowerCase().includes(state.filter),
        );

    const renderRows = () => {
        const visible = entries.filter((entry) => (state.showInternal || entry.origin !== "internal") && matches(entry));

        const groups = [];

        for (const originKey of ["user", "generated", "internal"]) {
            const ofOrigin = visible.filter((entry) => entry.origin === originKey);
            if (!ofOrigin.length) continue;

            if (originKey === "user") {
                const files = [...new Set(ofOrigin.map((entry) => entry.path))].sort();
                for (const file of files) {
                    groups.push([`${ORIGIN_LABELS.user} · endpoints/${file}`, ofOrigin.filter((entry) => entry.path === file)]);
                }
            } else {
                groups.push([ORIGIN_LABELS[originKey], ofOrigin]);
            }
        }

        summary.textContent = `${visible.length} of ${entries.length} endpoints`;

        if (!visible.length) {
            mount(tbody, h("tr", {}, h("td", { colspan: 5, class: "empty" }, "No endpoints match the filter.")));
            return;
        }

        mount(
            tbody,
            groups.map(([label, group]) => [
                h("tr", { class: "group" }, h("td", { colspan: 5 }, label)),
                group
                    .sort((a, b) => endpointUrl(a.endpoint).localeCompare(endpointUrl(b.endpoint)) || a.endpoint.method.localeCompare(b.endpoint.method))
                    .map((entry) =>
                        h(
                            "tr",
                            {
                                class: entry.endpoint.id === selectedId ? "clickable selected" : "clickable",
                                onClick: () => navigate(link("endpoints", entry.endpoint.id)),
                            },
                            h("td", {}, methodBadge(entry.endpoint.method)),
                            h("td", {}, h("span", { class: "endpoint-route" }, endpointUrl(entry.endpoint))),
                            h("td", {}, h("span", { class: "endpoint-id" }, entry.endpoint.id)),
                            h("td", {}, flags(entry.endpoint)),
                            h(
                                "td",
                                { class: "actions" },
                                h(
                                    "a",
                                    {
                                        class: "btn ghost small",
                                        href: link("tests", "new", entry.endpoint.id),
                                        title: "Try this endpoint",
                                        onClick: (event) => event.stopPropagation(),
                                    },
                                    icon("play"),
                                    "Try",
                                ),
                            ),
                        ),
                    ),
            ]),
        );
    };

    renderRows();

    const content = h(
        "div",
        {},
        h(
            "header",
            { class: "page-header" },
            h(
                "div",
                {},
                h("h1", {}, "Endpoints"),
                h("p", {}, "REST API of your project: endpoints you define plus the CRUD generated from the database."),
            ),
            h("div", { class: "actions" }, h("a", { class: "btn primary", href: link("endpoints", "new") }, icon("plus"), "New endpoint")),
        ),
        h("div", { class: "toolbar" }, search, h("label", { class: "check" }, internalToggle, "Show internal"), summary),
        h(
            "div",
            { class: "table-wrap" },
            h(
                "table",
                { class: "table" },
                h("thead", {}, h("tr", {}, h("th", {}, "Method"), h("th", {}, "URL"), h("th", {}, "Id"), h("th", {}, "Access"), h("th", {}))),
                tbody,
            ),
        ),
    );

    if (selectedId !== undefined) {
        const entry = selectedId === "new" ? null : entries.find((candidate) => candidate.endpoint.id === selectedId);

        if (selectedId !== "new" && !entry) {
            toast(`Endpoint \`${selectedId}\` doesn't exist.`, "error");
        } else {
            content.append(editor(entry));
        }
    }

    return content;
}

/** Normalizes `execute` to the `{ queries: [...] }` form. */
function queriesOf(endpoint) {
    const execute = endpoint?.execute;
    if (!execute) return [];
    if (Array.isArray(execute.queries)) return execute.queries.map((q) => ({ ...q }));
    if (typeof execute.query === "string") return [{ query: execute.query, include: execute.include, behaviour: execute.behaviour }];
    return [];
}

function queryBlock(entry, readonly, onRemove) {
    const editor = sqlEditor(entry.query ?? "", { readonly, rows: 4 });

    const include = h("input", { type: "checkbox", checked: entry.include !== false, disabled: readonly });

    const behaviour = h(
        "select",
        { class: "select", disabled: readonly, style: { width: "auto" } },
        BEHAVIOURS.map(([value, label]) => h("option", { value, selected: (entry.behaviour ?? "permissive") === value }, label)),
    );

    const el = h(
        "div",
        { class: "stack", style: { gap: "8px" } },
        editor.el,
        h(
            "div",
            { class: "row" },
            h("label", { class: "check" }, include, "Include result in the response"),
            behaviour,
            !readonly && onRemove && h("button", { class: "btn ghost small danger", type: "button", style: { marginLeft: "auto" }, onClick: onRemove }, icon("trash"), "Remove query"),
        ),
    );

    return {
        el,
        get: () => {
            const value = { query: editor.get().trim() };
            if (!include.checked) value.include = false;
            if (behaviour.value !== "permissive") value.behaviour = behaviour.value;
            return value;
        },
    };
}

function editor(entry) {
    const isNew = entry === null;
    const endpoint = entry?.endpoint ?? { id: "", method: "get", version: "v1", route: "", execute: { queries: [{ query: "" }] } };
    const kind = entry?.origin ?? "user";
    const readonly = kind === "internal";

    const close = () => navigate("#/endpoints");

    const input = (name, value, props = {}) => h("input", { class: "input", name, value: value ?? "", readonly, ...props });

    const id = input("id", endpoint.id, { required: true, pattern: "[A-Za-z0-9_.\\-]+", title: "Letters, digits, `_`, `.` and `-`." });
    const version = input("version", endpoint.version, { placeholder: "v1" });
    const route = input("route", endpoint.route, { required: true, placeholder: "employees/{id}" });
    const method = h(
        "select",
        { class: "select", name: "method", disabled: readonly },
        METHODS.map((value) => h("option", { value, selected: endpoint.method?.toLowerCase() === value }, value.toUpperCase())),
    );
    const description = h("textarea", { class: "textarea", rows: 2, readonly }, endpoint.description ?? "");
    const file = input("file", entry?.path ?? "default.json", { readonly: !isNew, placeholder: "default.json", pattern: ".+\\.json" });

    const urlPreview = h("code", {});
    const updatePreview = () => (urlPreview.textContent = endpointUrl({ version: version.value, route: route.value }));
    version.addEventListener("input", updatePreview);
    route.addEventListener("input", updatePreview);
    updatePreview();

    const queryParams = chipsInput(endpoint.query_params ?? [], { placeholder: "Add query param…", readonly });
    const bodyParams = chipsInput(endpoint.body_params ?? [], { placeholder: "Add body param…", readonly });
    const roles = chipsInput(endpoint.allowed_roles ?? [], { placeholder: "Add role…", readonly });

    const requireAuth = h("input", { type: "checkbox", checked: !!endpoint.require_auth, disabled: readonly });
    const injectAuth = h("input", { type: "checkbox", checked: !!endpoint.inject_auth_metadata, disabled: readonly });

    const queriesContainer = h("div", { class: "stack" });
    let queries = [];

    const renderQueries = (values) => {
        queries = values.map((value, ix) =>
            queryBlock(value, readonly, values.length > 1 ? () => renderQueries(collectQueries().filter((_, other) => other !== ix)) : null),
        );
        mount(queriesContainer, queries.map((block) => block.el));
    };

    const collectQueries = () => queries.map((block) => block.get());

    renderQueries(queriesOf(endpoint).length ? queriesOf(endpoint) : [{ query: "" }]);

    /** Builds the endpoint definition from the form. */
    const collect = () => {
        const value = {
            id: id.value.trim(),
            route: route.value.trim().replace(/^\/+/, ""),
            method: method.value,
            execute: { queries: collectQueries().filter((q) => q.query !== "") },
            query_params: queryParams.get(),
            body_params: bodyParams.get(),
            allowed_roles: roles.get(),
            require_auth: requireAuth.checked,
            inject_auth_metadata: injectAuth.checked,
        };

        if (version.value.trim()) value.version = version.value.trim();
        if (description.value.trim()) value.description = description.value.trim();

        return value;
    };

    // Form / JSON tabs: the JSON tab shows (and lets you edit) the exact body sent to the server.
    const jsonArea = h("textarea", { class: "textarea code", rows: 22, spellcheck: false, readonly });
    const formPane = h("div", {});
    const jsonPane = h("div", { hidden: true }, jsonArea, h("small", { class: "muted" }, "Editing the JSON and saving sends it as is."));

    let tab = "form";
    const tabButtons = {};

    const setTab = (next) => {
        if (next === tab) return;

        if (next === "json") {
            jsonArea.value = JSON.stringify(readonly ? endpoint : collect(), null, 2);
        }

        tab = next;
        formPane.hidden = tab !== "form";
        jsonPane.hidden = tab !== "json";

        for (const [key, button] of Object.entries(tabButtons)) button.setAttribute("aria-selected", String(key === tab));
    };

    tabButtons.form = h("button", { type: "button", "aria-selected": "true", onClick: () => setTab("form") }, "Form");
    tabButtons.json = h("button", { type: "button", "aria-selected": "false", onClick: () => setTab("json") }, "JSON");

    const field = (label, control, hint) => h("label", { class: "field" }, h("span", {}, label), control, hint && h("small", {}, hint));

    mount(
        formPane,
        kind === "generated" &&
            h(
                "div",
                { class: "alert info origin-note" },
                "Generated from the database schema. Saving changes turns it into an endpoint of your project (stored in endpoints/default.json).",
            ),
        kind === "internal" && h("div", { class: "alert origin-note" }, "Internal endpoint of Silence: it can't be modified or deleted."),
        h(
            "section",
            { class: "form-section" },
            h("header", {}, h("h3", {}, "Request")),
            h("div", { class: "form-grid" }, field("Id", id), field("Method", method)),
            h("div", { class: "form-grid" }, field("Version", version, "Optional URL prefix after /api"), field("Route", route, "Use {name} for path params")),
            h("div", { class: "url-preview" }, methodBadge(endpoint.method), urlPreview),
            field("Query params", queryParams.el, "Read from ?name=value"),
            field("Body params", bodyParams.el, "Read from the JSON body"),
        ),
        h(
            "section",
            { class: "form-section" },
            h(
                "header",
                {},
                h("h3", {}, "SQL"),
                h("p", {}, "{param} binds a request param. |user_id| is the authenticated user. Queries run in order."),
            ),
            queriesContainer,
            !readonly &&
                h(
                    "div",
                    {},
                    h("button", { class: "btn small", type: "button", onClick: () => renderQueries([...collectQueries(), { query: "" }]) }, icon("plus"), "Add query"),
                ),
        ),
        h(
            "section",
            { class: "form-section" },
            h("header", {}, h("h3", {}, "Access")),
            h("label", { class: "check" }, requireAuth, "Require authentication"),
            h("label", { class: "check" }, injectAuth, "Make the user available when signed in (|user_id|)"),
            field("Allowed roles", roles.el, "Empty: any authenticated user. Write roles in lowercase."),
        ),
        h(
            "section",
            { class: "form-section" },
            h("header", {}, h("h3", {}, "Details")),
            field("Description", description),
            field("File", file, isNew ? "Inside the project's endpoints folder" : null),
        ),
    );

    const save = async () => {
        let body;

        if (tab === "json") {
            try {
                body = JSON.parse(jsonArea.value);
            } catch (err) {
                toast(`Invalid JSON: ${err.message}`, "error");
                return;
            }
        } else {
            if (!id.reportValidity() || !route.reportValidity() || (isNew && !file.reportValidity())) return;
            body = collect();
        }

        try {
            if (isNew) {
                await api("POST", "/api/internal/admin/endpoints" + query({ target_file: file.value.trim() }), body);
            } else {
                await api("PUT", `/api/internal/admin/endpoints/${encodeURIComponent(endpoint.id)}`, body);
            }

            toast(`Endpoint ${body.id} saved.`, "success");
            refresh(link("endpoints", body.id));
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
            refresh("#/endpoints");
        } catch (err) {
            toast(err.message, "error");
        }
    };

    const onKey = (event) => {
        if (event.key === "Escape" && !document.querySelector("dialog[open]")) close();
        if ((event.ctrlKey || event.metaKey) && event.key === "s" && !readonly) {
            event.preventDefault();
            save();
        }
    };

    document.addEventListener("keydown", onKey);
    addEventListener("hashchange", () => document.removeEventListener("keydown", onKey), { once: true });

    return h(
        "div",
        {},
        h("div", { class: "drawer-backdrop", onClick: close }),
        h(
            "aside",
            { class: "drawer", role: "dialog", "aria-label": "Endpoint editor" },
            h(
                "header",
                {},
                h("h2", {}, isNew ? "New endpoint" : endpoint.id),
                h(
                    "div",
                    { class: "row" },
                    h("div", { class: "tabs" }, tabButtons.form, tabButtons.json),
                    h("button", { class: "btn ghost small", type: "button", "aria-label": "Close", onClick: close }, icon("x")),
                ),
            ),
            h("div", { class: "drawer-body" }, formPane, jsonPane),
            h(
                "footer",
                {},
                !readonly && h("button", { class: "btn primary", type: "button", onClick: save }, icon("save"), "Save"),
                !isNew && h("a", { class: "btn", href: link("tests", "new", endpoint.id) }, icon("play"), "Try"),
                h("span", { class: "spacer" }),
                !isNew && !readonly && h("button", { class: "btn danger", type: "button", onClick: remove }, icon("trash"), "Delete"),
            ),
        ),
    );
}

export { methodBadge };
