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
    requests: number;
    // `null` when the endpoint's executions aren't measured (only SQL endpoints are).
    executions: number | null;
    rejected: number | null;
    errors: number | null;
    avg_ms: number | null;
    max_ms: number | null;
}

interface WebFileStats {
    path: string;
    kind: string;
    requests: number;
    not_found: number;
    bytes: number;
}

interface WebStats {
    requests: number;
    pages: number;
    not_found: number;
    bytes: number;
    by_kind: Record<string, number>;
    files: WebFileStats[];
}

interface ApiStats {
    requests: number;
    executions: number;
    errors: number;
    avg_ms: number;
    by_method: Record<string, number>;
    by_status: Record<string, number>;
    endpoints: EndpointStats[];
    unmatched: Record<string, number>;
}

interface StatsReport {
    since: string;
    /** The project's database (its API's tab is named after it). */
    database: string;
    /** The project's API. */
    api: ApiStats;
    /** Silence's own API (`/api/internal`, the admin panel's traffic). */
    silence: ApiStats;
    web: WebStats;
}

const REFRESH_MS = 5000;

const fetch_stats = async (): Promise<StatsReport> => {
    const res = await fetch("/_setup/stats", { cache: "no-store" });
    if (!res.ok) throw new Error("Cannot load the statistics.");
    return (await res.json()) as StatsReport;
};

const ms = (value: number) => `${value.toFixed(value < 10 ? 1 : 0)} ms`;

const size = (bytes: number) =>
    bytes < 1024
        ? `${bytes} B`
        : bytes < 1024 * 1024
          ? `${(bytes / 1024).toFixed(1)} KB`
          : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** A measure of an endpoint, `—` when it isn't measured. */
const measure = (
    value: number | null,
    format: (value: number) => string = String,
) => (value === null ? "—" : format(value));

const percent = (part: number, total: number) =>
    total > 0 ? `${Math.round((part / total) * 100)}%` : "—";

/**
 * Usage statistics of the server: requests by method, by endpoint and by status, failures and
 * times. Kept by the server in the project's `stats.json` (see `src/stats.rs`).
 */
