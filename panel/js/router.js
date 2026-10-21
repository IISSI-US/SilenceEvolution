// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Hash based router: `#/endpoints`, `#/tests/My%20test`, ...
// Routes are `{ pattern: "/tests/:name", view }`; params are URL-decoded.

/**
 * @param {Array<{ pattern: string, view: (params: Record<string, string>) => any }>} routes
 * @param {(route: { pattern: string }, params: Record<string, string>) => void} render
 * @param {string} fallback
 */
export function startRouter(routes, render, fallback) {
    const compiled = routes.map((route) => ({
        route,
        keys: [...route.pattern.matchAll(/:(\w+)/g)].map((match) => match[1]),
        regex: new RegExp("^" + route.pattern.replace(/:\w+/g, "([^/]+)") + "/?$"),
    }));

    const resolve = () => {
        const path = location.hash.replace(/^#/, "") || fallback;

        for (const { route, keys, regex } of compiled) {
            const match = path.match(regex);

            if (match) {
                const params = Object.fromEntries(keys.map((key, ix) => [key, decodeURIComponent(match[ix + 1])]));
                render(route, params);
                return;
            }
        }

        location.replace("#" + fallback);
    };

    window.addEventListener("hashchange", resolve);
    resolve();
}

/** Navigates to a hash route. */
export function navigate(path) {
    location.hash = path;
}

/** Builds a hash link for a route made of path segments (each one is URL-encoded). */
export function link(...segments) {
    return "#/" + segments.map((segment) => encodeURIComponent(segment)).join("/");
}

/** Navigates to a hash route, re-rendering it even when it's the current one. */
export function refresh(path) {
    if (location.hash === path) dispatchEvent(new HashChangeEvent("hashchange"));
    else location.hash = path;
}
