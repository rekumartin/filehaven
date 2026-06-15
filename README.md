# PrivateFileTools

Privacy-first, client-side file tools. Every operation runs entirely in the user's browser — no uploads, no backend, no data collection.

## Stack

- **Astro 6** — static site generator
- **Tailwind CSS 3** — utility-first CSS via PostCSS (`tailwind.config.cjs` + `postcss.config.cjs`)
- **TypeScript** — strict mode throughout
- **heic2any** — HEIC/HEIF → JPG, browser-side WebAssembly
- **piexifjs** — EXIF read/strip for JPEG (lazy-loaded)
- **pdfjs-dist** — PDF page rendering for rasterize mode (lazy-loaded)
- **pdf-lib** — PDF construction and optimize mode (lazy-loaded)

## Local development

**Prerequisites:** Node.js 22+ (required by pdfjs-dist 6.x)

```bash
cd private-file-tools
npm install
npm run dev        # dev server on http://localhost:4321
npm run build      # production build → dist/
npm run preview    # serve the dist/ build locally
```

## Security

### Dependency audit

Run `npm audit` (or `npm run audit`) regularly and after every `npm install`:

```bash
npm audit
```

**Known suppressed findings (as of 2026-06):** Three `high` esbuild vulnerabilities exist in the dev dependency chain (via `astro → vite → esbuild`):

| CVE | Impact | Why we accept it |
|-----|--------|-----------------|
| `GHSA-g7r4-m6w7-qqqr` | esbuild dev server arbitrary file read (Windows) | Dev server only; never exposed in production. Mitigation: don't run `npm run dev` on an untrusted network. |
| `GHSA-gv7w-rqvm-qjhr` | esbuild Deno module integrity | Deno-specific; not applicable to our Node.js build. |

`npm audit fix --force` would downgrade Astro to 2.4.5, breaking the project. **Do not run it.** The production static output (`dist/`) contains no vulnerable code — esbuild is a build-time tool only.

### Security headers (`public/_headers`)