export default () => {
    const [stats, { refetch }] = createResource(fetch_stats);
    const [view, set_view] = createSignal<"api" | "silence" | "web">("api");

    // Statistics of the API shown: the project's or Silence's.
    const group = () =>
        view() === "silence" ? stats()?.silence : stats()?.api;

    const timer = setInterval(() => refetch(), REFRESH_MS);
    onCleanup(() => clearInterval(timer));

    const endpoints = createMemo(() =>
        [...(group()?.endpoints ?? [])].sort((a, b) => b.requests - a.requests),
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
                        Usage of the API and of the front-end (web/)
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

            <div role="tablist" class="tabs tabs-border">
                <button
                    role="tab"
                    class="tab"
                    classList={{ "tab-active": view() === "api" }}
                    onClick={() => set_view("api")}
                >
                    API ({stats()?.database || "database"})
                </button>
                <button
                    role="tab"
                    class="tab"
                    classList={{ "tab-active": view() === "silence" }}
                    onClick={() => set_view("silence")}
                >
                    API (Silence)
                </button>
                <button
                    role="tab"
                    class="tab"
                    classList={{ "tab-active": view() === "web" }}
                    onClick={() => set_view("web")}
                >
                    Front-end
                </button>
            </div>

            <Show when={stats() && view() === "web"}>
                <div class="stats stats-vertical lg:stats-horizontal border border-base-300 bg-base-100">
                    <div class="stat">
                        <div class="stat-title">Requests</div>
                        <div class="stat-value">{stats()!.web.requests}</div>
                        <div class="stat-desc">files of web/ served</div>
                    </div>
                    <div class="stat">
                        <div class="stat-title">Page views</div>
                        <div class="stat-value">{stats()!.web.pages}</div>
                        <div class="stat-desc">HTML pages requested</div>
                    </div>
                    <div class="stat">
                        <div class="stat-title">Not found</div>
                        <div
                            class="stat-value"
                            classList={{
                                "text-error": stats()!.web.not_found > 0,
                            }}
                        >
                            {stats()!.web.not_found}
                        </div>
                        <div class="stat-desc">
                            {percent(
                                stats()!.web.not_found,
                                stats()!.web.requests,
                            )}{" "}
                            of the requests (missing files)
                        </div>
                    </div>
                    <div class="stat">
                        <div class="stat-title">Transferred</div>
                        <div class="stat-value">{size(stats()!.web.bytes)}</div>
                        <div class="stat-desc">without the browser cache</div>
                    </div>
                </div>

                <div class="border border-base-300 rounded-box bg-base-100 lg:w-1/2">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Kind</th>
                                <th class="text-right">Requests</th>
                            </tr>
                        </thead>
                        <tbody>
                            <For
                                each={Object.entries(stats()!.web.by_kind)}
                                fallback={
                                    <tr>
                                        <td colspan="2">No requests yet.</td>
                                    </tr>
                                }
                            >
                                {([kind, count]) => (
                                    <tr>
                                        <td>{kind}</td>
                                        <td class="text-right">{count}</td>
                                    </tr>
                                )}
                            </For>
                        </tbody>
                    </table>
                </div>

                <h2 class="text-xl font-bold">By file</h2>
                <div class="border border-base-300 rounded-box bg-base-100 overflow-x-auto">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Path</th>
                                <th>Kind</th>
                                <th class="text-right">Requests</th>
                                <th class="text-right">Not found</th>
                                <th class="text-right">Transferred</th>
                            </tr>
                        </thead>
                        <tbody>
                            <For
                                each={stats()!.web.files}
                                fallback={
                                    <tr>
                                        <td colspan="5">No requests yet.</td>
                                    </tr>
                                }
                            >
                                {(file) => (
                                    <tr>
                                        <td class="font-mono">{file.path}</td>
                                        <td>{file.kind}</td>
                                        <td class="text-right">
                                            {file.requests}
                                        </td>
                                        <td
                                            class="text-right"
                                            classList={{
                                                "text-error":
                                                    file.not_found > 0,
                                            }}
                                        >
                                            {file.not_found}
                                        </td>
                                        <td class="text-right">
                                            {size(file.bytes)}
                                        </td>
                                    </tr>
                                )}
                            </For>
                        </tbody>
                    </table>
                </div>
            </Show>

            <Show when={group()}>
                <div class="stats stats-vertical lg:stats-horizontal border border-base-300 bg-base-100">
                    <div class="stat">
                        <div class="stat-title">Requests</div>
                        <div class="stat-value">{group()!.requests}</div>
                        <div class="stat-desc">
                            reaching an endpoint (rejected ones included)
                        </div>
                    </div>
                    <div class="stat">
                        <div class="stat-title">Executions</div>
                        <div class="stat-value">{group()!.executions}</div>
                        <div class="stat-desc">SQL endpoints that ran</div>
                    </div>
                    <div class="stat">
                        <div class="stat-title">Errors</div>
                        <div
                            class="stat-value"
                            classList={{ "text-error": group()!.errors > 0 }}
                        >
                            {group()!.errors}
                        </div>
                        <div class="stat-desc">
                            {percent(group()!.errors, group()!.executions)} of
                            the executions (4xx/5xx)
                        </div>
                    </div>
                    <div class="stat">
                        <div class="stat-title">Average time</div>
                        <div class="stat-value">{ms(group()!.avg_ms)}</div>
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
                                    each={Object.entries(group()!.by_method)}
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
                                    each={Object.entries(group()!.by_status)}
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
                                                    (endpoint.rejected ?? 0) >
                                                    0,
                                            }}
                                        >
                                            {measure(endpoint.rejected)}
                                        </td>
                                        <td class="text-right">
                                            {measure(endpoint.executions)}
                                        </td>
                                        <td
                                            class="text-right"
                                            classList={{
                                                "text-error":
                                                    (endpoint.errors ?? 0) > 0,
                                            }}
                                        >
                                            {measure(endpoint.errors)}
                                        </td>
                                        <td class="text-right">
                                            {measure(endpoint.avg_ms, ms)}
                                        </td>
                                        <td class="text-right">
                                            {measure(endpoint.max_ms, ms)}
                                        </td>
                                    </tr>
                                )}
                            </For>
                        </tbody>
                    </table>
                </div>

                <Show when={Object.keys(group()!.unmatched).length > 0}>
                    <h2 class="text-xl font-bold">
                        Requests to removed endpoints
                    </h2>
                    <div class="border border-base-300 rounded-box bg-base-100">
                        <table class="table table-sm">
                            <tbody>
                                <For each={Object.entries(group()!.unmatched)}>
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
