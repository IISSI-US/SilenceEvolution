// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Login / sign up page (`/auth2?redirect=/admin2`).

import { createResource, createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import html from "solid-js/html";

import { api, safeRedirect, setSessionToken } from "./api.js";
import { Field, Loading, Tabs } from "./ui.js";

const search = new URLSearchParams(location.search);
const redirect = safeRedirect(search.get("redirect"), "/");

/** Resolves to true when there's already a valid session (then the page redirects). */
async function hasSession() {
    try {
        await api("GET", "/api/internal/whoami");
        location.replace(redirect);
        return true;
    } catch {
        return false;
    }
}

function AuthForm() {
    const [mode, setMode] = createSignal(search.get("mode") === "signup" ? "signup" : "login");
    const [error, setError] = createSignal(null);
    const [busy, setBusy] = createSignal(false);

    const isLogin = () => mode() === "login";

    const submit = async (event) => {
        event.preventDefault();

        const data = Object.fromEntries(new FormData(event.currentTarget));

        if (!isLogin() && data.password !== data.password_check) {
            setError("Passwords do not match.");
            return;
        }

        delete data.password_check;

        setBusy(true);
        setError(null);

        try {
            const response = await api("POST", isLogin() ? "/api/internal/login" : "/api/internal/signup", data);

            // Sign up returns the token but doesn't set the session cookie.
            if (response?.token) setSessionToken(response.token);

            location.replace(redirect);
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    return html`
        <div class="brand">Silence</div>
        <p class="subtitle">${() => (isLogin() ? "Sign in to continue" : "Create a new account")}</p>
        <${Tabs}
            tabs=${[
                ["login", "Sign in"],
                ["signup", "Sign up"],
            ]}
            value=${mode}
            onChange=${(value) => {
                setError(null);
                setMode(value);
            }}
        />
        <form onSubmit=${submit}>
            <${Show} when=${error}><div class="alert danger" role="alert">${error}</div><//>
            <${Show} when=${() => !isLogin()}>
                <${Field} label="Name"><input class="input" name="name" required autocomplete="name" maxlength="64" /><//>
            <//>
            <${Field} label="Email"><input class="input" name="email" type="email" required autocomplete="email" maxlength="32" /><//>
            <${Field} label="Password">
                <input
                    class="input"
                    name="password"
                    type="password"
                    required
                    minlength="4"
                    autocomplete=${() => (isLogin() ? "current-password" : "new-password")}
                />
            <//>
            <${Show} when=${() => !isLogin()}>
                <${Field} label="Repeat password">
                    <input class="input" name="password_check" type="password" required autocomplete="new-password" />
                <//>
            <//>
            <button class="btn primary" type="submit" disabled=${busy}>${() => (isLogin() ? "Sign in" : "Create account")}</button>
        </form>
    `;
}

function Auth() {
    const [session] = createResource(hasSession);

    return html`
        <${Show} when=${() => session() === false} fallback=${html`<${Loading} />`}>
            <${AuthForm} />
        <//>
    `;
}

render(() => html`<${Auth} />`, document.getElementById("auth"));
