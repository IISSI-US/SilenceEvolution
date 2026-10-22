// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Admin panel entry point: session check, layout and routing (`@solidjs/router`, hash mode).

import { createResource, Match, Switch } from "solid-js";
import { render } from "solid-js/web";
import html from "solid-js/html";
import { A, HashRouter, Navigate, Route } from "@solidjs/router";

import { api, clearSessionToken } from "./api.js";
import { loadHighlighters } from "./highlight.js";
import { Console } from "./console.js";
import { Icon, Loading } from "./ui.js";

import { Endpoints } from "./views/endpoints.js";
import { Tests } from "./views/tests.js";
import { Users } from "./views/users.js";
import { Settings } from "./views/config.js";

const SECTIONS = [
    { path: "/endpoints", label: "Endpoints", icon: "endpoints" },
    { path: "/tests", label: "Tests", icon: "tests" },
    { path: "/users", label: "Users", icon: "users" },
    { path: "/config", label: "Settings", icon: "config" },
];

// Zero-argument functions passed as component props are turned into getters by `solid-js/html`
// (they'd run immediately), so route components are wrapped in a one-parameter function.
const page = (Component) => (props) => Component(props);

const ToEndpoints = (_props) => html`<${Navigate} href="/endpoints" />`;

const isAdmin = (session) => session?.role?.toLowerCase() === "admin";

/** Resolves the current session; an authenticated non-admin user may become admin through bootstrap. */
async function fetchSession() {
    let session;

    try {
        session = await api("GET", "/api/internal/whoami");
    } catch {
        location.replace("/auth2?redirect=" + encodeURIComponent("/admin2" + location.hash));
        return null;
    }

    if (!isAdmin(session)) {
        try {
            const bootstrap = await api("GET", "/api/internal/bootstrap");
            session.role = bootstrap?.role ?? session.role;
        } catch {
            // The user has no role (or bootstrap failed): handled as non-admin.
        }
    }

    return session;
}

async function logout() {
    try {
        await api("GET", "/api/internal/logout");
    } catch {}

    clearSessionToken();
    location.replace("/auth2?redirect=/admin2");
}

function Shell(props) {
    return html`
        <div class="app">
            <aside class="sidebar">
                <div class="brand">Silence <small>admin</small></div>
                <nav class="nav">${() => props.nav}</nav>
                <div class="sidebar-footer">
                    <div class="whoami">
                        <strong>${() => props.session.name}</strong>
                        <span>${() => props.session.email}</span>
                    </div>
                    <button class="btn small" type="button" onClick=${logout}><${Icon} name="logout" /> Sign out</button>
                </div>
            </aside>
            <div class="main">
                <main class="page">${() => props.children}</main>
                <${Console} />
            </div>
        </div>
    `;
}

function NotAdmin(props) {
    return html`
        <${Shell} session=${props.session}>
            <div class="card card-body" style="max-width: 560px">
                <h1>Admin role required</h1>
                <p class="muted" style="margin-top: 8px">
                    You're signed in as ${props.session.email}, but this account doesn't have the admin role. The first user to sign up
                    becomes admin automatically. Otherwise, give this user the role in the internal database:
                </p>
                <pre class="code-block" style="margin-top: 12px">
INSERT INTO silence_roles (user_id, role) VALUES (${Number(props.session.user_id)}, 'admin');</pre
                >
            </div>
        <//>
    `;
}

function App() {
    const [session] = createResource(fetchSession);

    // Layout shared by every route: navigation + page + console.
    const Layout = (props) => html`
        <${Shell}
            session=${session}
            nav=${SECTIONS.map(
                (section) => html`<${A} href=${section.path} activeClass="active"><${Icon} name=${section.icon} /> ${section.label}<//>`,
            )}
        >
            ${() => props.children}
        <//>
    `;

    return html`
        <${Switch} fallback=${html`<${Loading} text="Loading…" />`}>
            <${Match} when=${() => session() === null}><${Loading} text="Redirecting to sign in…" /><//>
            <${Match} when=${() => session() && !isAdmin(session())}><${NotAdmin} session=${session} /><//>
            <${Match} when=${() => isAdmin(session())}>
                <${HashRouter} root=${Layout}>
                    <${Route} path="/" component=${ToEndpoints} />
                    <${Route} path="/endpoints/:id?" component=${page(Endpoints)} />
                    <${Route} path="/tests/new/:endpoint?" component=${page(Tests)} />
                    <${Route} path="/tests/:name?" component=${page(Tests)} />
                    <${Route} path="/users" component=${page(Users)} />
                    <${Route} path="/config" component=${page(Settings)} />
                    <${Route} path="*" component=${ToEndpoints} />
                <//>
            <//>
        <//>
    `;
}

// Grammars are local: loading them first keeps highlighting synchronous in every view.
await loadHighlighters();

render(() => html`<${App} />`, document.getElementById("root"));
