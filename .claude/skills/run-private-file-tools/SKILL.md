---
name: run-private-file-tools
description: Run, screenshot, or drive the FileHaven Astro web app. Use this skill to start the dev server, take screenshots of any page, smoke-test all routes for JS errors, or run named UI interactions (encrypt mode switch, password toggle, PDF rasterize mode). Triggers on: run, start, screenshot, smoke, verify, drive, test UI.
---

# run-private-file-tools

FileHaven — Astro 6 static web app. Driven by Playwright (headless Chromium) via
`.claude/skills/run-private-file-tools/driver.mjs`. No xvfb needed —
Playwright runs headless.

## Prerequisites

Node.js ≥ 22 (required by pdfjs-dist 6.x). Playwright and its Chromium
browser must be installed:

```bash
npm install           # installs playwright (devDependency)
npx playwright install chromium
```

## Start the dev server

```bash
npm run dev -- --port 4321
```

Starts on http://localhost:4321. Hot-reloads on save. Keep running in a
background terminal or background task while driving.

Alternatively, build and preview the static output:

```bash
npm run build && npm run preview -- --port 4321
```

## Run (agent path)

The driver talks to a running dev or preview server. Always start the
server first (see above), then in a separate shell:

### Smoke — screenshot every page, report JS errors

```bash
node .claude/skills/run-private-file-tools/driver.mjs --port 4321 -- smoke
```

Visits all 7 routes (`/`, `/heic-to-jpg`, `/remove-photo-metadata`,
`/compress-pdf`, `/encrypt-file`, `/about`, `/privacy`), takes a
screenshot of each, and prints `✅` / `❌` with HTTP status and any
browser JS errors. Exit code 0 = all pass.

Screenshots land in `.claude/skills/run-private-file-tools/screenshots/`.

### Single-page screenshot

```bash
node .claude/skills/run-private-file-tools/driver.mjs --port 4321 -- screenshot encrypt-file
node .claude/skills/run-private-file-tools/driver.mjs --port 4321 -- screenshot /   # home
```

### Named interactions (drive UI state)

```bash
# Switch Encrypt page to Decrypt mode
node .claude/skills/run-private-file-tools/driver.mjs --port 4321 -- interact encrypt-file encrypt-mode-switch

# Toggle password field show/hide
node .claude/skills/run-private-file-tools/driver.mjs --port 4321 -- interact encrypt-file encrypt-pw-toggle

# Switch Compress PDF to Rasterize mode (shows amber warning)
node .claude/skills/run-private-file-tools/driver.mjs --port 4321 -- interact compress-pdf pdf-rasterize
```

Each interaction takes a screenshot at `.claude/skills/run-private-file-tools/screenshots/interact-<action>.png`.

### Custom screenshot output dir

```bash
node .claude/skills/run-private-file-tools/driver.mjs --port 4321 --out /tmp/shots -- smoke
```

## Run (human path)

```bash
npm run dev
# opens http://localhost:4321 in the browser
```

## Gotchas

- **`playwright` is a devDependency** — run `npm install` first. The
  global `npx playwright` CLI is present but the Node.js package
  (`import { chromium } from 'playwright'`) resolves from
  `node_modules/`. If the driver errors with `ERR_MODULE_NOT_FOUND`,
  run `npm install` again.

- **Port conflicts** — `npm run dev` and `npm run preview` both default
  to 4321. Pass `--port XXXX` to both the server and `--port XXXX` to
  the driver if you need a different port.

- **BASE_PATH for GitHub Pages build** — `npm run build` produces a
  root-relative build by default. For a GitHub Pages build where assets
  live under `/filehaven/`, set the env var:
  ```bash
  BASE_PATH=/filehaven/ npm run build
  ```
  The dev/preview server always uses `/` — no env var needed locally.

- **Playwright Chromium not installed** — if you see `Executable doesn't
  exist`, run `npx playwright install chromium`. The browser binary is
  separate from the npm package.

- **Node 18 fails** — `pdfjs-dist` 6.x requires Node ≥ 22. The error is
  `SyntaxError: Unexpected token '?'` deep in pdfjs. Use Node 22+.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `ERR_MODULE_NOT_FOUND: playwright` | `npm install` |
| `Executable doesn't exist at .../chromium` | `npx playwright install chromium` |
| `ECONNREFUSED localhost:4321` | Start the dev server first: `npm run dev -- --port 4321` |
| `SyntaxError` in pdfjs during build | Node version < 22; switch to Node 22 |
| Smoke shows `❌` with JS error | Check the error message; usually a missing env var or a broken import |
