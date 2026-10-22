// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Syntax highlighting for SQL and JSON with tree-sitter (Arborium), served from the binary
// (`panel/vendor/arborium`, no CDN). The parser returns spans (offsets + capture names); the
// highlighted output is built with text nodes, so the source is never interpreted as HTML.
// Silence's placeholders (`{param}`, `|internal_param|`) are highlighted on top of SQL.

import { loadGrammar } from "/_silence/vendor/arborium/arborium.js";

const ARBORIUM = {
    cdn: "/_silence/vendor/arborium",
    version: "2.18.2",
    logger: { debug() {}, info() {}, warn: console.warn, error: console.error },
};

const grammars = {};

/**
 * Loads the grammars. Call it once before rendering: highlighting is synchronous afterwards.
 * If a grammar can't be loaded, that language is rendered as plain text.
 */
export async function loadHighlighters() {
    await Promise.all(
        ["sql", "json"].map(async (language) => {
            try {
                grammars[language] = await loadGrammar(language, ARBORIUM);
            } catch (err) {
                console.warn(`Cannot load the ${language} grammar.`, err);
            }
        }),
    );
}

// Capture names (e.g. `keyword.operator`) are reduced to their first segment and mapped to a class.
const CAPTURE_CLASSES = {
    keyword: "hl-keyword",
    operator: "hl-keyword",
    string: "hl-string",
    number: "hl-number",
    float: "hl-number",
    boolean: "hl-number",
    constant: "hl-number",
    comment: "hl-comment",
    property: "hl-key",
    attribute: "hl-key",
    function: "hl-function",
    type: "hl-type",
};

const SQL_PLACEHOLDERS = [
    [/\{\s*\w+\s*\}/g, "hl-param"],
    [/\|\w+\|/g, "hl-internal"],
];

/** Builds a fragment from `source` and a class per UTF-16 code unit. */
function render(source, classes) {
    const fragment = document.createDocumentFragment();
    let start = 0;

    for (let i = 1; i <= source.length; i++) {
        if (i === source.length || classes[i] !== classes[start]) {
            const text = source.slice(start, i);

            if (classes[start]) {
                const span = document.createElement("span");
                span.className = classes[start];
                span.textContent = text;
                fragment.append(span);
            } else {
                fragment.append(text);
            }

            start = i;
        }
    }

    return fragment;
}

function highlight(language, source, overlays = []) {
    const classes = new Array(source.length).fill(null);
    const grammar = grammars[language];

    if (grammar) {
        let spans = [];

        try {
            spans = grammar.parse(source).spans;
        } catch {}

        // Longer spans first, so nested (shorter) spans win.
        for (const span of [...spans].sort((a, b) => b.end - b.start - (a.end - a.start))) {
            const className = CAPTURE_CLASSES[span.capture.split(".")[0]];
            if (className) classes.fill(className, span.start, span.end);
        }
    }

    for (const [regex, className] of overlays) {
        for (const match of source.matchAll(regex)) classes.fill(className, match.index, match.index + match[0].length);
    }

    return render(source, classes);
}

/** Highlights SQL, including Silence's `{param}` and `|internal_param|` placeholders. */
export function highlightSQL(source) {
    return highlight("sql", source, SQL_PLACEHOLDERS);
}

/** Highlights JSON (any value is pretty printed first when it's not a string). */
export function highlightJSON(value) {
    return highlight("json", typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

/** Wraps a highlighted fragment in a `<pre class="code-block">`. */
export function codeBlock(fragment, className = "") {
    const pre = document.createElement("pre");
    pre.className = `code-block ${className}`.trim();
    pre.append(fragment);
    return pre;
}

/**
 * SQL editor: a textarea layered over a highlighted <pre>. Returns `{ el, textarea, get, set }`.
 */
export function sqlEditor(value = "", { readonly = false, rows = 6, onInput } = {}) {
    const pre = document.createElement("pre");
    pre.setAttribute("aria-hidden", "true");

    const textarea = document.createElement("textarea");
    textarea.spellcheck = false;
    textarea.rows = rows;
    textarea.readOnly = readonly;
    textarea.value = value;
    textarea.setAttribute("autocapitalize", "off");
    textarea.setAttribute("autocomplete", "off");

    const update = () => {
        // A trailing newline keeps the <pre> height in sync with the textarea.
        pre.replaceChildren(highlightSQL(textarea.value + "\n"));
        pre.scrollTop = textarea.scrollTop;
    };

    textarea.addEventListener("input", () => {
        update();
        onInput?.(textarea.value);
    });
    textarea.addEventListener("scroll", () => (pre.scrollTop = textarea.scrollTop));
    textarea.addEventListener("keydown", (event) => {
        if (event.key === "Tab" && !readonly) {
            event.preventDefault();
            textarea.setRangeText("    ", textarea.selectionStart, textarea.selectionEnd, "end");
            update();
        }
    });

    const el = document.createElement("div");
    el.className = "code-editor";
    el.append(pre, textarea);

    update();

    return {
        el,
        textarea,
        get: () => textarea.value,
        set: (text) => {
            textarea.value = text;
            update();
        },
    };
}
