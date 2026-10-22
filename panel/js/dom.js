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

const SVG_NS = "http://www.w3.org/2000/svg";

/** Returns an icon from the sprite (`panel/icons.svg`) by its symbol id. */
export function icon(name) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");

    const use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", `/_silence/icons.svg#${name}`);
    svg.append(use);

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
