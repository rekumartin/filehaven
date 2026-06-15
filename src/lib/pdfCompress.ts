/**
 * PDF compression — two modes, 100% in-browser.
 *
 * Call setPdfWorkerSrc(url) once at app startup before compressing:
 *   import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
 *   setPdfWorkerSrc(workerUrl);
 *
 * pdfjs-dist and pdf-lib are lazy-loaded on first compressPdf() call so
 * they do not affect the page's initial load time.
 */

// Type-only imports — zero runtime cost, erased by TypeScript
import type { PDFDocumentProxy } from 'pdfjs-dist';

// ── Public types ──────────────────────────────────────────────────────────────

export type CompressMode = 'optimize' | 'rasterize';

export interface CompressOptions {
  mode: CompressMode;
  /** Maximum acceptable output size in bytes */
  targetBytes: number;
}

export interface CompressResult {
  bytes: Uint8Array;
  filename: string;
  originalSize: number;
  finalSize: number;
  pageCount: number;
  mode: CompressMode;
  /** True when finalSize <= targetBytes */
  hitTarget: boolean;
  /** JPEG quality used (rasterize mode only, 1–100) */
  finalQuality?: number;
}

export type OnProgress = (message: string) => void;

// ── Worker URL ────────────────────────────────────────────────────────────────

let _workerSrc: string | null = null;

/** Register the pdfjs worker URL. Call this once before any compressPdf() call. */
export function setPdfWorkerSrc(src: string): void {
  _workerSrc = src;
}

// ── Internal type aliases (use pdfjs type info at compile time only) ──────────

type PdfDoc = PDFDocumentProxy;
type PdfPage = Awaited<ReturnType<PdfDoc['getPage']>>;

interface RenderedPage {
  canvas: HTMLCanvasElement;
  pdfWidth: number;
  pdfHeight: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function canvasToJpegBytes(canvas: HTMLCanvasElement, quality: number): Uint8Array {
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function renderPage(page: PdfPage, scale: number): Promise<RenderedPage> {
  const vpBase = page.getViewport({ scale: 1 });
  const vpRender = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vpRender.width);
  canvas.height = Math.round(vpRender.height);
  const ctx = canvas.getContext('2d')!;

  await page.render({ canvasContext: ctx, viewport: vpRender }).promise;

  return { canvas, pdfWidth: vpBase.width, pdfHeight: vpBase.height };
}

function pickStartQuality(originalBytes: number, targetBytes: number): number {
  const ratio = targetBytes / originalBytes;
  if (ratio >= 0.75) return 0.82;
  if (ratio >= 0.50) return 0.72;
  if (ratio >= 0.30) return 0.58;
  if (ratio >= 0.15) return 0.44;
  return 0.30;
}

// ── Rasterize mode ─────────────────────────────────────────────────────────────

async function rasterize(
  data: ArrayBuffer,
  opts: CompressOptions,
  onProgress?: OnProgress,
): Promise<CompressResult & { mode: 'rasterize' }> {
  // Lazy-load pdfjs-dist and pdf-lib — only downloaded when first used
  const [pdfjsLib, { PDFDocument }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdf-lib'),
  ]);

  if (_workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = _workerSrc;

  const pdfjsDoc = await pdfjsLib.getDocument({ data }).promise;
  const pageCount = pdfjsDoc.numPages;
  const scale = pageCount > 25 ? 1.2 : 1.5;

  // Render all pages once — re-encoding is cheap; re-rendering is expensive
  const pages: RenderedPage[] = [];
  for (let i = 1; i <= pageCount; i++) {
    onProgress?.(`Rendering page ${i} of ${pageCount}…`);
    const page = await pdfjsDoc.getPage(i);
    pages.push(await renderPage(page as PdfPage, scale));
  }

  let quality = pickStartQuality(data.byteLength, opts.targetBytes);
  let bestBytes: Uint8Array | null = null;
  let finalQuality = quality;

  for (let attempt = 0; attempt < 7; attempt++) {
    onProgress?.(`Building PDF at ${Math.round(quality * 100)}% quality…`);

    const pdfDoc = await PDFDocument.create();
    for (const { canvas, pdfWidth, pdfHeight } of pages) {
      const jpegBytes = canvasToJpegBytes(canvas, quality);
      const img = await pdfDoc.embedJpg(jpegBytes);
      const p = pdfDoc.addPage([pdfWidth, pdfHeight]);
      p.drawImage(img, { x: 0, y: 0, width: pdfWidth, height: pdfHeight });
    }

    const resultBytes = await pdfDoc.save();
    bestBytes = resultBytes;
    finalQuality = quality;

    if (resultBytes.byteLength <= opts.targetBytes || quality <= 0.25) break;
    quality = Math.max(0.25, quality - 0.12);
  }

  const finalBytes = bestBytes!;
  return {
    bytes: finalBytes,
    filename: '',
    originalSize: data.byteLength,
    finalSize: finalBytes.byteLength,
    pageCount,
    mode: 'rasterize',
    hitTarget: finalBytes.byteLength <= opts.targetBytes,
    finalQuality: Math.round(finalQuality * 100),
  };
}

// ── Optimize mode ──────────────────────────────────────────────────────────────

async function optimize(
  data: ArrayBuffer,
  opts: CompressOptions,
  onProgress?: OnProgress,
): Promise<CompressResult & { mode: 'optimize' }> {
  onProgress?.('Loading PDF…');

  const { PDFDocument } = await import('pdf-lib');

  let pdfDoc: Awaited<ReturnType<typeof PDFDocument.load>>;
  try {
    pdfDoc = await PDFDocument.load(data, { updateMetadata: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('encrypt') || msg.toLowerCase().includes('password')) {
      throw new Error(
        'This PDF is password-protected. Please remove the password first, then compress it here.',
      );
    }
    throw new Error(`Could not read PDF: ${msg}`);
  }

  onProgress?.('Optimising PDF structure…');
  const resultBytes = await pdfDoc.save({ useObjectStreams: true });

  return {
    bytes: resultBytes,
    filename: '',
    originalSize: data.byteLength,
    finalSize: resultBytes.byteLength,
    pageCount: pdfDoc.getPageCount(),
    mode: 'optimize',
    hitTarget: resultBytes.byteLength <= opts.targetBytes,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function compressPdf(
  file: File,
  opts: CompressOptions,
  onProgress?: OnProgress,
): Promise<CompressResult> {
  const data = await file.arrayBuffer();
  const result =
    opts.mode === 'rasterize'
      ? await rasterize(data, opts, onProgress)
      : await optimize(data, opts, onProgress);

  const base = file.name.replace(/\.pdf$/i, '');
  result.filename = `${base}-compressed.pdf`;
  return result;
}
