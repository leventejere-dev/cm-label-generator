/**
 * Sliding-window rate limiting.
 *
 * Backed by public.extraction_rate_events, written with the service role, so it
 * works across the many isolates an Edge Function runs in. Fails OPEN: if the
 * database is unreachable the scan still goes through — a warehouse employee
 * must never be blocked by our own bookkeeping.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const TABLE = 'extraction_rate_events';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  windowSeconds: number;
}

function intEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(Deno.env.get(name) ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** A stable-enough caller identity: the forwarded client IP. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const first = forwarded.split(',')[0]?.trim();
  return (first || request.headers.get('cf-connecting-ip') || 'unknown').slice(0, 64);
}

export async function checkRateLimit(
  admin: SupabaseClient,
  key: string,
): Promise<RateLimitResult> {
  const limit = intEnv('RATE_LIMIT_MAX', 40);
  const windowSeconds = intEnv('RATE_LIMIT_WINDOW_SECONDS', 300);
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

  try {
    const { count, error } = await admin
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('client_key', key)
      .gte('created_at', since);

    if (error) return { allowed: true, remaining: limit, limit, windowSeconds };

    const used = count ?? 0;
    if (used >= limit) {
      return { allowed: false, remaining: 0, limit, windowSeconds };
    }

    await admin.from(TABLE).insert({ client_key: key });

    // Opportunistic cleanup so the table cannot grow without bound.
    if (Math.random() < 0.05) {
      const cutoff = new Date(Date.now() - 3600 * 1000).toISOString();
      await admin.from(TABLE).delete().lt('created_at', cutoff);
    }

    return { allowed: true, remaining: Math.max(0, limit - used - 1), limit, windowSeconds };
  } catch {
    return { allowed: true, remaining: limit, limit, windowSeconds };
  }
}
