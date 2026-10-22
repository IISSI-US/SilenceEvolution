// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

import {
    createMemo,
    createResource,
    createSignal,
    For,
    onCleanup,
    Show,
} from "solid-js";

interface EndpointStats {
    id: string;
    method: string;
    route: string;
    internal: boolean;
    requests: number;
    executions: number;
    rejected: number;
    errors: number;
    avg_ms: number;
    max_ms: number;
}

interface StatsReport {
    since: string;
    requests: number;
    executions: number;
    errors: number;
    avg_ms: number;
    by_method: Record<string, number>;
    by_status: Record<string, number>;
    endpoints: EndpointStats[];
    unmatched: Record<string, number>;
}

const REFRESH_MS = 5000;

const fetch_stats = async (): Promise<StatsReport> => {
    const res = await fetch("/_setup/stats", { cache: "no-store" });
    if (!res.ok) throw new Error("Cannot load the statistics.");
    return (await res.json()) as StatsReport;
};

const ms = (value: number) => `${value.toFixed(value < 10 ? 1 : 0)} ms`;

const percent = (part: number, total: number) =>
    total > 0 ? `${Math.round((part / total) * 100)}%` : "—";

/**
 * Usage statistics of the server: requests by method, by endpoint and by status, failures and
 * times. Kept by the server in the project's `stats.json` (see `src/stats.rs`).
 */
