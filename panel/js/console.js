// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Live server log, streamed through the `ConsoleStream` websocket (any path, selected by subprotocol).
// Log lines are appended to the DOM directly (not through signals): the log can be long and only grows.

import { createSignal, onCleanup, onMount } from "solid-js";
import html from "solid-js/html";

import { ansiToNodes } from "./ansi.js";
import { Icon } from "./ui.js";

const MAX_LINES = 2000;
const STORAGE_KEY = "silence.console.open";

function storedOpen() {
    try {
        return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

export function Console() {
    const [open, setOpen] = createSignal(storedOpen());
    const [status, setStatus] = createSignal({ state: "", text: "Connecting…" });
    let log;
    let socket;
    let timer;
    let disposed = false;

    const toggle = () => {
        setOpen(!open());
        try {
            localStorage.setItem(STORAGE_KEY, open() ? "1" : "0");
        } catch {}
    };

    const appendLine = (text) => {
        const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 24;

        for (const line of text.replace(/\n$/, "").split("\n")) {
            const row = document.createElement("div");
            row.append(ansiToNodes(line));
            log.append(row);
        }

        while (log.childElementCount > MAX_LINES) log.firstElementChild.remove();

        if (atBottom) log.scrollTop = log.scrollHeight;
    };

    onMount(() => {
        let retry = 1000;
        let connectedOnce = false;

        const connect = () => {
            if (disposed) return;

            try {
                socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/`, "ConsoleStream");
            } catch {
                setStatus({ state: "offline", text: "Console unavailable." });
                return;
            }

            socket.binaryType = "arraybuffer";

            socket.addEventListener("open", () => {
                connectedOnce = true;
                retry = 1000;
                setStatus({ state: "online", text: "Connected" });
            });

            socket.addEventListener("message", (event) => {
                appendLine(typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data));
            });

            socket.addEventListener("close", () => {
                // Browsers reject the handshake when the server doesn't confirm the `ConsoleStream`
                // subprotocol; keep retrying slowly in case the server is restarted with a fix.
                setStatus({
                    state: "offline",
                    text: connectedOnce ? "Disconnected, retrying…" : "Unavailable: the server rejected the connection.",
                });
                timer = setTimeout(connect, connectedOnce ? retry : 30000);
                retry = Math.min(retry * 2, 30000);
            });
        };

        connect();
    });

    onCleanup(() => {
        disposed = true;
        clearTimeout(timer);
        socket?.close();
    });

    return html`
        <section class=${() => (open() ? "console open" : "console")}>
            <header onClick=${toggle}>
                <span class=${() => `status-dot ${status().state}`} title=${() => status().text}></span>
                <h2>Console</h2>
                <span class="muted" style="font-size: 12px">${() => (status().state === "online" ? "" : status().text)}</span>
                <span class="spacer"></span>
                <button
                    class="btn ghost small"
                    type="button"
                    onClick=${(event) => {
                        event.stopPropagation();
                        log.replaceChildren();
                    }}
                >
                    Clear
                </button>
                <button class="btn ghost small" type="button" aria-label="Toggle console" style=${() => (open() ? "" : "transform: rotate(180deg)")}>
                    <${Icon} name="chevron" />
                </button>
            </header>
            <div class="console-log" role="log" ref=${(el) => (log = el)}></div>
        </section>
    `;
}
