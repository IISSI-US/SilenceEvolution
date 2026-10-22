// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

import { onCleanup, Show, type ParentProps } from "solid-js";

import { Portal } from "solid-js/web";

import { A, useNavigate } from "@solidjs/router";
import Icon from "@admin/components/Icon";

/**
 * Centered modal for a section's sub-route shown over its list (e.g. testing an endpoint).
 * Closing (X, a click outside or Escape, see `Admin.tsx`) goes back to `parent_path`. Without
 * `parent_path` (a modal that isn't a route) closing calls `on_close`.
 */
export default (
    props: (
        | { parent_path: string; on_close?: undefined }
        | { parent_path?: undefined; on_close: () => void }
    ) &
        ParentProps,
) => {
    const navigate = useNavigate();

    const close = () =>
        props.on_close
            ? props.on_close()
            : navigate(props.parent_path!, {
                  replace: false,
                  scroll: false,
              });

    // Escape on a route modal is handled by `Admin.tsx` (it goes back to the section).
    const on_escape = (event: KeyboardEvent) => {
        if (event.key === "Escape" && props.on_close) props.on_close();
    };

    document.addEventListener("keydown", on_escape);
    onCleanup(() => document.removeEventListener("keydown", on_escape));

    return (
        <Portal>
            <div
                class="fixed inset-0 z-20 flex justify-center items-center p-4 bg-black/35"
                onClick={close}
            >
                <div
                    class="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-base-100 border border-base-300 rounded-box shadow-lg px-6 pt-12 pb-6"
                    onClick={(event) => event.stopPropagation()}
                >
                    <Show
                        when={props.parent_path}
                        fallback={
                            <button
                                class="btn btn-ghost btn-sm btn-circle absolute top-2 right-2"
                                onClick={close}
                                aria-label="Close"
                            >
                                <Icon name="x" />
                            </button>
                        }
                    >
                        <A
                            class="btn btn-ghost btn-sm btn-circle absolute top-2 right-2"
                            href={props.parent_path!}
                            noScroll
                            aria-label="Close"
                        >
                            <Icon name="x" />
                        </A>
                    </Show>
                    {props.children}
                </div>
            </div>
        </Portal>
    );
};
