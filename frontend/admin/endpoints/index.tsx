// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import { type ResourceReturn } from "solid-js";

import { pipe, filter, join } from "remeda";

export type EndpointByFile = {
    path: string | null;
    endpoint: Endpoint;
};

export interface Endpoint {
    id?: string;
    database?: string;
    route: string;
    version?: string;
    method: string;
    execute?: {
        query?: string;
        queries?: Array<{
            query: string;
            include?: boolean;
            behaviour?: string;
        }>;
    };
    query_params: Array<string>;
    body_params: Array<string>;
    description?: string;
    require_auth: boolean;
    inject_auth_metadata: boolean;
    allowed_roles: Array<string>;
    auto_generated: boolean;
}

export type EndpointsContext = ResourceReturn<Array<EndpointByFile>, any>;

export const fetcher = async (): Promise<Array<EndpointByFile>> => {
    const res = await fetch("/api/internal/endpoints", {
        headers: { "Cache-Control": "no-cache" },
    });

    if (!res.ok) console.clear();

    if (res.status === 200) {
        const data = (await res.json()) as Array<
            Array<string | Array<Endpoint>>
        >;

        let endpoints: Array<EndpointByFile> = new Array();

        for (const endpoints_path of data) {
            for (let endpoint of endpoints_path[1] as Array<Endpoint>) {
                endpoint.method = endpoint.method.toUpperCase();

                endpoints.push({
                    path: endpoints_path[0] as string | null,
                    endpoint,
                });
            }
        }

        return endpoints;
    } else {
        return new Array();
    }
};

export const normalize_route = (route: string, version?: string) =>
    `/${pipe(
        `/api/${version}/${route}`.split("/"),
        filter((str) => str.length !== 0),
        join("/"),
    )}`;
