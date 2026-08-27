/**
 * CLIENT-SIDE IMAGE OPTIMISATION
 * ---------------------------------------------------------------------------
 * A modern phone camera produces 8–20 MB frames. Uploading those is slow on a
 * warehouse LTE connection and buys nothing: what matters for reading 6 pt
 * technical text is *resolution on the label*, not megapixels of cardboard.
 *
 * What this does, in order:
 *   1. decodes with EXIF orientation applied (portrait photos stay upright)
 *   2. optionally crops to a region of interest (seam for future
 *      perspective correction — see cropRect / CropRect below)
 *   3. downscales the longest edge to `maxEdge` (default 2200 px — deliberately
 *      generous so small text survives; do not drop below ~1600)
 *   4. encodes JPEG, stepping quality down until the byte budget is met
 *
 * Everything is pure and testable except the browser codecs themselves.
 */

import { appError } from '../errors';

export interface CropRect {
  /** All values are fractions of the source dimensions, 0..1. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreprocessOptions {
  /** Longest edge of the output in pixels. */
  maxEdge: number;
  /** Byte budget for the encoded output. */
  targetBytes: number;
  /** Hard ceiling — exceeding this after all attempts is an error. */
  hardMaxBytes: number;
  /**
   * Optional region of interest. Present so document cropping / perspective
   * correction can be added later without touching call sites: the scanner
   * would compute the quad, convert it to a rect (or, later, a homography) and
   * pass it here.
   */
  crop?: CropRect;
  /** Quality ladder tried in order. */
  qualitySteps?: number[];
  mimeType?: 'image/jpeg' | 'image/webp';
}

export interface ProcessedImage {
  blob: Blob;
  /** Object URL for on-screen preview. Caller must revoke it. */
  previewUrl: string;
  width: number;
  height: number;
  bytes: number;
  mimeType: string;
  /** JPEG quality actually used. */
  quality: number;
  /** Dimensions before downscaling — useful for diagnostics. */
  sourceWidth: number;
  sourceHeight: number;
}

export const DEFAULT_QUALITY_STEPS = [0.88, 0.8, 0.72, 0.62, 0.52];

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

function createCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: AnyCanvas): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = (canvas as HTMLCanvasElement).getContext('2d', { willReadFrequently: false });
  if (!ctx) throw appError('IMAGE_DECODE_FAILED');
  return ctx as CanvasRenderingContext2D;
}

async function canvasToBlob(
  canvas: AnyCanvas,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: mimeType, quality });
  }
  const htmlCanvas = canvas as HTMLCanvasElement;
  return new Promise<Blob>((resolve, reject) => {
    htmlCanvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(appError('IMAGE_DECODE_FAILED'))),
      mimeType,
      quality,
    );
  });
}

/**
 * Decode a Blob into an ImageBitmap with EXIF orientation already applied.
 * Falls back to an <img> element on browsers without the option (older Safari),
 * where the default `image-orientation: from-image` gives the same result.
 */
export async function decodeImage(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      // Safari < 15 rejects the options bag; fall through.
      try {
        return await createImageBitmap(blob);
      } catch {
        /* fall through to <img> */
      }
    }
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(appError('IMAGE_DECODE_FAILED'));
    };
    img.src = url;
  });
}

function sourceSize(source: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  if ('naturalWidth' in source) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

/** Pure geometry: the output size for a given source and longest-edge budget. */
export function scaledSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number; scale: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) {
    return { width, height, scale: 1 };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

/** Pure geometry: clamp a fractional crop rect to sane pixel bounds. */
export function resolveCrop(
  crop: CropRect | undefined,
  width: number,
  height: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (!crop) return { sx: 0, sy: 0, sw: width, sh: height };
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const x = clamp01(crop.x);
  const y = clamp01(crop.y);
  const w = clamp01(crop.width);
  const h = clamp01(crop.height);
  const sw = Math.max(1, Math.round(Math.min(w, 1 - x) * width));
  const sh = Math.max(1, Math.round(Math.min(h, 1 - y) * height));
  return { sx: Math.round(x * width), sy: Math.round(y * height), sw, sh };
}

export async function preprocessImage(
  input: Blob,
  options: PreprocessOptions,
): Promise<ProcessedImage> {
  const mimeType = options.mimeType ?? 'image/jpeg';
  const qualitySteps = options.qualitySteps ?? DEFAULT_QUALITY_STEPS;

  const decoded = await decodeImage(input);
  const { width: srcW, height: srcH } = sourceSize(decoded);
  if (srcW === 0 || srcH === 0) throw appError('IMAGE_DECODE_FAILED');

  const { sx, sy, sw, sh } = resolveCrop(options.crop, srcW, srcH);

  let maxEdge = options.maxEdge;
  let best: { blob: Blob; quality: number; width: number; height: number } | null = null;

  // Two passes: full resolution ladder, then one reduced-resolution ladder.
  for (let pass = 0; pass < 2; pass += 1) {
    const target = scaledSize(sw, sh, maxEdge);
    const canvas = createCanvas(target.width, target.height);
    const ctx = context2d(canvas);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // White matte: JPEG has no alpha and transparent PNG input would go black.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.drawImage(
      decoded as CanvasImageSource,
      sx,
      sy,
      sw,
      sh,
      0,
      0,
      target.width,
      target.height,
    );

    for (const quality of qualitySteps) {
      const blob = await canvasToBlob(canvas, mimeType, quality);
      best = { blob, quality, width: target.width, height: target.height };
      if (blob.size <= options.targetBytes) break;
    }
    if (best && best.blob.size <= options.targetBytes) break;
    maxEdge = Math.round(maxEdge * 0.8);
  }

  if ('close' in decoded && typeof decoded.close === 'function') decoded.close();

  if (!best) throw appError('IMAGE_DECODE_FAILED');
  if (best.blob.size > options.hardMaxBytes) throw appError('IMAGE_TOO_LARGE');

  return {
    blob: best.blob,
    previewUrl: URL.createObjectURL(best.blob),
    width: best.width,
    height: best.height,
    bytes: best.blob.size,
    mimeType,
    quality: best.quality,
    sourceWidth: srcW,
    sourceHeight: srcH,
  };
}

/** Base64 (no data: prefix) — the payload format the Edge Function expects. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Reject obviously wrong uploads before doing any work. */
export function validateImageFile(
  file: File | Blob,
  accepted: readonly string[],
  hardMaxBytes: number,
): void {
  const type = (file.type || '').toLowerCase();
  if (type && !accepted.includes(type)) {
    throw appError('IMAGE_UNSUPPORTED_TYPE');
  }
  // 60 MB is well past any phone photo; refuse before decoding.
  if (file.size > Math.max(hardMaxBytes * 8, 60_000_000)) {
    throw appError('IMAGE_TOO_LARGE');
  }
}
