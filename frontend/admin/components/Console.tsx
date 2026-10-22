// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import { createSignal, Show } from "solid-js";

import { Portal } from "solid-js/web";

import Convert from "ansi-to-html";
import Icon from "@admin/components/Icon";

export default () => {
    let console_stream: HTMLDivElement | undefined = undefined;
    let root_pseudocontainer: HTMLDivElement | undefined = undefined;

    const [error, set_error] = createSignal<boolean>();

    const socket = new WebSocket("/", "ConsoleStream");

    socket.onmessage = async (msg: MessageEvent<Blob>) => {
        let paragraph = document.createElement("p");

        const convert = new Convert();

        paragraph.innerHTML = convert.toHtml(
            new TextDecoder().decode(await msg.data.bytes()),
        );

        console_stream!.append(paragraph);

        console_stream!.lastElementChild!.scrollIntoView({
            behavior: "smooth",
            block: "end",
        });
    };

    socket.onerror = (_) => {
        set_error(true);
    };

    document.addEventListener("keydown", (event) => {
        if (event.metaKey && event.key === "/")
            root_pseudocontainer!.style.height = "0vh";
    });

    return (
        <>
            <Portal>
                <div class="overscroll-none antialiased fixed flex flex-col w-screen h-screen inset-0 z-50 **:transition-all **:transition-discrete **:ease-in-out **:duration-800 pointer-events-none">
                    <div class="w-full flex justify-end">
                        <div
                            class="relative w-2 h-screen pointer-coarse:h-[90vh] min-h-[5vh] max-h-screen pointer-coarse:max-h-[90vh] scale-x-[500] opacity-0 resize-y overflow-hidden origin-bottom-right pointer-events-auto cursor-ns-resize active:transition-none [clip-path:inset(calc(100%-24px)_0_0_0)]"
                            onClick={(_) => {
                                if (
                                    root_pseudocontainer!.style.height ===
                                        undefined ||
                                    root_pseudocontainer!.clientHeight >=
                                        window.innerHeight
                                )
                                    root_pseudocontainer!.style.height = "80vh";
                            }}
                            ref={root_pseudocontainer}
                        ></div>
                    </div>

                    <div class="flex flex-col min-h-0 h-full w-full bg-base-100 opacity-90 hover:opacity-100 border-t-2 border-base-300 rounded-t-4xl duration-200! pointer-events-auto">
                        <div class="absolute top-1 left-1/2 -translate-x-1/2 -translate-y-4 w-32 h-1.25 bg-zinc-500 rounded-full pointer-coarse:hidden pointer-events-none"></div>

                        <div class="flex flex-col gap-2 h-full px-6 pt-4 text-sm font-mono">
                            <div class="flex items-center">
                                <div class="flex gap-3 self-start text-left mr-auto items-center">
                                    <div class="inline-grid *:[grid-area:1/1]">
                                        <div
                                            class="status status-success animate-ping"
                                            classList={{
                                                "status-error!": error(),
                                            }}
                                        ></div>
                                        <div
                                            class="status status-success"
                                            classList={{
                                                "status-error!": error(),
                                            }}
                                        ></div>
                                    </div>
                                    <span class="font-black tracking-wider">
                                        CONSOLE
                                    </span>
                                </div>
                                <div class="flex gap-3 self-end text-right ml-auto items-center">
                                    <button
                                        class="hover:scale-105 duration-200!"
                                        onClick={() => {
                                            console_stream!.innerHTML = "";
                                        }}
                                    >
                                        CLEAR
                                    </button>
                                    <button
                                        class="align-middle hover:scale-105 duration-200!"
                                        onClick={() => {
                                            root_pseudocontainer!.style.height =
                                                "100vh";
                                        }}
                                    >
                                        <Icon name="panel-close" />
                                    </button>
                                    <button
                                        class="align-middle hover:scale-105 duration-200!"
                                        onClick={() => {
                                            root_pseudocontainer!.style.height =
                                                "0vh";
                                        }}
                                    >
                                        <Icon name="expand" />
                                    </button>
                                </div>
                            </div>

                            <div class="border-t border-t-base-300"></div>

                            <div class="overflow-y-auto mb-2 text-sm/5 text-black dark:text-white **:whitespace-pre-wrap **:wrap-break-word">
                                <Show when={error()}>
                                    <p class="text-error font-bold">
                                        Couldn't connect to socket.
                                    </p>
                                </Show>
                                <div ref={console_stream}></div>
                            </div>
                        </div>
                    </div>
                </div>
            </Portal>
        </>
    );
};
