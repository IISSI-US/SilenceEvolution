// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Shared Solid components of the admin panel (written with `solid-js/html`, no build step).

import { createSignal, For, Show } from "solid-js";
import html from "solid-js/html";

/** Icon from the sprite (`panel/icons.svg`). */
export function Icon(props) {
    return html`<svg class="icon" aria-hidden="true"><use href=${() => `/_silence/icons.svg#${props.name}`} /></svg>`;
}

/** HTTP method label (GET, POST…), colored by method. */
export function MethodBadge(props) {
    const method = () => (props.method ?? "").toLowerCase();
    return html`<span class=${() => `method ${method()}`}>${() => method().toUpperCase()}</span>`;
}

/** Loading placeholder. */
export function Loading(props) {
    return html`<div class="loading"><div class="spinner"></div>${() => props.text ?? "Loading…"}</div>`;
}

/** Error box for a failed resource. */
export function ErrorBox(props) {
    return html`<div class="alert danger">${() => props.error?.message ?? String(props.error)}</div>`;
}

/**
 * Renders `props.children` once `props.resource` is ready, with loading and error states.
 * The children function receives the resource's value.
 *
 * Pass the resource wrapped in a function: `<${Await} resource=${() => data}>`. In `solid-js/html`
 * a zero-argument function prop is read like `{fn()}` in JSX, so `resource=${data}` would pass the
 * resource's value instead of the resource.
 */
export function Await(props) {
    return html`
        <${Show} when=${() => !props.resource.error} fallback=${() => html`<${ErrorBox} error=${props.resource.error} />`}>
            <${Show} when=${() => props.resource() !== undefined} fallback=${html`<${Loading} />`}>
                ${() => props.children(props.resource())}
            <//>
        <//>
    `;
}

/** Page header: title, description and actions. */
export function PageHeader(props) {
    return html`
        <header class="page-header">
            <div>
                <h1>${() => props.title}</h1>
                <${Show} when=${() => props.description}><p>${() => props.description}</p><//>
            </div>
            <${Show} when=${() => props.actions}><div class="actions">${() => props.actions}</div><//>
        </header>
    `;
}

/** Labelled form field. */
export function Field(props) {
    return html`
        <label class="field">
            <span>${() => props.label}</span>
            ${() => props.children}
            <${Show} when=${() => props.hint}><small>${() => props.hint}</small><//>
        </label>
    `;
}

/**
 * Editor for a list of short strings (params, roles, tables). `props.value` is the initial list;
 * `props.onChange(list)` is called on every change.
 */
export function Chips(props) {
    const [items, setItems] = createSignal([...(props.value ?? [])]);
    let input;

    const update = (next) => {
        setItems(next);
        props.onChange?.(next);
    };

    const commit = () => {
        const value = input.value.trim().replace(/,$/, "");
        if (value && !items().includes(value)) update([...items(), value]);
        input.value = "";
    };

    const onKeyDown = (event) => {
        if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            commit();
        } else if (event.key === "Backspace" && input.value === "" && items().length) {
            update(items().slice(0, -1));
        }
    };

    return html`
        <div class=${() => (props.readonly ? "chips readonly" : "chips")} onClick=${() => input?.focus()}>
            <${For} each=${items}>
                ${(value) => html`
                    <span class="chip">
                        ${value}
                        <${Show} when=${() => !props.readonly}>
                            <button
                                type="button"
                                aria-label=${`Remove ${value}`}
                                onClick=${(event) => {
                                    event.stopPropagation();
                                    update(items().filter((item) => item !== value));
                                }}
                            >
                                <${Icon} name="x" />
                            </button>
                        <//>
                    </span>
                `}
            <//>
            <${Show} when=${() => !props.readonly}>
                <input
                    ref=${(el) => (input = el)}
                    type="text"
                    placeholder=${() => props.placeholder ?? "Add…"}
                    onKeyDown=${onKeyDown}
                    onBlur=${() => input.value.trim() && commit()}
                />
            <//>
        </div>
    `;
}

/** Segmented tabs. `props.tabs` is `[[value, label], ...]`. */
export function Tabs(props) {
    return html`
        <div class="tabs" role="tablist">
            <${For} each=${() => props.tabs}>
                ${([value, label]) => html`
                    <button type="button" role="tab" aria-selected=${() => String(props.value === value)} onClick=${() => props.onChange(value)}>
                        ${label}
                    </button>
                `}
            <//>
        </div>
    `;
}
