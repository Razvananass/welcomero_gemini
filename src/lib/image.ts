// Shrinks photos in the browser before they are sent to the AI.
// Phone cameras produce 3-10 MB photos; the AI only needs a clear page, and the server accepts about 4 MB.
// So we scale the longest side down and re-encode as JPEG, trying lower quality until the file is small enough.

export type UploadMime = 'image/png' | 'image/jpeg' | 'image/webp';

/** What the user may pick. Larger originals are shrunk; this only blocks absurd files. */
export const MAX_ORIGINAL_BYTES = 25_000_000;
/** The largest result we send. Must stay below the server limit (about 4.1 MB of image data). */
export const MAX_RESULT_BYTES = 2_500_000;
/** Longest side, in pixels. Enough to read small print on a full A4 page photo. */
export const MAX_SIDE = 2000;
const QUALITIES = [0.85, 0.75, 0.65, 0.55];
const FALLBACK_SIDES = [1600, 1200];

export const ALLOWED_UPLOAD_MIME: ReadonlySet<string> = new Set<UploadMime>(['image/png', 'image/jpeg', 'image/webp']);

/** Scale so the longest side is at most `maxSide`. Never enlarges. Always returns whole pixels of at least 1. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!(longest > 0)) return { width: 1, height: 1 };
  const scale = Math.min(1, maxSide / longest);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Approximate size in bytes of the data inside a data URL (base64). */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const base64 = comma === -1 ? '' : dataUrl.slice(comma + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export type PrepareError = 'type' | 'tooLarge' | 'unreadable';

export interface PreparedImage {
  /** data: URL of the shrunk JPEG, also used as the preview. */
  dataUrl: string;
  /** Base64 part only, as the API expects. */
  base64: string;
  mimeType: 'image/jpeg';
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  // createImageBitmap applies the photo's rotation (EXIF) so portrait photos are not sideways.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // fall through to the <img> route
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/** Validate, shrink and re-encode a picked or photographed image. Throws a PrepareError string on failure. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ALLOWED_UPLOAD_MIME.has(file.type)) throw 'type' satisfies PrepareError;
  if (file.size > MAX_ORIGINAL_BYTES) throw 'tooLarge' satisfies PrepareError;

  let decoded: Awaited<ReturnType<typeof decode>>;
  try {
    decoded = await decode(file);
  } catch {
    throw 'unreadable' satisfies PrepareError;
  }

  try {
    const sides = [MAX_SIDE, ...FALLBACK_SIDES];
    for (const side of sides) {
      const { width, height } = fitWithin(decoded.width, decoded.height, side);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw 'unreadable' satisfies PrepareError;
      // JPEG has no transparency: paint white first so transparent PNG screenshots do not turn black.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(decoded.source, 0, 0, width, height);
      for (const quality of QUALITIES) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrlBytes(dataUrl) <= MAX_RESULT_BYTES) {
          return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: 'image/jpeg' };
        }
      }
    }
    throw 'tooLarge' satisfies PrepareError;
  } finally {
    decoded.release();
  }
}
