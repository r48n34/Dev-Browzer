# Dev Browzer technical guide

This guide is for contributors and anyone running Dev Browzer from source. For a product-focused
overview and everyday workflow, see the [README](README.md).

## Requirements

- Windows 10 or 11 with Microsoft Edge WebView2
- Node.js 20 or newer
- Rust stable with the MSVC Windows target and C++ build tools
- Corepack

The repository pins Yarn with the `packageManager` field and uses the `node-modules` linker.

## Local development

```powershell
corepack enable
yarn install
yarn tauri dev
```

Start the web app you want to inspect separately, then create a Dev Browzer project using its
local URL. Bare hosts such as `localhost:3000` are normalized to HTTP.

The repository includes a navigation fixture for manual checks:

```powershell
yarn fixture
```

Point a project to `http://localhost:4173` while the fixture is running.

## Verification

Run the JavaScript checks from the repository root:

```powershell
yarn fmt:check
yarn lint
yarn typecheck
yarn test
yarn build
```

Run the Rust checks from `src-tauri`:

```powershell
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

Create Windows installers with:

```powershell
yarn tauri build
```

The generated installers are placed under `src-tauri/target/release/bundle`.

## Architecture and security

Dev Browzer uses native Tauri child webviews backed by WebView2. This lets it preview target sites
that would reject iframe embedding through CSP or `X-Frame-Options`, while preserving exact CSS
viewport sizes.

Only `http:` and `https:` preview URLs are accepted by the React shell and Rust commands. The
bundled main shell is the only webview granted Tauri capabilities; remote preview webviews cannot
call Store or native commands.

Project state uses schema version 3 and includes saved projects, current addresses, saved routes,
workspace presets, viewport device profiles, preview layouts, and recent URLs. Older stores are
migrated with empty route and preset collections.

Toolbar buttons, menus, and keyboard shortcuts share the command registry in
`src/commands/registry.ts`. Route, fit, status, viewport, and layout calculations stay in reusable
helpers under `src/utils`.

Screenshot capture uses WebView2's Chrome DevTools Protocol from a dedicated Tauri command.
Captures are written below the application data `captures` directory. Exported self-contained HTML
reports are written below `reports`; capture paths are validated before their contents are embedded.
Everything remains local.

The session-data manager reads cookies and local storage through the WebView2 DevTools protocol.
Cookie writes and deletes use WebView2's profile CookieManager, scoped to the current preview URL,
while local-storage operations run against the active preview's current origin. This allows
HttpOnly cookies to be managed without granting remote preview pages access to Tauri commands.
Destructive actions require a confirmation modal.