export default () => {
    const [stats, { refetch }] = createResource(fetch_stats);
    const [show_internal, set_show_internal] = createSignal(false);

    const timer = setInterval(() => refetch(), REFRESH_MS);
    onCleanup(() => clearInterval(timer));

    const endpoints = createMemo(() =>
        (stats()?.endpoints ?? [])
            .filter((endpoint) => show_internal() || !endpoint.internal)
            .sort((a, b) => b.requests - a.requests),
    );

    const reset = async () => {
        if (!confirm("Reset all the statistics?")) return;
        await fetch("/_setup/stats", { method: "DELETE" });
        refetch();
    };

    return (
        <div class="flex flex-col gap-4">
            <div class="flex not-lg:flex-col gap-3 items-start">
                <div>
                    <h1 class="text-4xl font-bold">Stats</h1>
                    <p class="text-sm text-base-content/60 mt-2">
                        Usage of the server
                        <Show when={stats()}>
                            {" "}
                            since {new Date(stats()!.since).toLocaleString()}
                        </Show>
                        . Saved in the project's stats.json; refreshed every 5
                        seconds.
                    </p>
                </div>
                <div class="flex gap-2 ml-auto">
                    <button class="btn text-sm" onClick={() => refetch()}>
                        Refresh
                    </button>
                    <button class="btn text-sm" onClick={reset}>
                        Reset
                    </button>
                </div>
            </div>

            <Show when={stats.error}>
                <div class="bg-error text-error-content rounded-box p-3 text-sm">
                    {(stats.error as Error).message}
                </div>
            </Show>

            <Show when={stats()}>
                <div class="stats stats-vertical lg:stats-horizontal border border-base-300 bg-base-100">
                    <div class="stat">
                        <div class="stat-title">Requests</div>
                        <div class="stat-value">{stats()!.requests}</div>
                        <div class="stat-desc">
                            reaching an endpoint (rejected ones included)
                        </div>
                    </div>
                    <div class="stat">
                        <div class="stat-title">Executions</div>
                        <div class="stat-value">{stats()!.executions}</div>
                        <div class="stat-desc">SQL endpoints that ran</div>
                    </div>
                    <div class="stat">
                        <div class="stat-title">Errors</div>
                        <div
                            class="stat-value"
                            classList={{ "text-error": stats()!.errors > 0 }}
                        >
                            {stats()!.errors}
                        </div>
                        <div class="stat-desc">
                            {percent(stats()!.errors, stats()!.executions)} of
                            the executions (4xx/5xx)
                        </div>
                    </div>
                    <div class="stat">
                        <div class="stat-title">Average time</div>
                        <div class="stat-value">{ms(stats()!.avg_ms)}</div>
                        <div class="stat-desc">per execution</div>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div class="border border-base-300 rounded-box bg-base-100">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Method</th>
                                    <th class="text-right">Requests</th>
                                </tr>
                            </thead>
                            <tbody>
                                <For
                                    each={Object.entries(stats()!.by_method)}
                                    fallback={
                                        <tr>
                                            <td colspan="2">
                                                No requests yet.
                                            </td>
                                        </tr>
                                    }
                                >
                                    {([method, count]) => (
                                        <tr>
                                            <td class="font-mono">{method}</td>
                                            <td class="text-right">{count}</td>
                                        </tr>
                                    )}
                                </For>
                            </tbody>
                        </table>
                    </div>
                    <div class="border border-base-300 rounded-box bg-base-100">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Status</th>
                                    <th class="text-right">Executions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <For
                                    each={Object.entries(stats()!.by_status)}
                                    fallback={
                                        <tr>
                                            <td colspan="2">
                                                No executions yet.
                                            </td>
                                        </tr>
                                    }
                                >
                                    {([status, count]) => (
                                        <tr>
                                            <td
                                                class="font-mono"
                                                classList={{
                                                    "text-error":
                                                        Number(status) >= 400,
                                                }}
                                            >
                                                {status}
                                            </td>
                                            <td class="text-right">{count}</td>
                                        </tr>
                                    )}
                                </For>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <h2 class="text-xl font-bold">By endpoint</h2>
                    <label class="label cursor-pointer gap-2 ml-auto text-sm">
                        <input
                            type="checkbox"
                            class="checkbox checkbox-sm"
                            checked={show_internal()}
                            onChange={(event) =>
                                set_show_internal(event.currentTarget.checked)
                            }
                        />
                        Show internal (admin panel traffic)
                    </label>
                </div>
                <div class="border border-base-300 rounded-box bg-base-100 overflow-x-auto">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Route</th>
                                <th>Id</th>
                                <th class="text-right">Requests</th>
                                <th
                                    class="text-right"
                                    title="Requests that never ran: authentication, missing params..."
                                >
                                    Rejected
                                </th>
                                <th class="text-right">Executions</th>
                                <th class="text-right">Errors</th>
                                <th class="text-right">Avg</th>
                                <th class="text-right">Max</th>
                            </tr>
                        </thead>
                        <tbody>
                            <For
                                each={endpoints()}
                                fallback={
                                    <tr>
                                        <td colspan="9">No requests yet.</td>
                                    </tr>
                                }
                            >
                                {(endpoint) => (
                                    <tr>
                                        <td class="font-mono">
                                            {endpoint.method}
                                        </td>
                                        <td class="font-mono">
                                            {endpoint.route}
                                        </td>
                                        <td class="font-bold">{endpoint.id}</td>
                                        <td class="text-right">
                                            {endpoint.requests}
                                        </td>
                                        <td
                                            class="text-right"
                                            classList={{
                                                "text-warning":
                                                    endpoint.rejected > 0,
                                            }}
                                        >
                                            {endpoint.rejected}
                                        </td>
                                        <td class="text-right">
                                            {endpoint.executions}
                                        </td>
                                        <td
                                            class="text-right"
                                            classList={{
                                                "text-error":
                                                    endpoint.errors > 0,
                                            }}
                                        >
                                            {endpoint.errors}
                                        </td>
                                        <td class="text-right">
                                            {ms(endpoint.avg_ms)}
                                        </td>
                                        <td class="text-right">
                                            {ms(endpoint.max_ms)}
                                        </td>
                                    </tr>
                                )}
                            </For>
                        </tbody>
                    </table>
                </div>

                <Show when={Object.keys(stats()!.unmatched).length > 0}>
                    <h2 class="text-xl font-bold">
                        Requests to removed endpoints
                    </h2>
                    <div class="border border-base-300 rounded-box bg-base-100">
                        <table class="table table-sm">
                            <tbody>
                                <For each={Object.entries(stats()!.unmatched)}>
                                    {([path, count]) => (
                                        <tr>
                                            <td class="font-mono">{path}</td>
                                            <td class="text-right">{count}</td>
                                        </tr>
                                    )}
                                </For>
                            </tbody>
                        </table>
                    </div>
                </Show>
            </Show>
        </div>
    );
};
