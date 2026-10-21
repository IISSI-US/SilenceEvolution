// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Admin panel entry point: session check, navigation, console and routing.

import { api, clearSessionToken } from "./api.js";
import { mountConsole } from "./console.js";
import { h, icon, mount, loading } from "./dom.js";
import { startRouter } from "./router.js";

import * as endpoints from "./views/endpoints.js";
import * as tests from "./views/tests.js";
import * as users from "./views/users.js";
import * as config from "./views/config.js";

const page = document.getElementById("page");
const nav = document.getElementById("nav");
const footer = document.getElementById("sidebar-footer");

const SECTIONS = [
    { path: "/endpoints", label: "Endpoints", icon: "endpoints" },
    { path: "/tests", label: "Tests", icon: "tests" },
    { path: "/users", label: "Users", icon: "users" },
    { path: "/config", label: "Settings", icon: "config" },
];

const ROUTES = [
    { pattern: "/endpoints", section: "/endpoints", view: () => endpoints.view() },
    { pattern: "/endpoints/:id", section: "/endpoints", view: (params) => endpoints.view(params.id) },
    { pattern: "/tests", section: "/tests", view: () => tests.view() },
    { pattern: "/tests/new", section: "/tests", view: () => tests.view({ isNew: true }) },
    { pattern: "/tests/new/:endpoint", section: "/tests", view: (params) => tests.view({ isNew: true, endpointId: params.endpoint }) },
    { pattern: "/tests/:name", section: "/tests", view: (params) => tests.view({ name: params.name }) },
    { pattern: "/users", section: "/users", view: () => users.view() },
    { pattern: "/config", section: "/config", view: () => config.view() },
];

/** Resolves the current session; an authenticated non-admin user may become admin through bootstrap. */
async function getSession() {
    let session;

    try {
        session = await api("GET", "/api/internal/whoami");
    } catch {
        location.replace("/auth2?redirect=" + encodeURIComponent("/admin2" + location.hash));
        return null;
    }

    if (session.role?.toLowerCase() !== "admin") {
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

function renderSidebar(session) {
    mount(
        footer,
        h("div", { class: "whoami" }, h("strong", {}, session.name), h("span", {}, session.email)),
        h("button", { class: "btn small", type: "button", onClick: logout }, icon("logout"), "Sign out"),
    );

    mount(
        nav,
        SECTIONS.map((section) => h("a", { href: "#" + section.path, dataset: { section: section.path } }, icon(section.icon), section.label)),
    );
}

function renderNotAdmin(session) {
    nav.replaceChildren();

    mount(
        page,
        h(
            "div",
            { class: "card card-body", style: { maxWidth: "560px" } },
            h("h1", {}, "Admin role required"),
            h(
                "p",
                { class: "muted", style: { marginTop: "8px" } },
                `You're signed in as ${session.email}, but this account doesn't have the admin role. `,
                "The first user to sign up becomes admin automatically. Otherwise, give this user the role in the internal database:",
            ),
            h(
                "pre",
                { class: "code-block", style: { marginTop: "12px" } },
                `INSERT INTO silence_roles (user_id, role) VALUES (${Number(session.user_id)}, 'admin');`,
            ),
        ),
    );
}

const session = await getSession();

if (session) {
    renderSidebar(session);
    mountConsole(document.getElementById("console"));

    if (session.role?.toLowerCase() !== "admin") {
        renderNotAdmin(session);
    } else {
        let renderId = 0;

        startRouter(
            ROUTES,
            async (route, params) => {
                const id = ++renderId;

                for (const link of nav.querySelectorAll("a")) {
                    link.toggleAttribute("aria-current", link.dataset.section === route.section);
                    if (link.dataset.section === route.section) link.setAttribute("aria-current", "page");
                }

                mount(page, loading());

                try {
                    const content = await route.view(params);
                    if (id === renderId) mount(page, content);
                } catch (err) {
                    if (id === renderId) {
                        mount(page, h("div", { class: "alert danger" }, err?.message ?? String(err)));
                    }
                }
            },
            "/endpoints",
        );
    }

    page.focus?.();
} else {
    mount(page, loading("Redirecting to sign in…"));
}
