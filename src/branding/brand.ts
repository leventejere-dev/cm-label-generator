/**
 * ---------------------------------------------------------------------------
 * COLOR METAL BRANDING — SINGLE SOURCE OF TRUTH
 * ---------------------------------------------------------------------------
 * Palette and logo were taken from the official Color Metal lockup
 * ("COLOR METAL® — Partner in Engineering"): gold #BFA060 for COLOR, neutral
 * grey #939393 for METAL. Everything brand-related lives in this one file.
 *
 * TO UPDATE THE BRAND:
 *   • logo   — replace `public/branding/cm-logo.png` (wordmark, used in the app
 *              header, the A4 label and the PDF export). PNG or JPEG keeps the
 *              PDF export able to embed it; SVG works everywhere except the PDF.
 *              `VITE_CM_LOGO_URL` overrides the path.
 *   • colour — edit `palette` below. The values are mirrored into CSS custom
 *              properties at boot, so stylesheets and the PDF renderer can never
 *              drift apart.
 *
 * The printed label is intentionally near-monochrome with a single gold accent
 * rule: it must come out identical on any office laser printer, including one
 * with no colour toner.
 * ---------------------------------------------------------------------------
 */

export const palette = {
  /** COLOR — the gold of the wordmark. Accent rules, chips, active states. */
  brandGold: '#BFA060',
  brandGoldDeep: '#9C8049',
  brandGoldSoft: '#F6F0E4',

  /** METAL — the neutral grey of the wordmark. */
  brandGrey: '#939393',

  /** Dark neutral used for primary buttons and header rules. */
  brandPrimary: '#3A3A3C',
  brandPrimaryDeep: '#2A2A2C',
  brandPrimarySoft: '#4E4E51',

  /** Accent alias — what the UI actually references. */
  brandAccent: '#BFA060',
  brandAccentSoft: '#F6F0E4',

  /** Neutral industrial surfaces. */
  ink: '#2E2E30',
  inkMuted: '#6E6F71',
  inkFaint: '#98999B',
  surface: '#FFFFFF',
  surfaceSunken: '#F6F6F5',
  surfaceRaised: '#FFFFFF',
  border: '#E1E0DD',
  borderStrong: '#C2C1BD',

  /** Signal colours for confidence + validation states. */
  ok: '#1F6B4B',
  okSoft: '#E8F1ED',
  warn: '#8A6212',
  warnSoft: '#FAF2E2',
  danger: '#A6231B',
  dangerSoft: '#FBE9E7',
} as const;

export type PaletteKey = keyof typeof palette;

/** Company strings printed on the generated label. */
export const company = {
  name: 'COLOR METAL',
  tagline: 'PARTNER IN ENGINEERING',
  productLine: 'ALUMINUM · COPPER · BRASS · BRONZE SEMI-FINISHED PRODUCTS',
  legalLine: import.meta.env.VITE_CM_COMPANY_LINE || 'SC COLOR-METAL SRL',
  generator: 'Generator Etichete CM',
} as const;

/**
 * Resolved URL of the logo asset.
 * `import.meta.env.BASE_URL` keeps this correct under a GitHub Pages sub-path.
 */
export function logoUrl(): string {
  const override = import.meta.env.VITE_CM_LOGO_URL;
  if (override && override.trim().length > 0) return override.trim();
  return `${import.meta.env.BASE_URL}branding/cm-logo.png`;
}

/**
 * Mirror the palette into CSS custom properties so stylesheets and the
 * TypeScript PDF renderer can never drift apart. Called once from main.tsx.
 */
export function applyBrandTokens(root: HTMLElement = document.documentElement): void {
  for (const [key, value] of Object.entries(palette)) {
    root.style.setProperty(`--cm-${kebab(key)}`, value);
  }
}

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** Hex -> {r,g,b} in 0..1, the form pdf-lib wants. */
export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const int = Number.parseInt(full, 16);
  return {
    r: ((int >> 16) & 255) / 255,
    g: ((int >> 8) & 255) / 255,
    b: (int & 255) / 255,
  };
}
