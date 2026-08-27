/**
 * Typed, validated access to build-time configuration.
 *
 * Every value here is PUBLIC — Vite inlines VITE_* variables into the bundle.
 * Secrets (AI provider keys, Supabase service_role key) must never be read here;
 * they belong in Supabase Edge Function secrets.
 */

function str(value: string | undefined, fallback = ''): string {
  return (value ?? '').trim() || fallback;
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(str(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  const raw = str(value).toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return fallback;
}

const supabaseUrl = str(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = str(import.meta.env.VITE_SUPABASE_ANON_KEY);

/** True when both public Supabase credentials are present and plausible. */
const supabaseConfigured =
  supabaseUrl.startsWith('http') && supabaseAnonKey.length > 20;

/**
 * Mock mode resolution:
 *   "true"  -> always mock (local fixtures, no network)
 *   "false" -> always live. If Supabase is missing the app raises a clear
 *              error rather than silently serving fixture data — printing
 *              invented material data on a warehouse label would be worse
 *              than failing.
 *   "auto"  -> mock only when Supabase is not configured  (default)
 */
function resolveMockMode(): boolean {
  const raw = str(import.meta.env.VITE_MOCK_MODE, 'auto').toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return !supabaseConfigured;
}

/**
 * Where finished labels are kept.
 *   "supabase" -> Postgres + private Storage bucket (shared across devices)
 *   "local"    -> this device only (localStorage + IndexedDB). Nothing is
 *                 uploaded anywhere; the photo is sent to the extraction
 *                 service for the single call and never stored.
 *   "auto"     -> supabase when configured, else local  (default)
 */
export type PersistenceMode = 'supabase' | 'local';

function resolvePersistence(): PersistenceMode {
  const raw = str(import.meta.env.VITE_PERSISTENCE, 'auto').toLowerCase();
  if (raw === 'local' || raw === 'none') return 'local';
  if (raw === 'supabase') return 'supabase';
  return supabaseConfigured ? 'supabase' : 'local';
}

export const env = {
  appVersion: str(import.meta.env.VITE_APP_VERSION, '0.1.0-dev'),
  basePath: import.meta.env.BASE_URL,

  supabase: {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    configured: supabaseConfigured,
    extractFunctionName: str(import.meta.env.VITE_EXTRACT_FUNCTION_NAME, 'extract-label'),
    sourceImageBucket: str(import.meta.env.VITE_SOURCE_IMAGE_BUCKET, 'label-sources'),
  },

  /** When true the app runs entirely from local fixtures + localStorage. */
  mockMode: resolveMockMode(),

  /**
   * Storage target for finished labels. Independent of mockMode, so the app can
   * use the real extraction service while keeping every label on the device.
   */
  persistence: resolvePersistence(),

  image: {
    /** Longest edge in px after downscaling. Keeps small technical text legible. */
    maxEdge: int(import.meta.env.VITE_IMAGE_MAX_EDGE, 2200),
    /** Upload budget in bytes; JPEG quality is stepped down to reach it. */
    targetBytes: int(import.meta.env.VITE_IMAGE_TARGET_BYTES, 2_200_000),
    /** Hard ceiling accepted by the Edge Function (must match its own limit). */
    hardMaxBytes: 8_000_000,
    acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  },

  storage: {
    retainSourceImage: bool(import.meta.env.VITE_RETAIN_SOURCE_IMAGE, true),
  },
} as const;

export type AppEnv = typeof env;