Cloudflare Pages applies these headers to every response:

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' static.cloudflare.com; style-src 'self'; img-src 'self' blob: data:; connect-src 'self' cloudflareinsights.com; …` | Restricts all executable resources to our origin + analytics. Blocks any third-party script from running. |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Forces HTTPS for 1 year; preload-eligible. |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing. |
| `Referrer-Policy` | `no-referrer` | Nothing is sent in the `Referer` header — files in transit stay private. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), …` | Denies all sensitive browser APIs. |
| `X-Frame-Options` | `DENY` | Prevents clickjacking. |

**Third-party origins in the CSP** (the complete, audited list):

- `static.cloudflare.com` — Cloudflare Web Analytics beacon script (only loaded when `PUBLIC_CF_BEACON_TOKEN` is set)
- `cloudflareinsights.com` — where the beacon sends anonymised page-view counts

No other third-party origin is permitted. All npm libraries (heic2any, pdfjs-dist, pdf-lib, piexifjs) are bundled locally by Vite and served from `'self'`.

### Subresource Integrity (SRI) note

The Cloudflare Analytics beacon (`static.cloudflare.com/beacon.min.js`) is loaded without an SRI hash because Cloudflare does not version this URL — the hash would go stale whenever they update the script. Mitigation: the script is scoped to a trusted first-party CDN; the CSP restricts connections to `cloudflareinsights.com` only; and the script has no access to file data (it only reads the page URL). If you remove analytics, remove both domains from `public/_headers`.

### Pinned dependency versions

`package.json` uses exact version pins (no `^` or `~`) to prevent accidental upgrades. After every `npm install` or `npm update`, verify the lock file is committed:

```bash
git add package-lock.json
git status  # should show package-lock.json as the only changed file
```

## Deploy to Cloudflare Pages

### 1 — Push your code to GitHub

Make sure the repository is on GitHub (or GitLab / Bitbucket).

### 2 — Create a Cloudflare Pages project

1. Log in at <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Authorise Cloudflare to access your repository and select it.

### 3 — Configure the build

| Setting | Value |
|---------|-------|
| **Framework preset** | Astro |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | `private-file-tools` *(only if this is a monorepo)* |

Under **Environment variables → (Build)** add:

| Variable | Value |
|----------|-------|
| `NODE_VERSION` | `22` |

> pdfjs-dist 6.x requires Node 22. Cloudflare Pages defaults to Node 18; setting this variable overrides it.

Click **Save and Deploy**. The first deployment will run immediately. Future pushes to `main` deploy automatically.

### 4 — Set a custom domain (optional)

In your Pages project → **Custom domains** → **Set up a custom domain** → follow the DNS instructions.

### 5 — Enable privacy-friendly analytics (optional)

Analytics use **Cloudflare Web Analytics** (no cookies, no personal data, GDPR-compliant):

1. In the Cloudflare dashboard → **Analytics & Logs** → **Web Analytics** → **Add a site** → copy the **beacon token**.
2. In your Pages project → **Settings** → **Environment variables** → add a **Production** variable:
   | Variable | Value |
   |----------|-------|
   | `PUBLIC_CF_BEACON_TOKEN` | `<your beacon token>` |
3. Re-deploy (trigger a new build or use **Retry deployment**).

The analytics script only renders in the HTML when this variable is set. No token = no script = no tracking.

> **Alternative:** [Plausible Analytics](https://plausible.io) — replace the analytics block in `src/layouts/BaseLayout.astro` with `<script defer data-domain="yourdomain.com" src="https://plausible.io/js/script.js"></script>`.

## Project structure

```
private-file-tools/
├── public/
│   ├── favicon.svg
│   ├── robots.txt
│   └── sitemap.xml
└── src/
    ├── components/
    │   ├── Header.astro        — sticky header + PrivacyBadge
    │   ├── Footer.astro        — /about and /privacy links
    │   ├── PrivacyBadge.astro  — green "nothing is uploaded" badge (size="sm|md")
    │   ├── ToolCard.astro      — icon + title + description card
    │   ├── FaqBlock.astro      — accordion FAQ + schema.org FAQPage JSON-LD
    │   └── FileDropzone.astro  — reusable drag-and-drop / click file selector
    ├── layouts/
    │   └── BaseLayout.astro    — SEO <head>, skip link, analytics, Header/Footer
    ├── lib/
    │   ├── download.ts         — downloadBlob() + downloadAll() helpers
    │   ├── stripMeta.ts        — JPEG EXIF strip (piexifjs) + PNG canvas redraw
    │   └── pdfCompress.ts      — PDF optimize (pdf-lib) + rasterize (pdfjs + pdf-lib)
    ├── pages/
    │   ├── index.astro               — homepage: hero + ToolCards grid
    │   ├── heic-to-jpg.astro         — HEIC → JPG converter
    │   ├── remove-photo-metadata.astro — EXIF/metadata stripper
    │   ├── compress-pdf.astro        — PDF compressor
    │   ├── about.astro
    │   └── privacy.astro
    ├── styles/
    │   └── global.css          — Tailwind entry + accessible focus ring
    └── types/
        ├── heic2any.d.ts
        └── piexifjs.d.ts
```

## Adding a new tool

1. **Create** `src/pages/my-tool.astro`. Import `BaseLayout`, `FileDropzone`, `PrivacyBadge`, `FaqBlock`.

2. **Listen for the file event:**

   ```astro
   <FileDropzone id="my-zone" accept=".ext" multiple />

   <script>
     document.getElementById('my-zone')!.addEventListener('filedropzone:change', async (e) => {
       const { files } = (e as CustomEvent<{ files: File[] }>).detail;
       // process files — all client-side
     });
   </script>
   ```

3. **Use `downloadBlob`** from `src/lib/download.ts` to offer results for download.

4. **Add a `ToolCard`** to `src/pages/index.astro` and cross-links from the other tool pages.

## Known limitations & assumptions

- **Site URL** is hardcoded to `https://privatefiletools.com` in `astro.config.mjs` and `BaseLayout.astro`. Update both when deploying under a different domain.
- **OG image** (`/og-default.png`) is referenced but not included — add a 1200×630 PNG to `public/` to enable social preview cards.
- **heic2any** bundles libheif-js (~1.35 MB uncompressed). Cloudflare's brotli compression brings real transfer to ~350 KB.
- **Tailwind 4 not used** — `@tailwindcss/vite` conflicts with Vite 7 (Astro 6's bundler). Tailwind 3 via PostCSS is fully equivalent for this project's needs.
- **PDF rasterize mode** converts pages to images at 1.5× scale (≈150 DPI). CJK fonts without embedded font data may use system fallback fonts. PDFs that are already fully image-based will not compress much further.
- **piexifjs** only parses JPEG EXIF. PNG metadata is removed by canvas redraw. Metadata in other file types (HEIC, WebP) is not inspected.
