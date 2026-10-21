// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Small DOM helpers. Text is always inserted with text nodes (never innerHTML) so that data coming
// from the API or the database cannot inject markup.

/**
 * Creates an element. `props` keys starting with `on` are event listeners, `class` sets className,
 * `dataset`/`style` take objects, booleans toggle attributes, everything else is set as attribute.
 * Children can be nodes, strings, numbers, arrays or null/false (skipped).
 * @param {string} tag
 * @param {Record<string, any>} [props]
 * @param {...any} children
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);

    for (const [key, value] of Object.entries(props ?? {})) {
        if (value === undefined || value === null || value === false) continue;

        if (key.startsWith("on") && typeof value === "function") {
            el.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === "class") {
            el.className = value;
        } else if (key === "dataset") {
            Object.assign(el.dataset, value);
        } else if (key === "style" && typeof value === "object") {
            Object.assign(el.style, value);
        } else if (key === "value" || key === "checked" || key === "selected") {
            el[key] = value;
        } else if (value === true) {
            el.setAttribute(key, "");
        } else {
            el.setAttribute(key, String(value));
        }
    }

    append(el, children);

    return el;
}

/** Appends children (see `h`) to a node. */
export function append(parent, children) {
    for (const child of [children].flat(Infinity)) {
        if (child === null || child === undefined || child === false) continue;

        parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }

    return parent;
}

/** Replaces all the children of a node. */
export function mount(parent, ...children) {
    parent.replaceChildren();
    return append(parent, children);
}

/** Inline SVG icons (stroke based, 24x24 viewBox). */
const ICONS = {
    endpoints: "M4 6h16M4 12h16M4 18h10",
    tests: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3",
    users: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 19v-1a4 4 0 0 0-3-3.9M16 3.1a3.5 3.5 0 0 1 0 6.8",
    config: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1",
    plus: "M12 5v14M5 12h14",
    x: "M18 6 6 18M6 6l12 12",
    play: "M6 4l14 8-14 8z",
    trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
    logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
    chevron: "M6 9l6 6 6-6",
    copy: "M9 9h11v11H9zM5 15H4V4h11v1",
    save: "M5 3h11l5 5v13H3V3zM7 3v6h8M7 21v-7h10v7",
};

/** Returns an inline SVG icon by name. */
export function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ICONS[name] ?? "");
    svg.append(path);

    return svg;
}

/** Shows a transient notification. `kind` is "info", "success" or "error". */
export function toast(message, kind = "info") {
    let container = document.querySelector(".toasts");

    if (!container) {
        container = h("div", { class: "toasts", role: "status", "aria-live": "polite" });
        document.body.append(container);
    }

    const close = () => item.remove();

    const item = h(
        "div",
        { class: `toast ${kind}` },
        h("p", {}, message),
        h("button", { class: "btn ghost small", type: "button", "aria-label": "Close", onClick: close }, icon("x")),
    );

    container.append(item);
    setTimeout(close, kind === "error" ? 8000 : 4000);
}

/**
 * Opens a modal dialog built from `body` and resolves with the clicked button's value
 * ("confirm" or "cancel"), or "cancel" when dismissed.
 */
export function modal({ title, body, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false }) {
    return new Promise((resolve) => {
        const dialog = h(
            "dialog",
            { class: "modal" },
            h(
                "form",
                { method: "dialog" },
                h("header", {}, h("h2", {}, title)),
                h("div", { class: "modal-body" }, body),
                h(
                    "footer",
                    {},
                    h("button", { class: "btn", value: "cancel", formnovalidate: true }, cancelLabel),
                    h("button", { class: danger ? "btn primary danger-fill" : "btn primary", value: "confirm" }, confirmLabel),
                ),
            ),
        );

        dialog.addEventListener("close", () => {
            resolve(dialog.returnValue || "cancel");
            dialog.remove();
        });

        document.body.append(dialog);
        dialog.showModal();
    });
}

/** Asks for confirmation before a destructive action. */
export async function confirmAction(title, message, confirmLabel = "Delete") {
    return (await modal({ title, body: h("p", {}, message), confirmLabel, danger: true })) === "confirm";
}

/** Returns a debounced version of `fn`. */
export function debounce(fn, ms = 150) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

/** Loading placeholder. */
export function loading(text = "Loading…") {
    return h("div", { class: "loading" }, h("div", { class: "spinner" }), text);
}

/** Chips editor for a list of short strings. Returns `{ el, get }`. */
export function chipsInput(values = [], { placeholder = "Add…", readonly = false } = {}) {
    const items = [...values];
    const input = h("input", { type: "text", placeholder: readonly ? "" : placeholder, readonly });
    const el = h("div", { class: readonly ? "chips readonly" : "chips", onClick: () => input.focus() });

    const render = () => {
        mount(
            el,
            items.map((value, ix) =>
                h(
                    "span",
                    { class: "chip" },
                    value,
                    !readonly &&
                        h(
                            "button",
                            {
                                type: "button",
                                "aria-label": `Remove ${value}`,
                                onClick: (event) => {
                                    event.stopPropagation();
                                    items.splice(ix, 1);
                                    render();
                                },
                            },
                            icon("x"),
                        ),
                ),
            ),
            !readonly && input,
        );
    };

    const commit = () => {
        const value = input.value.trim().replace(/,$/, "");
        if (value && !items.includes(value)) items.push(value);
        input.value = "";
        render();
        input.focus();
    };

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            commit();
        } else if (event.key === "Backspace" && input.value === "" && items.length) {
            items.pop();
            render();
            input.focus();
        }
    });

    input.addEventListener("blur", () => {
        if (input.value.trim()) commit();
    });

    render();

    return { el, get: () => [...items] };
}
