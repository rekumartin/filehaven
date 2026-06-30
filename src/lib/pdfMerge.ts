/**
 * Merge multiple PDFs into one, 100% in-browser, via pdf-lib.
 * pdf-lib is lazy-loaded on first mergePdfs() call so it does not affect
 * the page's initial load time.
 */

export interface MergeResult {
  bytes: Uint8Array;
  filename: string;
  pageCount: number;
  fileCount: number;
}

export type OnProgress = (message: string) => void;

export async function mergePdfs(
  files: File[],
  filename = 'merged.pdf',
  onProgress?: OnProgress,
): Promise<MergeResult> {
  if (files.length < 2) {
    throw new Error('Select at least two PDF files to merge.');
  }

  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();

  let pageCount = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(`Reading ${i + 1} of ${files.length}: ${file.name}…`);

    let doc: Awaited<ReturnType<typeof PDFDocument.load>>;
    try {
      doc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('encrypt') || msg.toLowerCase().includes('password')) {
        throw new Error(`"${file.name}" is password-protected. Remove the password first, then merge.`);
      }
      throw new Error(`Could not read "${file.name}": ${msg}`);
    }

    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
    pageCount += pages.length;
  }

  onProgress?.('Building merged PDF…');
  const bytes = await merged.save();

  return { bytes, filename, pageCount, fileCount: files.length };
}
