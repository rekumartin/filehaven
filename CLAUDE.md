# CLAUDE.md — filehaven

## Core rule
**Every file a user gives is processed 100% in the browser. Nothing is ever uploaded to any server. There is no backend.**

## Stack
| Layer | Technology |
|-------|-----------|
| Framework | Astro 6 (static output) |
| Styling | Tailwind CSS 3 — PostCSS plugin; config in `tailwind.config.cjs` |
| Language | TypeScript strict mode |
| Bundler | Vite 7 (via Astro) + PostCSS |
| Hosting | Cloudflare Pages |

### Tailwind note
Using Tailwind 3 via PostCSS (`postcss.config.cjs`). `astro.config.mjs` has no Tailwind plugin — Vite picks up PostCSS automatically. Custom utilities go in `tailwind.config.cjs` under `theme.extend`. CSS entry point is `src/styles/global.css` with the classic `@tailwind base/components/utilities` directives.

## Directory layout
```
src/
  components/    — Astro components (all reusable)
  layouts/       — BaseLayout.astro (SEO <head> + Header + Footer)
  lib/           — Pure TypeScript utilities (download.ts)
  pages/         — One file per route
  styles/        — global.css (Tailwind entry point)
  types/         — Manual .d.ts files (e.g. heic2any)
```

## Adding a new tool

1. Create `src/pages/my-tool.astro`:
   - Import `BaseLayout`, `FileDropzone`, `PrivacyBadge`, `FaqBlock`
   - Drop in `<FileDropzone id="my-dropzone" accept="..." multiple />`
   - Add a `<script>` block that listens for `filedropzone:change` on the dropzone element
   - Use `downloadBlob` / `downloadAll` from `src/lib/download.ts`

2. Add a `ToolCard` entry to `src/pages/index.astro`

### FileDropzone contract
```ts
// The dropzone element dispatches this custom event when files are selected
dropzone.addEventListener('filedropzone:change', (e: CustomEvent<{ files: File[] }>) => {
  const { files } = e.detail;
  // process files here — all browser-side
});
```

## TypeScript
Strict mode is on. All scripts inside `<script>` blocks in `.astro` files are TypeScript.
Browser-only libraries (heic2any, etc.) must only be imported inside `<script>` blocks,
never in the `---` frontmatter.
