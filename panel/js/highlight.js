// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Minimal syntax highlighters for SQL and JSON. They return DOM fragments built from text nodes,
// so the highlighted source is never interpreted as HTML.

const SQL_KEYWORDS = new Set(
    `select from where and or not insert into values update set delete join left right inner outer
    full cross on as group by order having limit offset distinct union all exists in is null like
    between case when then else end create table drop alter add primary key foreign references
    default auto_increment unique index view replace returning asc desc count sum avg min max
    begin commit rollback transaction if true false with recursive interval`
        .split(/\s+/)
        .filter(Boolean),
);

// Order matters: the first alternative that matches at a position wins.
const SQL_TOKENS =
    /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\]|\\.)*'?|"(?:[^"\\]|\\.)*"?|`[^`]*`?)|(\{[A-Za-z_][\w]*\})|(\|[A-Za-z_][\w]*\|)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w]*)/g;

function span(className, text) {
    const el = document.createElement("span");
    el.className = className;
    el.textContent = text;
    return el;
}

function tokenize(source, regex, classify) {
    const fragment = document.createDocumentFragment();
    let last = 0;

    for (const match of source.matchAll(regex)) {
        if (match.index > last) fragment.append(source.slice(last, match.index));

        const className = classify(match);
        fragment.append(className ? span(className, match[0]) : match[0]);
        last = match.index + match[0].length;
    }

    if (last < source.length) fragment.append(source.slice(last));

    return fragment;
}

/** Highlights SQL, including Silence's `{param}` and `|internal_param|` placeholders. */
export function highlightSQL(source) {
    return tokenize(source, SQL_TOKENS, (match) => {
        if (match[1]) return "hl-comment";
        if (match[2]) return "hl-string";
        if (match[3]) return "hl-param";
        if (match[4]) return "hl-internal";
        if (match[5]) return "hl-number";
        if (match[6] && SQL_KEYWORDS.has(match[6].toLowerCase())) return "hl-keyword";
        return null;
    });
}

const JSON_TOKENS = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/** Highlights JSON (any value is pretty printed first when it's not a string). */
export function highlightJSON(value) {
    const source = typeof value === "string" ? value : JSON.stringify(value, null, 2);

    return tokenize(source, JSON_TOKENS, (match) => {
        if (match[1]) return match[2] ? "hl-key" : "hl-string";
        if (match[3]) return "hl-keyword";
        if (match[4]) return "hl-number";
        return null;
    });
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

    const render = () => {
        // A trailing newline keeps the <pre> height in sync with the textarea.
        pre.replaceChildren(highlightSQL(textarea.value + "\n"));
        pre.scrollTop = textarea.scrollTop;
    };

    textarea.addEventListener("input", () => {
        render();
        onInput?.(textarea.value);
    });
    textarea.addEventListener("scroll", () => (pre.scrollTop = textarea.scrollTop));
    textarea.addEventListener("keydown", (event) => {
        if (event.key === "Tab" && !readonly) {
            event.preventDefault();
            textarea.setRangeText("    ", textarea.selectionStart, textarea.selectionEnd, "end");
            render();
        }
    });

    const el = document.createElement("div");
    el.className = "code-editor";
    el.append(pre, textarea);

    render();

    return {
        el,
        textarea,
        get: () => textarea.value,
        set: (text) => {
            textarea.value = text;
            render();
        },
    };
}
