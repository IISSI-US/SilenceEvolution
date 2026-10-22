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

    return (
        <>
            <Portal>
                <div
                    class="overscroll-none antialiased fixed top-0 left-0 w-screen h-screen p-4 z-20 bg-black/35 transition duration-500"
                    classList={{
                        "opacity-0 pointer-events-none":
                            expected_children() === undefined,
                    }}
                >
                    <div
                        class="flex h-screen justify-center items-center"
                        onClick={() =>
                            navigate(props.parent_path, {
                                replace: false,
                                scroll: false,
                            })
                        }
                    >
                        <div
                            id="modal"
                            class="relative lg:m-32 w-full min-h-fit max-h-screen px-4 bg-base-100 border-base-300 rounded-box border shadow-lg transition duration-500"
                            classList={{
                                "opacity-0 scale-75":
                                    expected_children() === undefined,
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

                            <div class="mx-2 my-0 max-h-[80vh] overflow-y-scroll scrollbar-none [&>div]:transition-all [&>div]:transition-discrete [&>div]:duration-500 [&>div]:starting:opacity-0 [&>div]:starting:scale-90">
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
