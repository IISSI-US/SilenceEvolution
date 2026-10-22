// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import {
    createContext,
    createEffect,
    createResource,
    createSignal,
    on,
    Show,
    type Setter,
} from "solid-js";

import { A, useSearchParams, type RouteSectionProps } from "@solidjs/router";
export const Context = createContext<Global>();

type Global = {
    set_title: Setter<string>;
    set_error: Setter<string | undefined>;
    redirect: string;
};

export default (props: RouteSectionProps) => {
    // Check whether a session already exists.
    const [session_exists] = createResource(async () => {
        const res = await fetch("/api/internal/whoami");
        if (!res.ok) console.clear();
        return res.status === 200;
    });

    createEffect(
        on(session_exists, (session_exists) => {
            if (session_exists) document.location.replace("/");
        }),
    );

    const [title, set_title] = createSignal<string>("Login");

    const [error, set_error] = createSignal<string | undefined>(undefined);

    const [params, _] = useSearchParams();

    const redirect = (params["redirect"] ?? "/") as string;

    return (
        <>
            <nav>
                <div class="navbar bg-base-100/20 backdrop-blur-sm shadow fixed">
                    <div class="navbar-start"></div>
                    <div class="navbar-center">
                        <A
                            class="text-2xl font-stretch-150% btn btn-ghost"
                            href="/"
                        >
                            Silence
                        </A>
                    </div>
                    <div class="navbar-end"></div>
                </div>
            </nav>
            <div class="flex h-screen justify-center items-center [&_input]:rounded-lg">
                <div>
                    <Context.Provider
                        value={{
                            set_title: set_title,
                            set_error: set_error,
                            redirect,
                        }}
                    >
                        <h1 class="my-6 text-4xl font-extrabold text-center">
                            {title()}
                        </h1>
                        <div class="bg-base-200/50 border-base-300 backdrop-blur shadow-xl rounded-lg w-xs border p-4">
                            <Show when={error() != undefined}>
                                <div
                                    class="bg-red-800 border-red-400 backdrop-blur shadow-xl rounded-2xl! my-2 p-2 text-center cursor-pointer"
                                    onClick={() => set_error(undefined)}
                                >
                                    <p class="text-sm font-semibold">
                                        An error has occurred. {error()!}
                                    </p>
                                </div>
                            </Show>
                            {props.children}
                        </div>
                    </Context.Provider>
                </div>
            </div>
        </>
    );
};
