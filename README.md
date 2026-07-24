# Dev Browzer

Dev Browzer is a Windows desktop workbench for viewing one development site at
phone, tablet, HD, and high-resolution desktop sizes at the same time. It uses
native Tauri child webviews, so previewed sites are not limited by iframe CSP or
`X-Frame-Options` rules.

## Features

- Six responsive previews enabled by default, with optional 4K and custom sizes
- Navigation synchronization for links, redirects, SPA history, hashes, and popups
- Shared Back, Forward, Home, Reload All, per-preview Reload, Focus, and DevTools
- Per-preview scaling and free-position drag layout with one-click auto arrange
- Persistent projects, current addresses, viewports, preview layouts, and recent URLs
- Native WebView2 previews with shared browser profile and exact CSS viewport sizes
- Local-only operation: no account, proxy, backend, or bundled target web server

## Prerequisites

- Windows 10 or 11 with Microsoft Edge WebView2
- Node.js 20 or newer
- Rust stable with the MSVC Windows target and C++ build tools
- Corepack

The repository pins Yarn through the `packageManager` field and uses the
`node-modules` linker.

## Setup

```powershell
corepack enable
yarn install
yarn tauri dev
```

Run the web application you want to inspect separately, then create a Dev
Browzer project using its local URL. Bare hosts such as `localhost:3000`
automatically use HTTP.

To exercise the included navigation fixture in another terminal:

```powershell
yarn fixture
```

Then point a project to `http://localhost:4173`.

## Verification

```powershell
yarn fmt
yarn fmt:check
yarn lint
yarn typecheck
yarn test
yarn build

Set-Location src-tauri
cargo fmt --check
cargo clippy -- -D warnings
cargo test
Set-Location ..

yarn tauri build
```

Installers are written below `src-tauri/target/release/bundle`.

## Security model

Only `http:` and `https:` preview URLs are accepted by both the React shell and
Rust commands. The bundled main shell is the only webview granted Tauri
capabilities; remote preview webviews cannot call Store or native commands.

## License

[MIT](LICENSE)
