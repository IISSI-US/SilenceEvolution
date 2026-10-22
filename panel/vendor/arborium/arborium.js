const $ = [
  [/^#!.*\bpython[23]?\b/, "python"],
  [/^#!.*\bnode\b/, "javascript"],
  [/^#!.*\bdeno\b/, "typescript"],
  [/^#!.*\bbun\b/, "typescript"],
  [/^#!.*\bruby\b/, "ruby"],
  [/^#!.*\bperl\b/, "perl"],
  [/^#!.*\bphp\b/, "php"],
  [/^#!.*\bbash\b/, "bash"],
  [/^#!.*\bzsh\b/, "zsh"],
  [/^#!.*\bsh\b/, "bash"],
  [/^#!.*\blua\b/, "lua"],
  [/^#!.*\bawk\b/, "awk"]
], L = [
  // Rust - distinctive keywords
  [/\b(fn|impl|trait|pub\s+fn|let\s+mut|&mut|->)\b/, "rust"],
  // Go - distinctive keywords
  [/\b(func|package\s+\w+|import\s+\(|go\s+func|chan\s+\w+)\b/, "go"],
  // Python - distinctive patterns
  [/\b(def\s+\w+\s*\(|import\s+\w+|from\s+\w+\s+import|class\s+\w+:)\b/, "python"],
  // TypeScript - distinctive type annotations
  [/:\s*(string|number|boolean|void)\b|\binterface\s+\w+\s*\{/, "typescript"],
  // JavaScript - distinctive patterns (after TS check)
  [/\b(const|let|var)\s+\w+\s*=|function\s+\w+\s*\(|=>\s*\{/, "javascript"],
  // Ruby - distinctive keywords
  [/\b(def\s+\w+|end\b|do\s*\|.*\||puts\s+|require\s+['"])\b/, "ruby"],
  // Java - distinctive patterns
  [/\b(public\s+class|private\s+\w+|System\.out\.println)\b/, "java"],
  // C++ - distinctive patterns
  [/\b(#include\s*<|std::|template\s*<|nullptr|cout\s*<<)\b/, "cpp"],
  // C - distinctive patterns (after C++ check)
  [/\b(#include\s*[<"]|printf\s*\(|int\s+main\s*\(|void\s+\w+\s*\()\b/, "c"],
  // C# - distinctive patterns
  [/\b(namespace\s+\w+|using\s+System|public\s+static\s+void)\b/, "c-sharp"],
  // PHP - distinctive patterns
  [/<\?php|\$\w+\s*=/, "php"],
  // Swift - distinctive patterns
  [/\b(func\s+\w+|var\s+\w+:\s*\w+|let\s+\w+:\s*\w+|@objc)\b/, "swift"],
  // Kotlin - distinctive patterns
  [/\b(fun\s+\w+|val\s+\w+|var\s+\w+:|data\s+class)\b/, "kotlin"],
  // Scala - distinctive patterns
  [/\b(def\s+\w+|val\s+\w+|var\s+\w+|object\s+\w+|case\s+class)\b/, "scala"],
  // Haskell - distinctive patterns
  [/\b(module\s+\w+|import\s+qualified|data\s+\w+\s*=|::\s*\w+\s*->)\b/, "haskell"],
  // Elixir - distinctive patterns
  [/\b(defmodule\s+\w+|def\s+\w+|defp\s+\w+|\|>)\b/, "elixir"],
  // Lua - distinctive patterns
  [/\b(local\s+\w+\s*=|function\s+\w+\.\w+|require\s*\()\b/, "lua"],
  // SQL - distinctive patterns
  [/\b(SELECT\s+.*\s+FROM|INSERT\s+INTO|CREATE\s+TABLE|ALTER\s+TABLE)\b/i, "sql"],
  // Shell/Bash - distinctive patterns
  [/\b(if\s+\[\s*|then\b|fi\b|echo\s+["']|export\s+\w+=)\b/, "bash"],
  // YAML - distinctive patterns
  [/^\s*[\w-]+:\s*[\w\-"'[{]|^---\s*$/, "yaml"],
  // JSON - distinctive patterns
  [/^\s*\{[\s\S]*"[\w-]+":\s*/, "json"],
  // TOML - distinctive patterns
  [/^\s*\[[\w.-]+\]\s*$|^\s*\w+\s*=\s*["'\d\[]/, "toml"],
  // HTML - distinctive patterns
  [/<(!DOCTYPE|html|head|body|div|span|p|a\s)/i, "html"],
  // CSS - distinctive patterns
  [/^\s*[\w.#@][\w\s,#.:>+~-]*\{[^}]*\}|@media\s|@import\s/, "css"],
  // Markdown - distinctive patterns
  [/^#{1,6}\s+\w|^\s*[-*+]\s+\w|^\s*\d+\.\s+\w|```\w*\n/, "markdown"],
  // XML - distinctive patterns
  [/<\?xml|<[\w:-]+\s+xmlns/, "xml"],
  // Dockerfile
  [/^FROM\s+\w+|^RUN\s+|^COPY\s+|^ENTRYPOINT\s+/m, "dockerfile"],
  // Nginx config
  [/\b(server\s*\{|location\s+[\/~]|proxy_pass\s+)\b/, "nginx"],
  // Zig
  [/\b(pub\s+fn|const\s+\w+\s*=|@import\(|comptime)\b/, "zig"]
];
function R(e) {
  const t = e.split(`
`)[0];
  for (const [a, r] of $)
    if (a.test(t))
      return r;
  for (const [a, r] of L)
    if (a.test(e))
      return r;
  return null;
}
function F(e) {
  const t = e.match(/\blanguage-(\w+)\b/);
  if (t) return t[1];
  const a = e.match(/\blang-(\w+)\b/);
  if (a) return a[1];
  const r = /* @__PURE__ */ new Set([
    "rust",
    "javascript",
    "typescript",
    "python",
    "ruby",
    "go",
    "java",
    "c",
    "cpp",
    "csharp",
    "php",
    "swift",
    "kotlin",
    "scala",
    "haskell",
    "elixir",
    "lua",
    "sql",
    "bash",
    "shell",
    "yaml",
    "json",
    "toml",
    "html",
    "css",
    "xml",
    "markdown",
    "dockerfile",
    "nginx",
    "zig",
    "text",
    "plaintext",
    "console",
    "sh"
  ]);
  for (const s of e.split(/\s+/))
    if (r.has(s.toLowerCase()))
      return s.toLowerCase();
  return null;
}
function J(e) {
  const t = {
    js: "javascript",
    ts: "typescript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    sh: "bash",
    shell: "bash",
    yml: "yaml",
    bat: "batch",
    cs: "c-sharp",
    csharp: "c-sharp",
    "c++": "cpp",
    "c#": "c-sharp",
    "f#": "fsharp",
    dockerfile: "dockerfile",
    docker: "dockerfile",
    makefile: "make",
    plaintext: "text",
    plain: "text",
    txt: "text"
  }, a = e.toLowerCase();
  return t[a] || a;
}
const U = "2.18.2", E = [
  "ada",
  "agda",
  "asciidoc",
  "asm",
  "awk",
  "bash",
  "batch",
  "c",
  "c-sharp",
  "caddy",
  "capnp",
  "cedar",
  "cedarschema",
  "clojure",
  "cmake",
  "cobol",
  "commonlisp",
  "cpp",
  "css",
  "d",
  "dart",
  "devicetree",
  "diff",
  "dockerfile",
  "dot",
  "elisp",
  "elixir",
  "elm",
  "erlang",
  "fish",
  "fsharp",
  "gitattributes",
  "gleam",
  "glsl",
  "go",
  "graphql",
  "groovy",
  "haskell",
  "hcl",
  "hlsl",
  "html",
  "idris",
  "ini",
  "java",
  "javascript",
  "jinja2",
  "jq",
  "jsdoc",
  "json",
  "julia",
  "just",
  "kconfig",
  "kdl",
  "kotlin",
  "lean",
  "lua",
  "make",
  "markdown",
  "matlab",
  "meson",
  "nginx",
  "ninja",
  "nix",
  "objc",
  "ocaml",
  "odin",
  "perl",
  "php",
  "postscript",
  "powershell",
  "prolog",
  "proto",
  "python",
  "query",
  "r",
  "regex",
  "rego",
  "rescript",
  "ron",
  "ruby",
  "rust",
  "scala",
  "scheme",
  "scss",
  "solidity",
  "sparql",
  "sql",
  "ssh-config",
  "starlark",
  "styx",
  "svelte",
  "swift",
  "textproto",
  "thrift",
  "tlaplus",
  "toml",
  "tsx",
  "typescript",
  "typst",
  "uiua",
  "vb",
  "verilog",
  "vhdl",
  "vim",
  "vue",
  "wit",
  "x86asm",
  "xml",
  "yaml",
  "yuri",
  "zig",
  "zsh"
], z = [
  {
    name: "attribute",
    tag: "at"
  },
  {
    name: "constant",
    tag: "co"
  },
  {
    name: "constant.builtin",
    tag: "cb",
    parentTag: "constant"
  },
  {
    name: "constructor",
    tag: "cr"
  },
  {
    name: "function.builtin",
    tag: "fb",
    parentTag: "function"
  },
  {
    name: "function",
    tag: "f"
  },
  {
    name: "function.method",
    tag: "fm",
    parentTag: "function"
  },
  {
    name: "keyword",
    tag: "k"
  },
  {
    name: "keyword.conditional",
    tag: "kc",
    parentTag: "keyword"
  },
  {
    name: "keyword.coroutine",
    tag: "ko",
    parentTag: "keyword"
  },
  {
    name: "keyword.debug",
    tag: "kd",
    parentTag: "keyword"
  },
  {
    name: "keyword.exception",
    tag: "ke",
    parentTag: "keyword"
  },
  {
    name: "keyword.function",
    tag: "kf",
    parentTag: "keyword"
  },
  {
    name: "keyword.import",
    tag: "ki",
    parentTag: "keyword"
  },
  {
    name: "keyword.operator",
    tag: "kp",
    parentTag: "keyword"
  },
  {
    name: "keyword.repeat",
    tag: "kr",
    parentTag: "keyword"
  },
  {
    name: "keyword.return",
    tag: "kt",
    parentTag: "keyword"
  },
  {
    name: "keyword.type",
    tag: "ky",
    parentTag: "keyword"
  },
  {
    name: "operator",
    tag: "o"
  },
  {
    name: "property",
    tag: "pr"
  },
  {
    name: "punctuation",
    tag: "p"
  },
  {
    name: "punctuation.bracket",
    tag: "pb",
    parentTag: "punctuation"
  },
  {
    name: "punctuation.delimiter",
    tag: "pd",
    parentTag: "punctuation"
  },
  {
    name: "punctuation.special",
    tag: "ps",
    parentTag: "punctuation"
  },
  {
    name: "string",
    tag: "s"
  },
  {
    name: "string.special",
    tag: "ss",
    parentTag: "string"
  },
  {
    name: "tag",
    tag: "tg"
  },
  {
    name: "tag.delimiter",
    tag: "td",
    parentTag: "tag"
  },
  {
    name: "tag.error",
    tag: "te",
    parentTag: "tag"
  },
  {
    name: "type",
    tag: "t"
  },
  {
    name: "type.builtin",
    tag: "tb",
    parentTag: "type"
  },
  {
    name: "type.qualifier",
    tag: "tq",
    parentTag: "type"
  },
  {
    name: "variable",
    tag: "v"
  },
  {
    name: "variable.builtin",
    tag: "vb",
    parentTag: "variable"
  },
  {
    name: "variable.parameter",
    tag: "vp",
    parentTag: "variable"
  },
  {
    name: "comment",
    tag: "c"
  },
  {
    name: "comment.documentation",
    tag: "cd",
    parentTag: "comment"
  },
  {
    name: "macro",
    tag: "m"
  },
  {
    name: "label",
    tag: "l"
  },
  {
    name: "diff.addition",
    tag: "da"
  },
  {
    name: "diff.deletion",
    tag: "dd"
  },
  {
    name: "number",
    tag: "n"
  },
  {
    name: "text.literal",
    tag: "tl"
  },
  {
    name: "text.emphasis",
    tag: "em"
  },
  {
    name: "text.strong",
    tag: "st"
  },
  {
    name: "text.uri",
    tag: "tu"
  },
  {
    name: "text.reference",
    tag: "tr"
  },
  {
    name: "string.escape",
    tag: "se",
    parentTag: "string"
  },
  {
    name: "text.title",
    tag: "tt"
  },
  {
    name: "text.strikethrough",
    tag: "tx"
  },
  {
    name: "spell",
    tag: "sp"
  },
  {
    name: "embedded",
    tag: "eb"
  },
  {
    name: "error",
    tag: "er"
  },
  {
    name: "namespace",
    tag: "ns"
  },
  {
    name: "include",
    tag: "in",
    parentTag: "keyword"
  },
  {
    name: "storageclass",
    tag: "sc",
    parentTag: "keyword"
  },
  {
    name: "repeat",
    tag: "rp",
    parentTag: "keyword"
  },
  {
    name: "conditional",
    tag: "cn",
    parentTag: "keyword"
  },
  {
    name: "exception",
    tag: "ex",
    parentTag: "keyword"
  },
  {
    name: "preproc",
    tag: "pp",
    parentTag: "keyword"
  },
  {
    name: "none",
    tag: ""
  },
  {
    name: "character",
    tag: "ch",
    parentTag: "string"
  },
  {
    name: "character.special",
    tag: "cs",
    parentTag: "string"
  },
  {
    name: "variable.member",
    tag: "vm",
    parentTag: "variable"
  },
  {
    name: "function.definition",
    tag: "fd",
    parentTag: "function"
  },
  {
    name: "type.definition",
    tag: "tf",
    parentTag: "type"
  },
  {
    name: "function.call",
    tag: "fc",
    parentTag: "function"
  },
  {
    name: "keyword.modifier",
    tag: "km",
    parentTag: "keyword"
  },
  {
    name: "keyword.directive",
    tag: "dr",
    parentTag: "keyword"
  },
  {
    name: "string.regexp",
    tag: "rx",
    parentTag: "string"
  },
  {
    name: "nospell",
    tag: ""
  },
  {
    name: "float",
    tag: "n"
  },
  {
    name: "boolean",
    tag: "cb"
  }
];
function P(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const T = {
  manual: !1,
  theme: "one-dark",
  selector: "pre code",
  cdn: "jsdelivr",
  version: U,
  // Precise version from manifest
  pluginsUrl: "",
  // Empty means use bundled manifest
  hostUrl: "",
  // Empty means use CDN based on version
  logger: console,
  resolveHostJs: ({ baseUrl: e, path: t }) => import(
    /* @vite-ignore */
    `${e}/${t}`
  ),
  resolveHostWasm: ({ baseUrl: e, path: t }) => fetch(`${e}/${t}`),
  resolveJs: ({ baseUrl: e, path: t }) => import(
    /* @vite-ignore */
    `${e}/${t}`
  ),
  resolveWasm: ({ baseUrl: e, path: t }) => fetch(`${e}/${t}`)
};
let f = null, h = null, y = { ...T };
const k = /* @__PURE__ */ new Map(), v = /* @__PURE__ */ new Map(), m = new Set(E);
let p = null, w = null;
async function x(e) {
  if (e.pluginsUrl)
    return w || (w = (async () => {
      e.logger.debug(`[arborium] Loading local plugins manifest from: ${e.pluginsUrl}`);
      const t = await fetch(e.pluginsUrl);
      if (!t.ok)
        throw new Error(`Failed to load plugins.json: ${t.status}`);
      p = await t.json(), e.logger.debug(`[arborium] Loaded local manifest with ${p?.entries.length} entries`);
    })(), w);
}
function H(e, t) {
  if (p) {
    const n = p.entries.find((g) => g.language === e);
    if (n)
      return n.local_js.substring(0, n.local_js.lastIndexOf("/"));
  }
  const a = t.cdn, r = t.version;
  let s;
  return a === "jsdelivr" ? s = "https://cdn.jsdelivr.net/npm" : a === "unpkg" ? s = "https://unpkg.com" : s = a, `${s}/@arborium/${e}@${r}`;
}
async function _(e, t) {
  const a = k.get(e);
  if (a)
    return t.logger.debug(`[arborium] Grammar '${e}' found in cache`), a;
  const r = v.get(e);
  if (r)
    return t.logger.debug(`[arborium] Grammar '${e}' already loading, waiting...`), r;
  const s = I(e, t);
  v.set(e, s);
  try {
    return await s;
  } finally {
    v.delete(e);
  }
}
async function I(e, t) {
  if (await x(t), !m.has(e) && !p?.entries.some((a) => a.language === e))
    return t.logger.debug(`[arborium] Grammar '${e}' not available`), null;
  try {
    const a = t.version, r = H(e, t), s = t.resolveJs === T.resolveJs ? ` from ${r}/grammar.js` : "";
    t.logger.debug(`[arborium] Loading grammar '${e}'${s}`);
    const n = await t.resolveJs({ language: e, baseUrl: r, version: a, path: "grammar.js" }), g = await t.resolveWasm({ language: e, baseUrl: r, version: a, path: "grammar_bg.wasm" });
    await n.default({ module_or_path: g });
    const i = n.language_id();
    i !== e && t.logger.warn(`[arborium] Language ID mismatch: expected '${e}', got '${i}'`);
    const b = n.injection_languages(), u = {
      languageId: e,
      injectionLanguages: b,
      module: n,
      // UTF-8 parsing for Rust host
      parseUtf8: (l) => {
        const o = n.create_session();
        try {
          n.set_text(o, l);
          const c = n.parse(o);
          return {
            spans: c.spans || [],
            injections: c.injections || []
          };
        } catch (c) {
          return t.logger.error("[arborium] Parse error:", c), { spans: [], injections: [] };
        } finally {
          n.free_session(o);
        }
      },
      // UTF-16 parsing for JavaScript public API
      parseUtf16: (l) => {
        const o = n.create_session();
        try {
          n.set_text(o, l);
          const c = n.parse_utf16(o);
          return {
            spans: c.spans || [],
            injections: c.injections || []
          };
        } catch (c) {
          return t.logger.error("[arborium] Parse error:", c), { spans: [], injections: [] };
        } finally {
          n.free_session(o);
        }
      }
    };
    return k.set(e, u), t.logger.debug(`[arborium] Grammar '${e}' loaded successfully`), u;
  } catch (a) {
    return t.logger.error(`[arborium] Failed to load grammar '${e}':`, a), null;
  }
}
const j = /* @__PURE__ */ new Map();
let q = 1;
function C(e) {
  globalThis.arboriumHost = {
    /** Check if a language is available (sync) */
    isLanguageAvailable(t) {
      return m.has(t) || k.has(t);
    },
    /** Load a grammar and return a handle (async) */
    async loadGrammar(t) {
      const a = await _(t, e);
      if (!a) return 0;
      for (const [s, n] of j)
        if (n === a) return s;
      const r = q++;
      return j.set(r, a), r;
    },
    /** Parse text using a grammar handle (sync) - returns UTF-8 offsets for Rust host */
    parse(t, a) {
      const r = j.get(t);
      return r ? r.parseUtf8(a) : { spans: [], injections: [] };
    }
  };
}
function G(e) {
  if (e.hostUrl)
    return e.hostUrl;
  const t = e.cdn, a = e.version;
  let r;
  t === "jsdelivr" ? r = "https://cdn.jsdelivr.net/npm" : t === "unpkg" ? r = "https://unpkg.com" : r = t;
  const s = a === "latest" ? "" : `@${a}`;
  return `${r}/@arborium/arborium${s}/dist`;
}
async function S(e) {
  return f || h || (h = (async () => {
    C(e);
    const t = G(e), a = e.resolveHostJs === T.resolveHostJs ? ` from ${t}/arborium_host.js` : "";
    e.logger.debug(`[arborium] Loading host${a}`);
    try {
      const r = await e.resolveHostJs({ baseUrl: t, path: "arborium_host.js" }), s = await e.resolveHostWasm({ baseUrl: t, path: "arborium_host_bg.wasm" });
      return await r.default({ module_or_path: s }), f = {
        highlight: r.highlight,
        isLanguageAvailable: r.isLanguageAvailable
      }, e.logger.debug("[arborium] Host loaded successfully"), f;
    } catch (r) {
      return e.logger.error("[arborium] Failed to load host:", r), null;
    }
  })(), h);
}
async function A(e, t, a) {
  const r = d(a), s = await S(r);
  if (s)
    try {
      return s.highlight(e, t);
    } catch (n) {
      r.logger.error("[arborium] Host highlight failed:", n);
    }
  return P(t);
}
async function M(e, t) {
  const a = d(t), r = await _(e, a);
  if (!r) return null;
  const { module: s } = r;
  return {
    languageId: () => r.languageId,
    injectionLanguages: () => r.injectionLanguages,
    highlight: async (n) => A(e, n, t),
    // Public API returns UTF-16 offsets for JavaScript compatibility
    parse: (n) => r.parseUtf16(n),
    createSession: () => {
      const n = s.create_session(), g = () => {
        try {
          const i = s.parse_utf16(n);
          return {
            spans: i.spans || [],
            injections: i.injections || []
          };
        } catch (i) {
          return a.logger.error("[arborium] Session parse error:", i), { spans: [], injections: [] };
        }
      };
      return {
        setText: (i) => s.set_text(n, i),
        applyEdit: (i, b) => (s.apply_edit(n, i, b), g()),
        // Session.parse() returns UTF-16 offsets for JavaScript compatibility
        parse: g,
        cancel: () => s.cancel(n),
        free: () => s.free_session(n)
      };
    },
    dispose: () => {
    }
  };
}
async function N(e, t, a) {
  const r = d(a), s = e;
  await s.default({ module_or_path: t });
  const n = s.language_id(), g = s.injection_languages(), i = {
    languageId: n,
    injectionLanguages: g,
    module: s,
    parseUtf8: (u) => {
      const l = s.create_session();
      try {
        s.set_text(l, u);
        const o = s.parse(l);
        return {
          spans: o.spans || [],
          injections: o.injections || []
        };
      } catch (o) {
        return r.logger.error("[arborium] Parse error:", o), { spans: [], injections: [] };
      } finally {
        s.free_session(l);
      }
    },
    parseUtf16: (u) => {
      const l = s.create_session();
      try {
        s.set_text(l, u);
        const o = s.parse_utf16(l);
        return {
          spans: o.spans || [],
          injections: o.injections || []
        };
      } catch (o) {
        return r.logger.error("[arborium] Parse error:", o), { spans: [], injections: [] };
      } finally {
        s.free_session(l);
      }
    }
  };
  return k.set(n, i), m.add(n), r.logger.debug(`[arborium] Grammar '${n}' registered`), await M(n, a);
}
function d(e) {
  return e ? { ...y, ...e } : { ...y };
}
function O(e) {
  y = { ...y, ...e };
}
async function W(e, t) {
  const a = d(t);
  return await x(a), m.has(e) || (p?.entries.some((r) => r.language === e) ?? !1);
}
async function B(e) {
  const t = d(e);
  return await x(t), p ? p.entries.map((a) => a.language) : Array.from(m);
}
export {
  E as availableLanguages,
  R as detectLanguage,
  F as extractLanguageFromClass,
  B as getAvailableLanguages,
  d as getConfig,
  A as highlight,
  z as highlights,
  W as isLanguageAvailable,
  M as loadGrammar,
  J as normalizeLanguage,
  U as pluginVersion,
  N as registerGrammar,
  O as setConfig
};
//# sourceMappingURL=arborium.js.map
