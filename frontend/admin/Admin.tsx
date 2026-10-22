// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import { logout_test_user, test_user } from "@admin/TestUser";
import Setup from "@admin/Setup";
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
import Icon from "@admin/components/Icon";

export const current_component = (full_path: string) => {
    return pipe(
        full_path,
        split("/"),
        filter(
            (str) => str.length !== 0 && str !== "admin" && str !== "admin2",
        ),
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
            <div class="drawer lg:drawer-open">
                <input id="app-drawer" type="checkbox" class="drawer-toggle" />
                <div class="drawer-content flex flex-col">
                    <nav>
                        <div class="navbar bg-base-100 shadow-xs dark:shadow fixed left-0 z-10">
                            <div class="navbar-start flex gap-2">
                                <label
                                    for="app-drawer"
                                    data-tip="Open"
                                    class="btn btn-ghost lg:hidden"
                                >
                                    <Icon name="sidebar" />
                                </label>
                                <Show
                                    when={
                                        config() !== undefined &&
                                        session()?.connected
                                    }
                                >
                                    <div class="flex flex-col items-start gap-1 ml-24 not-lg:hidden">
                                        <span class="text-[0.5rem] max-h-16 text-xs! text-emerald-700 dark:text-emerald-500 font-semibold animate-pulse bg-base-300 rounded-box border border-base-200 px-3 py-1 overflow-y-scroll scrollbar-none">
                                            Running on database{" "}
                                            <span class="font-black">
                                                {
                                                    config()?.databases_conn
                                                        .main.db
                                                }
                                            </span>{" "}
                                            as{" "}
                                            <span class="font-black">
                                                {
                                                    config()?.databases_conn
                                                        .main.username
                                                }
                                            </span>{" "}
                                            listening at{" "}
                                            <span class="font-black">
                                                {config()?.listening_addr}
                                            </span>
                                        </span>
                                        {/* User the tests run as (see TestUser.tsx). */}
                                        <div class="flex items-center gap-2 px-3">
                                            <A
                                                href="/users"
                                                class="text-xs font-semibold text-base-content/70 hover:underline"
                                            >
                                                <Show
                                                    when={test_user()}
                                                    fallback="Testing as an anonymous user"
                                                >
                                                    Testing as{" "}
                                                    <span class="font-black">
                                                        {test_user()!.name}
                                                    </span>
                                                    <Show
                                                        when={
                                                            test_user()!.email
                                                        }
                                                    >
                                                        {" "}
                                                        ({test_user()!.email})
                                                    </Show>
                                                    , role{" "}
                                                    <span class="font-black">
                                                        {test_user()!.role ??
                                                            "none"}
                                                    </span>
                                                </Show>
                                            </A>
                                            <Show when={test_user()}>
                                                <button
                                                    class="btn btn-ghost btn-xs"
                                                    title="Sign out: tests run as an anonymous user"
                                                    onClick={() =>
                                                        logout_test_user()
                                                    }
                                                >
                                                    Sign out
                                                </button>
                                            </Show>
                                        </div>
                                    </div>
                                </Show>
                            </div>
                            <div class="navbar-center">
                                <A
                                    class="text-xl lg:text-2xl font-stretch-150% btn btn-ghost"
                                    href="/"
                                >
                                    Silence
                                </A>
                            </div>
                            <div class="navbar-end">
                                <Show when={session()?.local}>
                                    <span class="text-sm px-4">
                                        Local admin
                                    </span>
                                </Show>
                                <Show
                                    when={
                                        session() !== undefined &&
                                        !session()!.local
                                    }
                                >
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
                                        class="dropdown menu w-52 rounded-box bg-base-100 border-base-200 border shadow-lg transition duration-200"
                                        style="position-anchor:--user-anchor; inset: auto; top: anchor(bottom); right: anchor(right); margin: 0;"
                                        popover
                                    >
                                        <li>
                                            <button onClick={logout}>
                                                <Icon
                                                    name="logout"
                                                    class="text-xs"
                                                />
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
                    <div class="absolute top-0 left-0 p-8 px-3 lg:pl-26 lg:pr-8 pt-24 w-screen h-screen z-0 overflow-y-auto pb-[calc(var(--console-height,0px)+2rem)]!">
                        <Show when={session() !== undefined}>
                            <Show
                                when={session()!.connected}
                                fallback={
                                    <Setup error={session()!.setup_error} />
                                }
                            >
                                <Show
                                    when={session()!.role === "admin"}
                                    fallback={
                                        <div class="flex justify-center items-center top-0 text-2xl text-center font-bold leading-relaxed">
                                            <div>
                                                <span>
                                                    Hmmm... It seems you
                                                    shouldn't be here{" "}
                                                    {session()!.name}.{" "}
                                                </span>
                                                <br />
                                                <span class="text-error">
                                                    This account doesn't have
                                                    the required role for
                                                    managing this{" "}
                                                    <span class="font-black">
                                                        Silence
                                                    </span>{" "}
                                                    project.
                                                </span>
                                                <br />
                                                <span>
                                                    HINT: access the database
                                                    and add the{" "}
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
                                </Show>
                            </Show>
                        </Show>
                    </div>
                </div>
                {/* The console is available in setup mode too (to see why a connection fails). */}
                <Show when={session()?.local || session()?.role === "admin"}>
                    <Console />
                </Show>
                <div class="drawer-side is-drawer-close:overflow-visible z-10">
                    <label
                        for="app-drawer"
                        aria-label="close sidebar"
                        class="drawer-overlay"
                    ></label>
                    <div class="flex h-full flex-col items-start fixed w-16">
                        <ul class="menu h-full bg-base-200 lg:bg-base-100 border-[0.5px] border-base-200 shadow-sm rounded-box m-2 p-2 gap-2 [&_li]:transition [&_li]:duration-200 [&_li]:hover:scale-105">
                            <li>
                                <A
                                    href="/config"
                                    class="tooltip tooltip-right"
                                    data-tip="Config"
                                    aria-label="Config"
                                >
                                    <Icon name="config" class="scale-95" />
                                </A>
                            </li>
                            <li
                                classList={{
                                    "pointer-events-none opacity-40":
                                        session()?.connected === false,
                                }}
                            >
                                <A
                                    href="/endpoints"
                                    class="tooltip tooltip-right"
                                    data-tip="Endpoints"
                                    aria-label="Endpoints"
                                >
                                    <Icon name="endpoints" class="scale-95" />
                                </A>
                            </li>
                            <li
                                classList={{
                                    "pointer-events-none opacity-40":
                                        session()?.connected === false,
                                }}
                            >
                                <A
                                    href="/tests"
                                    class="tooltip tooltip-right"
                                    data-tip="Tests"
                                    aria-label="Tests"
                                >
                                    <Icon name="tests" class="scale-95" />
                                </A>
                            </li>
                            <li
                                classList={{
                                    "pointer-events-none opacity-40":
                                        session()?.connected === false,
                                }}
                            >
                                <A
                                    href="/users"
                                    class="tooltip tooltip-right"
                                    data-tip="Users"
                                    aria-label="Users"
                                >
                                    <Icon name="users" class="scale-95" />
                                </A>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </>
    );
};
