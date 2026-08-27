import { describe, expect, it } from 'vitest';
import { resolveCrop, scaledSize } from '../preprocess';
import { analyseLuminance, gradeQuality, QUALITY_THRESHOLDS } from '../quality';

describe('downscaling geometry', () => {
  it('leaves small images untouched', () => {
    expect(scaledSize(1200, 900, 2200)).toEqual({ width: 1200, height: 900, scale: 1 });
  });

  it('scales a 12 MP phone photo to the longest-edge budget', () => {
    const result = scaledSize(4032, 3024, 2200);
    expect(result.width).toBe(2200);
    expect(result.height).toBe(1650);
    expect(result.width / result.height).toBeCloseTo(4032 / 3024, 3);
  });

  it('handles portrait orientation', () => {
    const result = scaledSize(3024, 4032, 2200);
    expect(result.height).toBe(2200);
    expect(result.width).toBe(1650);
  });

  it('keeps enough resolution for small technical text', () => {
    // 2200 px across an A4 label is ~265 dpi — comfortably above OCR minimums.
    const { width } = scaledSize(4032, 3024, 2200);
    expect(width / (210 / 25.4)).toBeGreaterThan(200);
  });
});

describe('crop resolution (seam for future perspective correction)', () => {
  it('returns the full frame when no crop is given', () => {
    expect(resolveCrop(undefined, 1000, 800)).toEqual({ sx: 0, sy: 0, sw: 1000, sh: 800 });
  });

  it('converts fractional crops into pixels', () => {
    expect(resolveCrop({ x: 0.1, y: 0.2, width: 0.5, height: 0.5 }, 1000, 800)).toEqual({
      sx: 100,
      sy: 160,
      sw: 500,
      sh: 400,
    });
  });

  it('clamps crops that run past the edge', () => {
    const crop = resolveCrop({ x: 0.8, y: 0.9, width: 0.5, height: 0.5 }, 1000, 800);
    expect(crop.sx + crop.sw).toBeLessThanOrEqual(1000);
    expect(crop.sy + crop.sh).toBeLessThanOrEqual(800);
  });

  it('ignores nonsense values instead of producing a zero-size canvas', () => {
    const crop = resolveCrop({ x: -1, y: 2, width: -5, height: 99 }, 1000, 800);
    expect(crop.sw).toBeGreaterThan(0);
    expect(crop.sh).toBeGreaterThan(0);
  });
});

describe('photo quality heuristics', () => {
  const size = 32;

  function flat(value: number): Uint8ClampedArray {
    return new Uint8ClampedArray(size * size).fill(value);
  }

  function checkerboard(): Uint8ClampedArray {
    const buffer = new Uint8ClampedArray(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        buffer[y * size + x] = (x + y) % 2 === 0 ? 20 : 235;
      }
    }
    return buffer;
  }

  it('flags a dark photo', () => {
    const { brightness, sharpness } = analyseLuminance(flat(20), size, size);
    const report = gradeQuality(brightness, sharpness);
    expect(report.tooDark).toBe(true);
    // By code, not by wording: the sentence is UI copy and is rewritten
    // whenever the interface language or phrasing changes.
    expect(report.advice.map((a) => a.code)).toContain('DARK');
  });

  it('flags a blurred, featureless photo', () => {
    const { brightness, sharpness } = analyseLuminance(flat(128), size, size);
    expect(sharpness).toBeLessThan(QUALITY_THRESHOLDS.blurryBelow);
    expect(gradeQuality(brightness, sharpness).tooBlurry).toBe(true);
  });

  it('accepts a sharp, well-exposed photo', () => {
    const { brightness, sharpness } = analyseLuminance(checkerboard(), size, size);
    const report = gradeQuality(brightness, sharpness);
    expect(report.tooBlurry).toBe(false);
    expect(report.tooDark).toBe(false);
    expect(report.advice).toHaveLength(0);
  });

  it('flags a washed-out photo', () => {
    const { brightness, sharpness } = analyseLuminance(flat(250), size, size);
    expect(gradeQuality(brightness, sharpness).tooBright).toBe(true);
  });

  it('never throws on degenerate input', () => {
    expect(() => analyseLuminance(new Uint8ClampedArray(0), 0, 0)).not.toThrow();
    expect(analyseLuminance(new Uint8ClampedArray(0), 0, 0)).toEqual({ brightness: 0, sharpness: 0 });
  });
});
