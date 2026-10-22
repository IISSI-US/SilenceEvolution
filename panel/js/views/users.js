// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Users of the internal database (accounts that can sign in to the app) and their role.
// Written with Solid without a build step: `html` tagged templates instead of JSX.

import { createMemo, createResource, createSignal, For, onMount, Show } from "solid-js";
import html from "solid-js/html";

import { api } from "../api.js";
import { confirmAction, toast } from "../dom.js";
import { Icon, Loading, PageHeader } from "../ui.js";

const fetchUsers = async () => {
    const [users, me] = await Promise.all([api("GET", "/api/internal/admin/users"), api("GET", "/api/internal/whoami")]);
    return { users: (users ?? []).sort((a, b) => a.user_id - b.user_id), me };
};

function RoleBadge(props) {
    return html`
        <${Show} when=${() => props.role} fallback=${html`<span class="muted">—</span>`}>
            <span class=${() => (props.role.toLowerCase() === "admin" ? "badge accent" : "badge")}>${() => props.role}</span>
        <//>
    `;
}

/** Create/edit dialog. `props.user` is null for a new user; `props.onClose(changed)` closes it. */
function UserDialog(props) {
    const isNew = props.user === null;
    const [saving, setSaving] = createSignal(false);
    let dialog;
    let form;

    onMount(() => dialog.showModal());

    const submit = async (event) => {
        event.preventDefault();

        const values = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, String(value).trim()]));

        setSaving(true);

        try {
            if (isNew) {
                await api("POST", "/api/internal/admin/users", values);
            } else {
                // `role` is always required by the server; an empty role is removed afterwards.
                await api("PUT", `/api/internal/admin/users/${props.user.user_id}`, { name: values.name, email: values.email, role: values.role });
                if (!values.role) await api("DELETE", `/api/internal/admin/users/${props.user.user_id}/role`);
            }

            toast(isNew ? `User ${values.name} created.` : `User ${values.name} updated.`, "success");
            props.onClose(true);
        } catch (err) {
            toast(err.message, "error");
            setSaving(false);
        }
    };

    return html`
        <dialog class="modal" ref=${(el) => (dialog = el)} onClose=${() => props.onClose(false)}>
            <form ref=${(el) => (form = el)} onSubmit=${submit}>
                <header><h2>${isNew ? "New user" : `Edit ${props.user.name}`}</h2></header>
                <div class="modal-body">
                    <label class="field">
                        <span>Name</span>
                        <input class="input" name="name" required maxlength="64" value=${props.user?.name ?? ""} />
                    </label>
                    <label class="field">
                        <span>Email</span>
                        <input class="input" name="email" type="email" required maxlength="32" value=${props.user?.email ?? ""} />
                    </label>
                    <label class="field">
                        <span>Role</span>
                        <input class="input" name="role" maxlength="16" list="known-roles" value=${props.user?.role ?? ""} />
                        <datalist id="known-roles"><option value="admin"></option></datalist>
                        <small>Leave empty for no role. Only admin can use this panel.</small>
                    </label>
                    <${Show}
                        when=${isNew}
                        fallback=${html`<p class="muted" style="font-size: 12.5px">The password can't be changed from here (the server would store it without hashing it).</p>`}
                    >
                        <div class="alert">
                            Accounts created here can't sign in yet: the server stores this password without hashing it. Ask the user to sign
                            up instead, then give them a role here.
                        </div>
                        <label class="field">
                            <span>Password</span>
                            <input class="input" name="password" type="password" required minlength="4" autocomplete="new-password" />
                        </label>
                    <//>
                </div>
                <footer>
                    <button class="btn" type="button" onClick=${() => dialog.close()}>Cancel</button>
                    <button class="btn primary" type="submit" disabled=${saving}>${isNew ? "Create" : "Save"}</button>
                </footer>
            </form>
        </dialog>
    `;
}

export function Users() {
    const [data, { refetch }] = createResource(fetchUsers);
    const [filter, setFilter] = createSignal("");
    // `undefined`: no dialog; `null`: new user; object: user being edited.
    const [editing, setEditing] = createSignal(undefined);

    const visible = createMemo(() => {
        const text = filter().trim().toLowerCase();
        return (data()?.users ?? []).filter((user) => !text || [user.name, user.email, user.role ?? ""].some((value) => value.toLowerCase().includes(text)));
    });

    const remove = async (user) => {
        if (!(await confirmAction("Delete user", `${user.name} (${user.email}) and all their sessions will be deleted.`))) return;

        try {
            await api("DELETE", `/api/internal/admin/users/${user.user_id}`);
            toast(`User ${user.name} deleted.`, "success");
            refetch();
        } catch (err) {
            toast(err.message, "error");
        }
    };

    const closeDialog = (changed) => {
        setEditing(undefined);
        if (changed) refetch();
    };

    return html`
        <div>
            <${PageHeader}
                title="Users"
                description="Accounts of your app (internal database). Users sign up from /auth2 or through the SignUp endpoint."
                actions=${html`<button class="btn primary" type="button" onClick=${() => setEditing(null)}><${Icon} name="plus" /> New user</button>`}
            />

            <div class="toolbar">
                <input
                    class="input search"
                    type="search"
                    placeholder="Filter by name, email or role…"
                    aria-label="Filter users"
                    onInput=${(event) => setFilter(event.target.value)}
                />
                <span class="muted" style="margin-left: auto; font-size: 12.5px">${() => `${data()?.users.length ?? 0} users`}</span>
            </div>

            <${Show} when=${() => !data.loading} fallback=${html`<${Loading} />`}>
                <${Show} when=${() => !data.error} fallback=${() => html`<div class="alert danger">${() => data.error?.message}</div>`}>
                    <div class="table-wrap">
                        <table class="table">
                            <thead>
                                <tr><th>Id</th><th>Name</th><th>Email</th><th>Role</th><th></th></tr>
                            </thead>
                            <tbody>
                                <${For}
                                    each=${visible}
                                    fallback=${html`<tr><td colspan="5" class="empty">${() => (data()?.users.length ? "No users match the filter." : "No users yet.")}</td></tr>`}
                                >
                                    ${(user) => html`
                                        <tr>
                                            <td class="muted mono">${user.user_id}</td>
                                            <td>
                                                ${user.name}
                                                <${Show} when=${() => user.user_id === data()?.me.user_id}>
                                                    <span class="badge" style="margin-left: 8px">you</span>
                                                <//>
                                            </td>
                                            <td>${user.email}</td>
                                            <td><${RoleBadge} role=${user.role} /></td>
                                            <td class="actions">
                                                <button class="btn ghost small" type="button" onClick=${() => setEditing(user)}>Edit</button>
                                                <${Show} when=${() => user.user_id !== data()?.me.user_id}>
                                                    <button
                                                        class="btn ghost small danger"
                                                        type="button"
                                                        aria-label=${`Delete ${user.name}`}
                                                        onClick=${() => remove(user)}
                                                    >
                                                        <${Icon} name="trash" />
                                                    </button>
                                                <//>
                                            </td>
                                        </tr>
                                    `}
                                <//>
                            </tbody>
                        </table>
                    </div>
                <//>
            <//>

            <${Show} when=${() => editing() !== undefined} keyed=${true}>
                ${() => html`<${UserDialog} user=${editing()} onClose=${closeDialog} />`}
            <//>
        </div>
    `;
}
