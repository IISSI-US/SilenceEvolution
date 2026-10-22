// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import { children, Show, type ParentProps } from "solid-js";

import { Portal } from "solid-js/web";

import { A, useLocation, useNavigate, useParams } from "@solidjs/router";
import Icon from "@admin/components/Icon";

export default (props: { parent_path: string } & ParentProps) => {
    const navigate = useNavigate();

    const location = useLocation();

    const params = useParams();

    const expected_children = children(() => props.children);

    // Users are edited in a small centered dialog; endpoints and tests open in a side panel,
    // wider when testing (request + response) than when editing.
    const is_dialog = () => props.parent_path.includes("users");
    const is_wide = () =>
        props.parent_path.includes("tests") || location.pathname.endsWith("/test");

    return (
        <>
            <Portal>
                <div
                    class="overscroll-none antialiased fixed top-0 left-0 w-screen h-screen z-20 bg-black/35 transition duration-300"
                    classList={{
                        "opacity-0 pointer-events-none":
                            expected_children() === undefined,
                    }}
                >
                    <div
                        class="flex h-screen"
                        classList={{
                            "justify-center items-center p-4": is_dialog(),
                            "justify-end": !is_dialog(),
                        }}
                        onClick={() =>
                            navigate(props.parent_path, {
                                replace: false,
                                scroll: false,
                            })
                        }
                    >
                        <div
                            id="modal"
                            class="relative bg-base-100 border-base-300 shadow-lg transition duration-300"
                            classList={{
                                "w-full max-w-lg max-h-screen px-4 rounded-box border":
                                    is_dialog(),
                                "h-screen w-[min(640px,100vw)] px-2 border-l":
                                    !is_dialog() && !is_wide(),
                                "h-screen w-[min(960px,100vw)] px-2 border-l":
                                    !is_dialog() && is_wide(),
                                "opacity-0 scale-95":
                                    is_dialog() && expected_children() === undefined,
                                "opacity-0 translate-x-8":
                                    !is_dialog() && expected_children() === undefined,
                            }}
                            onClick={(event) => {
                                event.stopPropagation();
                            }}
                        >
                            <div class="absolute top-0 right-0 m-2 shadow rounded-box z-50">
                                <button
                                    class="btn btn-circle tooltip tooltip-left bg-base-300 border-[0.5px] border-base-200 shadow-xs scale-90 hover:bg-base-200"
                                    classList={{
                                        hidden:
                                            params["id"] === undefined ||
                                            !props.parent_path.includes(
                                                "endpoints",
                                            ),
                                    }}
                                    onClick={() => {
                                        navigate(
                                            location.pathname.includes("modify")
                                                ? `/endpoints/${params["id"]!}/test`
                                                : `/endpoints/${params["id"]!}/modify`,
                                            {
                                                replace: false,
                                                scroll: false,
                                            },
                                        );
                                    }}
                                    data-tip={
                                        location.pathname.includes("modify")
                                            ? "Test endpoint"
                                            : "Modify endpoint"
                                    }
                                >
                                    <Icon name={location.pathname.includes("modify") ? "tests" : "braces"} />
                                </button>
                                <A
                                    class="btn btn-circle bg-base-300 border-[0.5px] border-base-200 shadow-xs scale-90 hover:bg-base-200"
                                    href={props.parent_path}
                                    noScroll
                                    replace={false}
                                >
                                    <Icon name="x" />
                                </A>
                            </div>

                            <div
                                class="mx-2 my-0 overflow-y-scroll scrollbar-none [&>div]:transition-all [&>div]:transition-discrete [&>div]:duration-500 [&>div]:starting:opacity-0 [&>div]:starting:scale-90"
                                classList={{
                                    "max-h-[80vh]": is_dialog(),
                                    "h-full pt-14 pb-6": !is_dialog(),
                                }}
                            >
                                <Show when={expected_children() !== undefined}>
                                    {expected_children()}
                                </Show>
                            </div>
                        </div>
                    </div>
                </div>
            </Portal>
        </>
    );
};
