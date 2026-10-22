// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import AppCx from "@admin/AppCx";

import { logout } from "@admin/Session";

import Console from "@admin/components/Console";

import { Show, useContext } from "solid-js";

import {
    A,
    useLocation,
    useNavigate,
    type RouteSectionProps,
} from "@solidjs/router";

import { pipe, filter, split, first } from "remeda";

export const current_component = (full_path: string) => {
    return pipe(
        full_path,
        split("/"),
        filter((str) => str.length !== 0 && str !== "admin"),
        first(),
    );
};

export default (props: RouteSectionProps) => {
    const app_cx = useContext(AppCx)!;

    const [session] = app_cx.get_resource("session");
    const [config] = app_cx.get_resource("config");

    const location = useLocation();

    const navigate = useNavigate();

    document.addEventListener("keydown", (event) => {
        const redirect_path = current_component(location.pathname)!;

        if (event.key === "Escape")
            navigate(redirect_path, {
                replace: false,
                scroll: false,
            });
    });

    return (
        <>
            <div class="drawer md:drawer-open [&_input]:rounded-lg [&_input]:bg-base-200/75 [&_input]:backdrop-brightness-125 [&_input]:backdrop-blur-xs [&_textarea]:rounded-lg">
                <input id="app-drawer" type="checkbox" class="drawer-toggle" />
                <div class="drawer-content flex flex-col">
                    <nav>
                        <div class="navbar bg-base-100/20 backdrop-blur-sm shadow-xs dark:shadow fixed left-0 z-10">
                            <div class="navbar-start flex gap-2">
                                <label
                                    for="app-drawer"
                                    data-tip="Open"
                                    class="btn btn-ghost md:hidden"
                                >
                                    <span class="material-symbols-outlined">
                                        side_navigation
                                    </span>
                                </label>
                                <Show when={config() !== undefined}>
                                    <span class="text-[0.5rem] max-h-16 text-xs! text-emerald-700 dark:text-emerald-500 font-semibold animate-pulse bg-base-300/50 backdrop-blur-xs rounded-lg border border-base-200 px-3 py-1 ml-24 overflow-y-scroll not-md:hidden scrollbar-none">
                                        Running on database{" "}
                                        <span class="font-black">
                                            {config()?.databases_conn.main.db}
                                        </span>{" "}
                                        as{" "}
                                        <span class="font-black">
                                            {
                                                config()?.databases_conn.main
                                                    .username
                                            }
                                        </span>{" "}
                                        listening at{" "}
                                        <span class="font-black">
                                            {config()?.listening_addr}
                                        </span>
                                    </span>
                                </Show>
                            </div>
                            <div class="navbar-center">
                                <A
                                    class="text-xl md:text-2xl font-stretch-150% btn btn-ghost"
                                    href="/"
                                >
                                    Silence
                                </A>
                            </div>
                            <div class="navbar-end">
                                <span class="text-[0.5rem] max-h-16 text-xs! font-semibold bg-base-300/50 backdrop-blur-xs rounded-lg border border-base-200 px-3 py-1 ml-24 overflow-y-scroll not-md:hidden scrollbar-none">
                                    Having issues? Contact me at{" "}
                                    <a href="mailto:oalvarez1@us.es">
                                        oalvarez1@us.es
                                    </a>{" "}
                                    or open a issue on{" "}
                                    <a href="https://github.com/nv0skar/SilenceEvolution">
                                        Github
                                    </a>
                                </span>
                                <Show when={session() !== undefined}>
                                    <button
                                        class="btn btn-ghost"
                                        popovertarget="user-dropdown"
                                        style="anchor-name:--user-anchor"
                                    >
                                        <div class="inline text-sm">
                                            <span class="text-sm">Hi, </span>
                                            <span class="dark:text-emerald-400 text-sm font-bold">
                                                {session()!.name}
                                            </span>
                                        </div>
                                    </button>
                                    <ul
                                        id="user-dropdown"
                                        class="dropdown menu w-52 rounded-box bg-base-100/25 border-base-200 border backdrop-blur-sm shadow-lg transition duration-200"
                                        style="position-anchor:--user-anchor; inset: auto; top: anchor(bottom); right: anchor(right); margin: 0;"
                                        popover
                                    >
                                        <li>
                                            <button onClick={logout}>
                                                <span class="material-symbols-outlined text-xs">
                                                    logout
                                                </span>
                                                <span class="font-bold">
                                                    Logout
                                                </span>
                                            </button>
                                        </li>
                                    </ul>
                                </Show>
                            </div>
                        </div>
                    </nav>
                    <div class="absolute top-0 left-0 p-8 px-3 md:pl-26 md:pr-8 pt-24 w-screen h-screen z-0">
                        <Show when={session() !== undefined}>
                            <Show
                                when={session()!.role === "admin"}
                                fallback={
                                    <div class="flex justify-center items-center top-0 text-2xl text-center font-bold leading-relaxed">
                                        <div>
                                            <span>
                                                Hmmm... It seems you shouldn't
                                                be here {session()!.name}.{" "}
                                            </span>
                                            <br />
                                            <span class="text-error">
                                                This account doesn't have the
                                                required role for managing this{" "}
                                                <span class="font-black">
                                                    Silence
                                                </span>{" "}
                                                project.
                                            </span>
                                            <br />
                                            <span>
                                                HINT: access the database and
                                                add the{" "}
                                                <code class="bg-base-300 p-2 rounded-sm">
                                                    admin
                                                </code>{" "}
                                                role to the user id{" "}
                                                <code class="bg-base-300 p-2 rounded-sm">
                                                    {session()!.user_id}
                                                </code>
                                            </span>
                                        </div>
                                    </div>
                                }
                            >
                                {props.children}
                                <Console />
                            </Show>
                        </Show>
                    </div>
                </div>
                <div class="drawer-side is-drawer-close:overflow-visible z-10">
                    <label
                        for="app-drawer"
                        aria-label="close sidebar"
                        class="drawer-overlay"
                    ></label>
                    <div class="flex h-full flex-col items-start fixed is-drawer-close:w-16 is-drawer-open:w-40 transition duration-300 ease-in-out will-change-[width]">
                        <ul class="menu h-full bg-base-300/10 md:bg-base-300/25 border-[0.5px] border-base-200 backdrop-blur-sm shadow-xl rounded-lg [&_A]:rounded-lg! m-2 p-2 gap-2 [&_li]:transition [&_li]:duration-200 [&_li]:hover:scale-105">
                            <li>
                                <A href="/endpoints">
                                    <span class="material-symbols-outlined scale-95">
                                        route
                                    </span>
                                    <span class="is-drawer-close:hidden">
                                        Endpoints
                                    </span>
                                </A>
                            </li>
                            <li>
                                <A href="/tests">
                                    <span class="material-symbols-outlined scale-95">
                                        science
                                    </span>
                                    <span class="is-drawer-close:hidden">
                                        Tests
                                    </span>
                                </A>
                            </li>
                            <li>
                                <A href="/users">
                                    <span class="material-symbols-outlined scale-95">
                                        group
                                    </span>
                                    <span class="is-drawer-close:hidden">
                                        Users
                                    </span>
                                </A>
                            </li>
                            <li>
                                <A href="/config">
                                    <span class="material-symbols-outlined scale-95">
                                        settings
                                    </span>
                                    <span class="is-drawer-close:hidden">
                                        Config
                                    </span>
                                </A>
                            </li>
                            <li class="absolute bottom-0 my-2">
                                <label for="app-drawer">
                                    <span class="material-symbols-outlined scale-95">
                                        side_navigation
                                    </span>
                                </label>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </>
    );
};
