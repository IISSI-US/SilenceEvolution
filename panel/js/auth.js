// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Login / sign up page (`/auth2?redirect=/admin2`).

import { api, ApiError, safeRedirect, setSessionToken } from "./api.js";
import { h, mount } from "./dom.js";

const root = document.getElementById("auth");
const redirect = safeRedirect(new URLSearchParams(location.search).get("redirect"), "/");

function field(label, props) {
    return h("label", { class: "field" }, h("span", {}, label), h("input", { class: "input", required: true, ...props }));
}

function render(mode) {
    const isLogin = mode === "login";
    const error = h("div", { class: "alert danger", role: "alert", hidden: true });
    const submit = h("button", { class: "btn primary", type: "submit" }, isLogin ? "Sign in" : "Create account");

    const password = field("Password", {
        name: "password",
        type: "password",
        minlength: 4,
        autocomplete: isLogin ? "current-password" : "new-password",
    });
    const passwordCheck = !isLogin && field("Repeat password", { name: "password_check", type: "password", autocomplete: "new-password" });

    const form = h(
        "form",
        {
            onSubmit: async (event) => {
                event.preventDefault();

                const data = Object.fromEntries(new FormData(form));

                if (!isLogin && data.password !== data.password_check) {
                    error.textContent = "Passwords do not match.";
                    error.hidden = false;
                    return;
                }

                delete data.password_check;

                submit.disabled = true;
                error.hidden = true;

                try {
                    const response = await api("POST", isLogin ? "/api/internal/login" : "/api/internal/signup", data);

                    // Sign up returns the token but doesn't set the session cookie.
                    if (response?.token) setSessionToken(response.token);

                    location.replace(redirect);
                } catch (err) {
                    error.textContent = err instanceof ApiError ? err.message : String(err);
                    error.hidden = false;
                    submit.disabled = false;
                }
            },
        },
        error,
        !isLogin && field("Name", { name: "name", autocomplete: "name", maxlength: 64 }),
        field("Email", { name: "email", type: "email", autocomplete: "email", maxlength: 32 }),
        password,
        passwordCheck,
        submit,
    );

    mount(
        root,
        h("div", { class: "brand" }, "Silence"),
        h("p", { class: "subtitle" }, isLogin ? "Sign in to continue" : "Create a new account"),
        h(
            "div",
            { class: "tabs", role: "tablist" },
            h("button", { type: "button", role: "tab", "aria-selected": String(isLogin), onClick: () => render("login") }, "Sign in"),
            h("button", { type: "button", role: "tab", "aria-selected": String(!isLogin), onClick: () => render("signup") }, "Sign up"),
        ),
        form,
    );

    form.querySelector("input")?.focus();
}

// Skip the form when there's already a valid session.
try {
    await api("GET", "/api/internal/whoami");
    location.replace(redirect);
} catch {
    render(new URLSearchParams(location.search).get("mode") === "signup" ? "signup" : "login");
}
