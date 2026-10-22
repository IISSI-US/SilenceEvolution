// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

import { adopt_token, forget_test_user, test_token } from "@admin/TestUser";

import { type Test } from "@admin/tests";

import { normalize_route, type EndpointByFile } from "@admin/endpoints";

export interface UnitTestResult {
    method: string;
    route: string;
    status: number;
    /** Status the test expects: the one saved with it, if any. */
    expected_status?: number | undefined;
    passed: boolean;
    ms: number;
    body: unknown;
    error?: string | undefined;
}

/**
 * Runs a saved unit test with its saved params, as the test user (see TestUser.tsx), like the
 * Send button of the test page. It passes when the status is the one saved with the test (its
 * last response) or, if none was saved, when it's a 2xx.
 */
export const run_unit_test = async (
    test: Test,
    endpoints: Array<EndpointByFile>,
): Promise<UnitTestResult> => {
    const endpoint = endpoints.find(
        (endpoint_by_file) =>
            endpoint_by_file.endpoint.id === test.target_endpoint_id,
    )?.endpoint;

    const expected_status = test["response"]?.["status"] as number | undefined;

    if (!endpoint)
        return {
            method: "",
            route: "",
            status: 0,
            expected_status,
            passed: false,
            ms: 0,
            body: undefined,
            error: `The endpoint ${test.target_endpoint_id} doesn't exist.`,
        };

    let route = normalize_route(endpoint.route, endpoint.version);

    for (const [name, value] of Object.entries(
        (test["route_params"] ?? {}) as Record<string, string>,
    ))
        route = route.replace(`{${name}}`, encodeURIComponent(value));

    const query = new URLSearchParams(
        (test["query_params"] ?? {}) as Record<string, string>,
    ).toString();

    if (query.length !== 0) route = `${route}?${query}`;

    const method = endpoint.method.toUpperCase();
    const started = performance.now();

    try {
        const res = await fetch(route, {
            method,
            headers: { Authorization: test_token() ?? "" },
            body: method === "GET" ? null : JSON.stringify(test["body"] ?? {}),
            credentials: "omit",
        });

        const body = await res.json().catch(() => undefined);
        const ms = performance.now() - started;

        // A token in the response (e.g. a Login step) becomes the test user, so the next steps
        // run authenticated.
        if (body && typeof body === "object" && typeof body.token === "string")
            await adopt_token(body.token);

        if (res.status === 401 && body?.error === "Invalid session.")
            forget_test_user();

        return {
            method,
            route,
            status: res.status,
            expected_status,
            passed:
                expected_status !== undefined
                    ? res.status === expected_status
                    : res.ok,
            ms,
            body,
            error: res.ok ? undefined : (body?.error ?? res.statusText),
        };
    } catch (err) {
        return {
            method,
            route,
            status: 0,
            expected_status,
            passed: false,
            ms: performance.now() - started,
            body: undefined,
            error: (err as Error).message,
        };
    }
};
