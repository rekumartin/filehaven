/**
 * Triggers a browser download of `blob` with the given `filename`.
 * The object URL is revoked after a short delay to allow the download to start.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Downloads multiple blobs sequentially with a small delay between each.
 * Some browsers block rapid-fire downloads without a delay.
 */
export async function downloadAll(
  items: { blob: Blob; filename: string }[],
  delayMs = 200,
): Promise<void> {
  for (const item of items) {
    downloadBlob(item.blob, item.filename);
    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
