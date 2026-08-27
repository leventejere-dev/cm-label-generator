/**
 * PHOTO QUALITY HEURISTICS
 * ---------------------------------------------------------------------------
 * Cheap checks run on the captured frame so the employee is told "this is too
 * dark / looks blurred" *before* spending a few seconds and an AI call on an
 * unreadable photo.
 *
 * These are advisory only — the employee can always analyse anyway. False
 * positives must never block work.
 *
 * Method: downscale to ~320 px, convert to luminance, then
 *   brightness = mean luminance (0..255)
 *   sharpness  = variance of a 3×3 Laplacian (higher = more edge energy)
 * Both metrics are computed on the same downscaled buffer, which makes the
 * thresholds resolution-independent.
 */

export interface QualityReport {
  brightness: number;
  sharpness: number;
  tooDark: boolean;
  tooBright: boolean;
  tooBlurry: boolean;
  /** Short advisory sentences, empty when the photo looks fine. */
  advice: string[];
}

export const QUALITY_THRESHOLDS = {
  darkBelow: 58,
  brightAbove: 235,
  blurryBelow: 55,
  analysisSize: 320,
} as const;

/** Pure: luminance statistics from a greyscale buffer. */
export function analyseLuminance(
  luma: Uint8ClampedArray | number[],
  width: number,
  height: number,
): { brightness: number; sharpness: number } {
  const length = width * height;
  if (length === 0) return { brightness: 0, sharpness: 0 };

  let sum = 0;
  for (let i = 0; i < length; i += 1) sum += luma[i] ?? 0;
  const brightness = sum / length;

  // 3×3 Laplacian, variance of the response.
  let lapSum = 0;
  let lapSquares = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const value =
        4 * (luma[i] ?? 0) -
        (luma[i - 1] ?? 0) -
        (luma[i + 1] ?? 0) -
        (luma[i - width] ?? 0) -
        (luma[i + width] ?? 0);
      lapSum += value;
      lapSquares += value * value;
      count += 1;
    }
  }
  if (count === 0) return { brightness, sharpness: 0 };
  const mean = lapSum / count;
  const variance = lapSquares / count - mean * mean;
  return { brightness, sharpness: Math.max(0, variance) };
}

export function gradeQuality(brightness: number, sharpness: number): QualityReport {
  const tooDark = brightness < QUALITY_THRESHOLDS.darkBelow;
  const tooBright = brightness > QUALITY_THRESHOLDS.brightAbove;
  const tooBlurry = sharpness < QUALITY_THRESHOLDS.blurryBelow;

  const advice: string[] = [];
  if (tooDark) advice.push('The photo looks dark. Use the flash or move to better light.');
  if (tooBright) advice.push('The photo looks washed out. Avoid direct glare on the label.');
  if (tooBlurry) advice.push('The photo looks blurred. Hold still and let the camera focus on the text.');

  return { brightness, sharpness, tooDark, tooBright, tooBlurry, advice };
}

/** Browser entry point: measure a decoded image. Never throws. */
export async function assessImageQuality(
  source: ImageBitmap | HTMLImageElement | HTMLCanvasElement,
): Promise<QualityReport> {
  try {
    const srcW = 'naturalWidth' in source ? source.naturalWidth : source.width;
    const srcH = 'naturalHeight' in source ? source.naturalHeight : source.height;
    if (!srcW || !srcH) return gradeQuality(128, 999);

    const scale = QUALITY_THRESHOLDS.analysisSize / Math.max(srcW, srcH);
    const width = Math.max(8, Math.round(srcW * Math.min(1, scale)));
    const height = Math.max(8, Math.round(srcH * Math.min(1, scale)));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return gradeQuality(128, 999);
    ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);

    const luma = new Uint8ClampedArray(width * height);
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      luma[p] = 0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0);
    }
    const { brightness, sharpness } = analyseLuminance(luma, width, height);
    return gradeQuality(brightness, sharpness);
  } catch {
    // Quality checks must never break the capture flow.
    return gradeQuality(128, 999);
  }
}
