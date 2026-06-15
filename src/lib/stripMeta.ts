import type { ExifData } from 'piexifjs';

// ── EXIF tag IDs (standard values, not relying on piexifjs runtime constants) ──

const IFD0 = {
  MAKE: 271,
  MODEL: 272,
  SOFTWARE: 305,
  DATETIME: 306,
  ARTIST: 315,
  COPYRIGHT: 33432,
} as const;

const EXIF_SUB = {
  DATE_ORIGINAL: 36867,
  LENS_MODEL: 42036,
} as const;

const GPS = {
  LAT_REF: 1,
  LAT: 2,
  LON_REF: 3,
  LON: 4,
} as const;

// ── Public types ──────────────────────────────────────────────────────────────

export interface GpsCoords {
  lat: number;
  lon: number;
  /** Human-readable string, e.g. "37.77493° N, 122.41942° W" */
  display: string;
}

export interface PhotoMeta {
  make?: string;
  model?: string;
  datetime?: string;
  gps?: GpsCoords;
  software?: string;
  artist?: string;
  copyright?: string;
  lensModel?: string;
  /** True when any metadata field was found */
  hasExif: boolean;
  /** Number of non-empty fields found */
  fieldCount: number;
}

export interface StripResult {
  blob: Blob;
  /** Output filename (same as input) */
  filename: string;
  sizeBefore: number;
  sizeAfter: number;
  meta: PhotoMeta;
  /** True for PNG files — re-rendered through canvas instead of binary strip */
  redrawn: boolean;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

type Rational = [number, number];

function asStr(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/\0/g, '').trim();
  return s || undefined;
}

function dmsToDecimal(dms: Rational[], ref: string): number {
  const [d, m, s] = dms.map(([n, den]) => n / den);
  const dec = d + m / 60 + s / 3600;
  return ref === 'S' || ref === 'W' ? -dec : dec;
}

function readAsBinaryString(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsBinaryString(file);
  });
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = src;
  });
}

function binaryStringToBlob(str: string, mimeType: string): Blob {
  const bytes = Uint8Array.from(str, (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

// ── EXIF parsing ──────────────────────────────────────────────────────────────

function parseExifData(exifData: Partial<ExifData>): PhotoMeta {
  const ifd0 = (exifData['0th'] ?? {}) as Record<number, unknown>;
  const exifSub = (exifData['Exif'] ?? {}) as Record<number, unknown>;
  const gpsData = (exifData['GPS'] ?? {}) as Record<number, unknown>;

  const make = asStr(ifd0[IFD0.MAKE]);
  const model = asStr(ifd0[IFD0.MODEL]);
  const software = asStr(ifd0[IFD0.SOFTWARE]);
  const artist = asStr(ifd0[IFD0.ARTIST]);
  const copyright = asStr(ifd0[IFD0.COPYRIGHT]);
  const lensModel = asStr(exifSub[EXIF_SUB.LENS_MODEL]);
  const datetime =
    asStr(ifd0[IFD0.DATETIME]) ?? asStr(exifSub[EXIF_SUB.DATE_ORIGINAL]);

  let gps: GpsCoords | undefined;
  const latRaw = gpsData[GPS.LAT] as Rational[] | undefined;
  const latRef = gpsData[GPS.LAT_REF] as string | undefined;
  const lonRaw = gpsData[GPS.LON] as Rational[] | undefined;
  const lonRef = gpsData[GPS.LON_REF] as string | undefined;

  if (latRaw?.length && latRef && lonRaw?.length && lonRef) {
    try {
      const lat = dmsToDecimal(latRaw, latRef);
      const lon = dmsToDecimal(lonRaw, lonRef);
      gps = {
        lat,
        lon,
        display: `${Math.abs(lat).toFixed(5)}° ${latRef}, ${Math.abs(lon).toFixed(5)}° ${lonRef}`,
      };
    } catch {
      // malformed rational — skip GPS
    }
  }

  const fields = [make, model, datetime, gps, software, artist, copyright, lensModel];
  const fieldCount = fields.filter(Boolean).length;

  return {
    make,
    model,
    datetime,
    gps,
    software,
    artist,
    copyright,
    lensModel,
    hasExif: fieldCount > 0,
    fieldCount,
  };
}

// ── JPEG path: binary strip (no re-encode, zero quality loss) ─────────────────

async function processJpeg(file: File): Promise<StripResult> {
  // Lazy import — piexifjs only loads when a JPEG is first processed
  const { default: piexif } = await import('piexifjs');

  const binaryStr = await readAsBinaryString(file);

  let meta: PhotoMeta = { hasExif: false, fieldCount: 0 };
  try {
    const exifData = piexif.load(binaryStr);
    meta = parseExifData(exifData);
  } catch {
    // No EXIF segment or parse error — metadata stays empty
  }

  let cleanStr: string;
  try {
    cleanStr = piexif.remove(binaryStr);
  } catch {
    cleanStr = binaryStr;
  }

  const blob = binaryStringToBlob(cleanStr, 'image/jpeg');
  return { blob, filename: file.name, sizeBefore: file.size, sizeAfter: blob.size, meta, redrawn: false };
}

// ── PNG path: canvas redraw (strips all tEXt/iTXt/zTXt metadata chunks) ──────

async function processViaPng(file: File): Promise<StripResult> {
  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/png'),
  );

  return {
    blob,
    filename: file.name,
    sizeBefore: file.size,
    sizeAfter: blob.size,
    meta: { hasExif: false, fieldCount: 0 },
    redrawn: true,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function stripMetadata(file: File): Promise<StripResult> {
  const isJpeg = /\.jpe?g$/i.test(file.name) || file.type === 'image/jpeg';
  if (isJpeg) return processJpeg(file);

  const isPng = /\.png$/i.test(file.name) || file.type === 'image/png';
  if (isPng) return processViaPng(file);

  throw new Error('Unsupported file type — please upload a JPEG or PNG.');
}
