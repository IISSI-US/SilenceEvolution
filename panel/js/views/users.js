// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Users of the internal database (accounts that can sign in to the app) and their role.

import { api } from "../api.js";
import { confirmAction, debounce, h, icon, modal, mount, toast } from "../dom.js";
import { refresh } from "../router.js";

function roleBadge(role) {
    if (!role) return h("span", { class: "muted" }, "—");
    return h("span", { class: role.toLowerCase() === "admin" ? "badge accent" : "badge" }, role);
}

async function editUser(user) {
    const isNew = user === null;

    const field = (label, props, hint) =>
        h("label", { class: "field" }, h("span", {}, label), h("input", { class: "input", ...props }), hint && h("small", {}, hint));

    const body = h(
        "div",
        { class: "stack", style: { gap: "12px" } },
        field("Name", { name: "name", required: true, maxlength: 64, value: user?.name ?? "" }),
        field("Email", { name: "email", type: "email", required: true, maxlength: 32, value: user?.email ?? "" }),
        field("Role", { name: "role", maxlength: 16, value: user?.role ?? "", list: "known-roles" }, "Leave empty for no role. Only admin can use this panel."),
        h("datalist", { id: "known-roles" }, h("option", { value: "admin" })),
        isNew
            ? h(
                  "div",
                  { class: "alert" },
                  "Accounts created here can't sign in yet: the server stores this password without hashing it. Ask the user to sign up instead, then give them a role here.",
              )
            : h("p", { class: "muted", style: { fontSize: "12.5px" } }, "The password can't be changed from here (the server would store it without hashing it)."),
        isNew && field("Password", { name: "password", type: "password", required: true, minlength: 4, autocomplete: "new-password" }),
    );

    // Run the native validation before closing the dialog.
    queueMicrotask(() => {
        const form = body.closest("form");
        form?.querySelector("button[value=confirm]")?.addEventListener("click", (event) => {
            if (!form.checkValidity()) {
                event.preventDefault();
                form.reportValidity();
            }
        });
    });

    if ((await modal({ title: isNew ? "New user" : `Edit ${user.name}`, body, confirmLabel: isNew ? "Create" : "Save" })) !== "confirm") return;

    const values = Object.fromEntries([...body.querySelectorAll("input")].map((input) => [input.name, input.value.trim()]));

    try {
        if (isNew) {
            await api("POST", "/api/internal/admin/users", values);
        } else {
            // `role` is always required by the server; an empty role is removed afterwards.
            await api("PUT", `/api/internal/admin/users/${user.user_id}`, { name: values.name, email: values.email, role: values.role });
            if (!values.role) await api("DELETE", `/api/internal/admin/users/${user.user_id}/role`);
        }

        toast(isNew ? `User ${values.name} created.` : `User ${values.name} updated.`, "success");
    } catch (err) {
        toast(err.message, "error");
    }

    refresh("#/users");
}

async function deleteUser(user) {
    if (!(await confirmAction("Delete user", `${user.name} (${user.email}) and all their sessions will be deleted.`))) return;

    try {
        await api("DELETE", `/api/internal/admin/users/${user.user_id}`);
        toast(`User ${user.name} deleted.`, "success");
    } catch (err) {
        toast(err.message, "error");
    }

    refresh("#/users");
}

export async function view() {
    const users = ((await api("GET", "/api/internal/admin/users")) ?? []).sort((a, b) => a.user_id - b.user_id);
    const me = await api("GET", "/api/internal/whoami");

    const tbody = h("tbody");
    let filter = "";

    const renderRows = () => {
        const visible = users.filter((user) => !filter || [user.name, user.email, user.role ?? ""].some((value) => value.toLowerCase().includes(filter)));

        mount(
            tbody,
            visible.length === 0
                ? h("tr", {}, h("td", { colspan: 5, class: "empty" }, users.length ? "No users match the filter." : "No users yet."))
                : visible.map((user) =>
                      h(
                          "tr",
                          {},
                          h("td", { class: "muted mono" }, String(user.user_id)),
                          h("td", {}, user.name, user.user_id === me.user_id && h("span", { class: "badge", style: { marginLeft: "8px" } }, "you")),
                          h("td", {}, user.email),
                          h("td", {}, roleBadge(user.role)),
                          h(
                              "td",
                              { class: "actions" },
                              h("button", { class: "btn ghost small", type: "button", onClick: () => editUser(user) }, "Edit"),
                              user.user_id !== me.user_id &&
                                  h("button", { class: "btn ghost small danger", type: "button", "aria-label": `Delete ${user.name}`, onClick: () => deleteUser(user) }, icon("trash")),
                          ),
                      ),
                  ),
        );
    };

    const search = h("input", {
        class: "input search",
        type: "search",
        placeholder: "Filter by name, email or role…",
        "aria-label": "Filter users",
        onInput: debounce(() => {
            filter = search.value.trim().toLowerCase();
            renderRows();
        }),
    });

    renderRows();

    return h(
        "div",
        {},
        h(
            "header",
            { class: "page-header" },
            h("div", {}, h("h1", {}, "Users"), h("p", {}, "Accounts of your app (internal database). Users sign up from /auth2 or through the SignUp endpoint.")),
            h("div", { class: "actions" }, h("button", { class: "btn primary", type: "button", onClick: () => editUser(null) }, icon("plus"), "New user")),
        ),
        h("div", { class: "toolbar" }, search, h("span", { class: "muted", style: { marginLeft: "auto", fontSize: "12.5px" } }, `${users.length} users`)),
        h(
            "div",
            { class: "table-wrap" },
            h(
                "table",
                { class: "table" },
                h("thead", {}, h("tr", {}, h("th", {}, "Id"), h("th", {}, "Name"), h("th", {}, "Email"), h("th", {}, "Role"), h("th", {}))),
                tbody,
            ),
        ),
    );
}
