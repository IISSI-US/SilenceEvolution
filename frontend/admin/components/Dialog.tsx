// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

import type { ParentProps } from "solid-js";

import { Portal } from "solid-js/web";

import { A, useNavigate } from "@solidjs/router";
import Icon from "@admin/components/Icon";

/**
 * Centered modal for a section's sub-route shown over its list (e.g. testing an endpoint).
 * Closing (X, a click outside or Escape, see `Admin.tsx`) goes back to `parent_path`.
 */
export default (props: { parent_path: string } & ParentProps) => {
    const navigate = useNavigate();

    return (
        <Portal>
            <div
                class="fixed inset-0 z-20 flex justify-center items-center p-4 bg-black/35"
                onClick={() =>
                    navigate(props.parent_path, {
                        replace: false,
                        scroll: false,
                    })
                }
            >
                <div
                    class="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-base-100 border border-base-300 rounded-box shadow-lg px-6 pt-12 pb-6"
                    onClick={(event) => event.stopPropagation()}
                >
                    <A
                        class="btn btn-ghost btn-sm btn-circle absolute top-2 right-2"
                        href={props.parent_path}
                        noScroll
                        aria-label="Close"
                    >
                        <Icon name="x" />
                    </A>
                    {props.children}
                </div>
            </div>
        </Portal>
    );
};
