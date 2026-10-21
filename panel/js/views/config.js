// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Project settings (`config.json`). The server replaces nested objects as a whole, so the full
// configuration is always sent back.

import { api } from "../api.js";
import { chipsInput, h, icon, toast } from "../dom.js";
import { codeBlock, highlightJSON } from "../highlight.js";
import { refresh } from "../router.js";

const SOCKET_ADDR = "^(\\d{1,3}\\.){3}\\d{1,3}:\\d{1,5}$";

function input(value, props = {}) {
    return h("input", { class: "input", value: value ?? "", ...props });
}

function field(label, control, hint) {
    return h("label", { class: "field" }, h("span", {}, label), control, hint && h("small", {}, hint));
}

/** Connection fields for a database. Returns `{ el, get }`. */
function connectionFields(conn) {
    const host = input(conn?.host ?? "127.0.0.1:3306", { required: true, pattern: SOCKET_ADDR, title: "IP address and port, e.g. 127.0.0.1:3306" });
    const db = input(conn?.db, { required: true });
    const username = input(conn?.username, { required: true, autocomplete: "off" });
    const password = input(conn?.password, { type: "password", autocomplete: "new-password" });

    const reveal = h("button", { class: "btn ghost small", type: "button", onClick: () => (password.type = password.type === "password" ? "text" : "password") }, "Show");

    return {
        el: h(
            "div",
            { class: "form-grid" },
            field("Host", host, "IP:port (host names aren't supported)"),
            field("Database", db),
            field("User", username),
            field("Password", h("div", { class: "row", style: { flexWrap: "nowrap" } }, password, reveal)),
        ),
        inputs: [host, db, username, password],
        get: () => ({ host: host.value.trim(), db: db.value.trim(), username: username.value.trim(), password: password.value }),
    };
}

export async function view() {
    const config = await api("GET", "/api/internal/admin/config");

    const listening = input(config.listening_addr, { pattern: SOCKET_ADDR, placeholder: "127.0.0.1:8080" });
    const serveStatic = h("input", { type: "checkbox", checked: !!config.serve_static_files });

    const main = connectionFields(config.databases_conn?.main);

    const useInternal = h("input", { type: "checkbox", checked: !!config.databases_conn?.internal });
    const internal = connectionFields(config.databases_conn?.internal ?? { ...config.databases_conn?.main, db: "silence_db" });
    const internalBox = h("div", { hidden: !useInternal.checked }, internal.el);
    useInternal.addEventListener("change", () => (internalBox.hidden = !useInternal.checked));

    const params = config.internal_params ?? {};
    const usersTable = input(params.users_target_table, { required: true });
    const sessionsTable = input(params.sessions_target_table, { required: true });
    const rolesTable = input(params.roles_target_table, { required: true });

    const skipTables = chipsInput(config.skip_discovery_tables ?? [], { placeholder: "Add table…" });
    const skipIds = chipsInput(config.skip_endpoints_ids ?? [], { placeholder: "Add endpoint id…" });

    const form = h("form", { class: "card card-body", novalidate: false });

    const collect = () => {
        const value = {
            serve_static_files: serveStatic.checked,
            internal_params: {
                users_target_table: usersTable.value.trim(),
                sessions_target_table: sessionsTable.value.trim(),
                roles_target_table: rolesTable.value.trim(),
            },
            skip_discovery_tables: skipTables.get(),
            skip_endpoints_ids: skipIds.get(),
            databases_conn: {
                main: main.get(),
                internal: useInternal.checked ? internal.get() : null,
            },
        };

        if (listening.value.trim()) value.listening_addr = listening.value.trim();

        return value;
    };

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        // Internal DB fields only matter when enabled.
        for (const control of internal.inputs) control.disabled = !useInternal.checked;
        const valid = form.reportValidity();
        for (const control of internal.inputs) control.disabled = false;
        if (!valid) return;

        try {
            await api("PUT", "/api/internal/admin/config", collect());
            toast("Settings saved. Restart the server to apply database and discovery changes.", "success");
            refresh("#/config");
        } catch (err) {
            toast(err.message, "error");
        }
    });

    const section = (title, description, ...children) =>
        h("section", { class: "form-section" }, h("header", {}, h("h2", {}, title), description && h("p", {}, description)), ...children);

    form.append(
        section(
            "Server",
            "Changes to the listening address apply on the next start.",
            h("div", { class: "form-grid" }, field("Listening address", listening, "IP:port")),
            h("label", { class: "check" }, serveStatic, "Serve the project's web/ (or static/) folder at /"),
        ),
        section("Database", "Database of your app. Its tables are exposed as CRUD endpoints.", main.el),
        section(
            "Users database",
            "Where accounts, sessions and roles are stored.",
            h("label", { class: "check" }, useInternal, "Use a separate database (otherwise, the main one)"),
            internalBox,
            h(
                "div",
                { class: "form-grid" },
                field("Users table", usersTable),
                field("Sessions table", sessionsTable),
                field("Roles table", rolesTable),
            ),
        ),
        section(
            "Endpoint discovery",
            "Tables and generated endpoints left out of the API. Restart the server to apply.",
            field("Skipped tables", skipTables.el),
            field("Hidden endpoints", skipIds.el, "Deleting a generated endpoint adds it here; remove it to restore the endpoint."),
        ),
        h("div", { class: "row", style: { paddingTop: "16px", borderTop: "1px solid var(--border)" } }, h("button", { class: "btn primary", type: "submit" }, icon("save"), "Save settings")),
    );

    const raw = h(
        "details",
        { class: "card card-body", style: { marginTop: "16px" } },
        h("summary", { style: { cursor: "pointer", fontWeight: 600 } }, "config.json"),
        h("div", { style: { marginTop: "12px" } }, codeBlock(highlightJSON(config))),
    );

    return h(
        "div",
        { style: { maxWidth: "900px" } },
        h("header", { class: "page-header" }, h("div", {}, h("h1", {}, "Settings"), h("p", {}, "Project configuration, stored in config.json."))),
        h("div", { class: "alert", style: { marginBottom: "16px" } }, "Database passwords are shown to admins and saved in plain text in config.json."),
        form,
        raw,
    );
}
