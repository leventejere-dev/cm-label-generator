/**
 * CORS for the extraction endpoint.
 *
 * ALLOWED_ORIGINS (a comma-separated Edge Function secret) restricts which
 * sites may call the function, e.g.
 *   supabase secrets set ALLOWED_ORIGINS="https://acme.github.io,http://localhost:5173"
 * Leaving it unset allows any origin, which is convenient while developing but
 * should be tightened before the URL is shared widely.
 */

const FALLBACK_ORIGIN = '*';

function allowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS') ?? '';
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function resolveOrigin(request: Request): string {
  const origin = request.headers.get('origin');
  const allowed = allowedOrigins();
  if (allowed.length === 0) return FALLBACK_ORIGIN;
  if (origin && allowed.includes(origin)) return origin;
  return allowed[0] ?? FALLBACK_ORIGIN;
}

export function corsHeaders(request: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(request),
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-cm-app-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  });
}

export function errorResponse(
  request: Request,
  code: string,
  message: string,
  status = 400,
): Response {
  return jsonResponse(request, { ok: false, code, message }, status);
}
