// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Live server log, streamed through the `ConsoleStream` websocket (any path, selected by subprotocol).

import { ansiToNodes } from "./ansi.js";
import { h, icon, mount } from "./dom.js";

const MAX_LINES = 2000;
const STORAGE_KEY = "silence.console.open";

export function mountConsole(root) {
    const dot = h("span", { class: "status-dot", title: "Connecting…" });
    const log = h("div", { class: "console-log", role: "log", "aria-live": "off" });
    const status = h("span", { class: "muted", style: { fontSize: "12px" } });

    let open = false;

    try {
        open = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {}

    const setOpen = (value) => {
        open = value;
        root.classList.toggle("open", open);
        toggle.replaceChildren(icon("chevron"));
        toggle.style.transform = open ? "" : "rotate(180deg)";
        try {
            localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
        } catch {}
    };

    const clear = h(
        "button",
        {
            class: "btn ghost small",
            type: "button",
            onClick: (event) => {
                event.stopPropagation();
                log.replaceChildren();
            },
        },
        "Clear",
    );

    const toggle = h("button", { class: "btn ghost small", type: "button", "aria-label": "Toggle console" });

    mount(
        root,
        h("header", { onClick: () => setOpen(!open) }, dot, h("h2", {}, "Console"), status, h("span", { class: "spacer" }), clear, toggle),
        log,
    );

    setOpen(open);

    const appendLine = (text) => {
        const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 24;

        for (const line of text.replace(/\n$/, "").split("\n")) {
            log.append(h("div", {}, ansiToNodes(line)));
        }

        while (log.childElementCount > MAX_LINES) log.firstElementChild.remove();

        if (atBottom) log.scrollTop = log.scrollHeight;
    };

    const setStatus = (state, text) => {
        dot.className = `status-dot ${state}`;
        dot.title = text;
        status.textContent = state === "online" ? "" : text;
    };

    let retry = 1000;
    let connectedOnce = false;

    const connect = () => {
        let socket;

        try {
            socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/`, "ConsoleStream");
        } catch {
            setStatus("offline", "Console unavailable.");
            return;
        }

        socket.binaryType = "arraybuffer";

        socket.addEventListener("open", () => {
            connectedOnce = true;
            retry = 1000;
            setStatus("online", "Connected");
        });

        socket.addEventListener("message", (event) => {
            appendLine(typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data));
        });

        socket.addEventListener("close", () => {
            // Browsers reject the handshake when the server doesn't confirm the `ConsoleStream`
            // subprotocol; keep retrying slowly in case the server is restarted with a fix.
            setStatus("offline", connectedOnce ? "Disconnected, retrying…" : "Unavailable: the server rejected the connection.");
            setTimeout(connect, connectedOnce ? retry : 30000);
            retry = Math.min(retry * 2, 30000);
        });
    };

    connect();
}
