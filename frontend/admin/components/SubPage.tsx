// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

import type { ParentProps } from "solid-js";
import { Show } from "solid-js";

import { A, useLocation, useParams } from "@solidjs/router";
import Icon from "@admin/components/Icon";

/**
 * Full-page view for a section's sub-route (edit an endpoint, run a test, edit a user): it replaces
 * the section's list instead of showing on top of it. Escape goes back (see `Admin.tsx`).
 */
export default (
    props: { parent_path: string; parent_title: string } & ParentProps,
) => {
    const location = useLocation();
    const params = useParams();

    const is_endpoint = () =>
        params["id"] !== undefined && props.parent_path.includes("endpoints");
    const is_modify = () => location.pathname.includes("modify");

    return (
        <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
                <A
                    class="btn btn-ghost btn-sm"
                    href={props.parent_path}
                    noScroll
                >
                    ← {props.parent_title}
                </A>
                <Show when={is_endpoint()}>
                    <A
                        class="btn btn-sm ml-auto"
                        href={`/endpoints/${params["id"]!}/${is_modify() ? "test" : "modify"}`}
                        noScroll
                    >
                        <Icon name={is_modify() ? "tests" : "braces"} />
                        {is_modify() ? "Test endpoint" : "Modify endpoint"}
                    </A>
                </Show>
            </div>
            {props.children}
        </div>
    );
};
