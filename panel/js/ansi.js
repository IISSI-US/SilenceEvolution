// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

// Converts a line with ANSI SGR escape codes (as produced by `tracing`) into DOM nodes.
// Text is inserted as text nodes, so log contents cannot inject markup.

const COLORS = ["#4b5563", "#e05252", "#3fae6a", "#c9a227", "#4f7fe0", "#b05fd0", "#2fa8b8", "#c8ccd2"];
const BRIGHT = ["#7b8494", "#ff7070", "#5fd08a", "#e8c44a", "#7aa2ff", "#d58af0", "#57c9d8", "#ffffff"];

// eslint-disable-next-line no-control-regex
const SGR = /\x1b\[([\d;]*)m/g;

/** @param {string} text */
export function ansiToNodes(text) {
    const fragment = document.createDocumentFragment();
    let style = {};
    let last = 0;

    const push = (chunk) => {
        if (!chunk) return;

        if (Object.keys(style).length === 0) {
            fragment.append(chunk);
            return;
        }

        const span = document.createElement("span");
        Object.assign(span.style, style);
        span.textContent = chunk;
        fragment.append(span);
    };

    for (const match of text.matchAll(SGR)) {
        push(text.slice(last, match.index));
        last = match.index + match[0].length;

        const codes = match[1] === "" ? [0] : match[1].split(";").map(Number);

        for (let i = 0; i < codes.length; i++) {
            const code = codes[i];

            if (code === 0) style = {};
            else if (code === 1) style = { ...style, fontWeight: "700" };
            else if (code === 2) style = { ...style, opacity: "0.7" };
            else if (code === 3) style = { ...style, fontStyle: "italic" };
            else if (code === 4) style = { ...style, textDecoration: "underline" };
            else if (code === 22) {
                const { fontWeight, opacity, ...rest } = style;
                style = rest;
            } else if (code === 23) {
                const { fontStyle, ...rest } = style;
                style = rest;
            } else if (code === 39) {
                const { color, ...rest } = style;
                style = rest;
            } else if (code >= 30 && code <= 37) style = { ...style, color: COLORS[code - 30] };
            else if (code >= 90 && code <= 97) style = { ...style, color: BRIGHT[code - 90] };
            else if (code === 38 && codes[i + 1] === 5) {
                const n = codes[i + 2] ?? 7;
                style = { ...style, color: n < 8 ? COLORS[n] : n < 16 ? BRIGHT[n - 8] : "" };
                i += 2;
            } else if (code === 38 && codes[i + 1] === 2) {
                style = { ...style, color: `rgb(${codes[i + 2]}, ${codes[i + 3]}, ${codes[i + 4]})` };
                i += 4;
            }
        }
    }

    push(text.slice(last));

    return fragment;
}
