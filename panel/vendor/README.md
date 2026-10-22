<!-- SilenceEvolution
     Copyright (C) 2026 DEAL research group, Universidad de Sevilla -->

# Vendored dependencies

Third-party ES modules used by the admin panel, embedded in the binary and served at
`/_silence/vendor/...`. There is no bundler: each HTML page maps the bare specifiers
(`solid-js`, `solid-js/web`, ...) to these files with an import map.

| Package | Version | Files (from the npm package) | License |
|---|---|---|---|
| `solid-js` | 1.9.17 | `dist/solid.js` → `solid-js/solid.js`, `web/dist/web.js` → `solid-js/web.js`, `html/dist/html.js` → `solid-js/html.js`, `store/dist/store.js` → `solid-js/store.js` | MIT |
| `@solidjs/router` | 0.16.3 | `dist/index.js` → `solidjs-router/index.js` | MIT |
| `@arborium/arborium` | 2.18.2 | `dist/arborium.js` → `arborium/arborium.js` | MIT OR Apache-2.0 |
| `@arborium/sql` | 2.18.2 | `grammar.js`, `grammar_bg.wasm` → `arborium/@arborium/sql@2.18.2/` | MIT |
| `@arborium/json` | 2.18.2 | `grammar.js`, `grammar_bg.wasm` → `arborium/@arborium/json@2.18.2/` | MIT |

They are the production builds, copied unmodified.

Arborium (tree-sitter compiled to WebAssembly) is configured in `panel/js/highlight.js` to load the
grammars from `/_silence/vendor/arborium` instead of its default CDN, keeping the path layout it
expects: `<base>/@arborium/<language>@<version>/grammar.js`. Only the grammars are needed (spans
are rendered by `highlight.js`), not Arborium's host module or themes. The SQL grammar is the
heaviest asset of the panel (5.4 MB, 1.25 MB gzipped).

## Updating

```bash
VERSION=1.9.17
curl -sL https://registry.npmjs.org/solid-js/-/solid-js-$VERSION.tgz | tar xz -C /tmp
cp /tmp/package/dist/solid.js       panel/vendor/solid-js/solid.js
cp /tmp/package/web/dist/web.js     panel/vendor/solid-js/web.js
cp /tmp/package/html/dist/html.js   panel/vendor/solid-js/html.js
cp /tmp/package/store/dist/store.js panel/vendor/solid-js/store.js
```

Then update the table above and check the panel (`ci/run_tests.sh` checks that every module is served).
