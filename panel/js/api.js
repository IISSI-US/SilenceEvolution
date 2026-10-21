// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// API client for the admin panel. Quirks of the server that are handled here:
// - Responses are cached server side regardless of the session, so every request sends
//   `Cache-Control: no-cache`.
// - The session cookie is only recognized when it's the first cookie of the request, so the token
//   is also sent in the `Authorization` header (raw token, no `Bearer`).
// - Successful mutations answer with an empty body.
// - Errors are `{ "error": "..." }`.

export class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const COOKIE = "Authorization";

/** Returns the session token stored in the `Authorization` cookie, if any. */
export function sessionToken() {
    const entry = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(COOKIE + "="));

    return entry ? decodeURIComponent(entry.slice(COOKIE.length + 1)) : null;
}

/** Stores the session token as the server does on login. */
export function setSessionToken(token) {
    document.cookie = `${COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=3600`;
}

export function clearSessionToken() {
    document.cookie = `${COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`;
}

/** Parses a response body: `null` when empty, JSON when possible, raw text otherwise. */
export async function readBody(response) {
    const text = await response.text();

    if (text.trim() === "") return null;

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

/** Extracts a readable error message from a parsed error body. */
export function errorMessage(body, status) {
    if (body && typeof body === "object" && typeof body.error === "string") return body.error;
    if (typeof body === "string" && body) return body;
    return `Request failed with status ${status}.`;
}

/**
 * Calls the API with the admin's session. `body` is serialized as JSON. Resolves with the parsed
 * body (or `null`), rejects with `ApiError`.
 */
export async function api(method, path, body) {
    const headers = { "Cache-Control": "no-cache" };
    const token = sessionToken();

    if (token) headers.Authorization = token;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let response;

    try {
        response = await fetch(path, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch {
        throw new ApiError(0, "Cannot reach the Silence server.");
    }

    const data = await readBody(response);

    if (!response.ok) throw new ApiError(response.status, errorMessage(data, response.status));

    return data;
}

/** Builds a query string from an object, skipping empty values. */
export function query(params) {
    const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "");
    return entries.length ? "?" + entries.map(([key, value]) => `${key}=${value}`).join("&") : "";
}

/** Returns the public URL of an endpoint: `/api/{version}/{route}` (empty version skipped). */
export function endpointUrl(endpoint) {
    const segments = ["api", ...(endpoint.version ?? "").split("/"), ...(endpoint.route ?? "").split("/")];
    return "/" + segments.filter((segment) => segment !== "").join("/");
}

/** Returns the names of the `{param}` placeholders of a route. */
export function routeParams(route) {
    return [...(route ?? "").matchAll(/\{\s*(\w+)\s*\}/g)].map((match) => match[1]);
}

/**
 * Accepts only same-origin absolute paths as redirect targets (no `//host`, no `javascript:`).
 */
export function safeRedirect(target, fallback) {
    if (typeof target !== "string" || !target.startsWith("/") || target.startsWith("//") || target.includes("\\")) {
        return fallback;
    }

    return target;
}
