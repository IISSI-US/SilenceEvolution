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

They are the production builds, copied unmodified.

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
