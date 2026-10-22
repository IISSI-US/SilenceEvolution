// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import { createEffect, createSignal, onCleanup, Show } from "solid-js";

import Convert from "ansi-to-html";
import Icon from "@admin/components/Icon";

const HEADER_HEIGHT = 36;
const DEFAULT_HEIGHT = 240;
const MAX_LINES = 2000;
const STORAGE_KEY = "console_height";

const stored_height = () => {
    try {
        return Number(localStorage.getItem(STORAGE_KEY)) || DEFAULT_HEIGHT;
    } catch {
        return DEFAULT_HEIGHT;
    }
};

/**
 * Server log, docked at the bottom of the panel. It's streamed by the server as Server-Sent
 * Events from `/_setup/console` (see `src/setup.rs`). The top edge can be dragged to resize it;
 * the buttons expand it to most of the screen or collapse it to its header.
 */
export default () => {
    let log: HTMLDivElement | undefined;

    const [height, set_height] = createSignal(stored_height());
    const [collapsed, set_collapsed] = createSignal(false);
    const [connected, set_connected] = createSignal<boolean | undefined>();

    const visible_height = () => (collapsed() ? HEADER_HEIGHT : height());

    // The page leaves room for the console at its bottom.
    createEffect(() =>
        document.documentElement.style.setProperty(
            "--console-height",
            `${visible_height()}px`,
        ),
    );

    const resize = (value: number) => {
        const clamped = Math.min(
            Math.max(value, HEADER_HEIGHT + 60),
            window.innerHeight - 80,
        );
        set_height(clamped);
        set_collapsed(false);
        try {
            localStorage.setItem(STORAGE_KEY, String(clamped));
        } catch {}
    };

    const start_drag = (event: PointerEvent) => {
        event.preventDefault();

        const move = (move_event: PointerEvent) =>
            resize(window.innerHeight - move_event.clientY);
        const stop = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
    };

    // Log lines are text: ANSI colors become spans, anything else is escaped.
    const convert = new Convert({ escapeXML: true });

    const append = (line: string) => {
        if (!log) return;

        const at_bottom =
            log.scrollHeight - log.scrollTop - log.clientHeight < 24;

        const row = document.createElement("div");
        row.innerHTML = convert.toHtml(line);
        log.append(row);

        while (log.childElementCount > MAX_LINES)
            log.firstElementChild?.remove();

        if (at_bottom) log.scrollTop = log.scrollHeight;
    };

    const events = new EventSource("/_setup/console");
    events.onopen = () => set_connected(true);
    events.onmessage = (event) => append(event.data);
    events.onerror = () => set_connected(false);
    onCleanup(() => events.close());

    return (
        <div
            class="fixed bottom-0 inset-x-0 z-[5] lg:pl-20 flex flex-col bg-base-100 border-t border-base-300"
            style={{ height: `${visible_height()}px` }}
        >
            <div
                class="h-1.5 -mt-1 cursor-ns-resize hover:bg-base-300"
                title="Drag to resize"
                onPointerDown={start_drag}
            ></div>
            <div class="flex items-center gap-3 px-4 shrink-0 h-8 text-xs font-mono">
                <span
                    class="status"
                    classList={{
                        "status-success": connected() === true,
                        "status-error": connected() === false,
                    }}
                ></span>
                <span class="font-bold tracking-wider">CONSOLE</span>
                <Show when={connected() === false}>
                    <span class="text-error">Disconnected, reconnecting…</span>
                </Show>
                <div class="ml-auto flex items-center gap-1">
                    <button
                        class="btn btn-ghost btn-xs"
                        onClick={() => log?.replaceChildren()}
                    >
                        Clear
                    </button>
                    <button
                        class="btn btn-ghost btn-xs"
                        title="Expand"
                        onClick={() =>
                            resize(
                                height() >= window.innerHeight * 0.6 &&
                                    !collapsed()
                                    ? DEFAULT_HEIGHT
                                    : window.innerHeight * 0.7,
                            )
                        }
                    >
                        <Icon name="expand" class="size-4" />
                    </button>
                    <button
                        class="btn btn-ghost btn-xs"
                        title={collapsed() ? "Show" : "Collapse"}
                        onClick={() => set_collapsed(!collapsed())}
                    >
                        <Icon
                            name={collapsed() ? "chevron-up" : "chevron"}
                            class="size-4"
                        />
                    </button>
                </div>
            </div>
            <div
                ref={log}
                class="flex-1 min-h-0 overflow-y-auto px-4 pb-2 font-mono text-xs/5 whitespace-pre-wrap break-words border-t border-base-300"
                classList={{ hidden: collapsed() }}
            ></div>
        </div>
    );
};
