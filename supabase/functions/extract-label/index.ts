/**
 * POST /functions/v1/extract-label
 * ---------------------------------------------------------------------------
 * The only server-side component. It exists so the AI provider key never leaves
 * the server.
 *
 * Request  { imagePath, bucket }            preferred — reads the photo from the
 *                                           private bucket with the service role
 *          { imageBase64, mimeType }        inline fallback when retention is off
 *
 * Response { ok: true,  data, raw, provider, model, durationMs }
 *          { ok: false, code, message }
 *
 * Codes the client maps to actionable messages: RATE_LIMITED, AI_TIMEOUT,
 * AI_INVALID_JSON, IMAGE_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE, NO_LABEL_DETECTED,
 * PROVIDER_NOT_CONFIGURED, AI_PROVIDER_ERROR.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { EXTRACTION_SYSTEM_PROMPT, USER_INSTRUCTION } from '../_shared/prompt.ts';
import { checkRateLimit, clientKey } from '../_shared/rateLimit.ts';
import { ProviderError, resolveProvider } from '../_shared/providers/index.ts';
import {
  RequestError,
  assertImage,
  boundPayload,
  fromBase64,
  looksLikeExtraction,
  parseRequest,
  toBase64,
} from '../_shared/validation.ts';

const AI_TIMEOUT_MS = Number.parseInt(Deno.env.get('AI_TIMEOUT_MS') ?? '', 10) || 75_000;
const DEFAULT_BUCKET = Deno.env.get('SOURCE_IMAGE_BUCKET') ?? 'label-sources';

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== 'POST') {
    return errorResponse(request, 'METHOD_NOT_ALLOWED', 'Use POST.', 405);
  }

  const started = Date.now();

  try {
    const body = await request.json().catch(() => {
      throw new RequestError('BAD_REQUEST', 'The request body must be JSON.');
    });
    const input = parseRequest(body);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const admin =
      supabaseUrl && serviceRoleKey
        ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
        : null;

    // --- rate limiting ------------------------------------------------------
    if (admin) {
      const verdict = await checkRateLimit(admin, clientKey(request));
      if (!verdict.allowed) {
        return errorResponse(
          request,
          'RATE_LIMITED',
          `Too many scans. Try again in a minute (limit ${verdict.limit} per ${Math.round(verdict.windowSeconds / 60)} minutes).`,
          429,
        );
      }
    }

    // --- obtain the image ---------------------------------------------------
    let bytes: Uint8Array;
    if (input.imagePath) {
      if (!admin) {
        throw new RequestError(
          'BAD_REQUEST',
          'imagePath requires the function to have SUPABASE_SERVICE_ROLE_KEY configured.',
          500,
        );
      }
      const bucket = input.bucket ?? DEFAULT_BUCKET;
      const { data, error } = await admin.storage.from(bucket).download(input.imagePath);
      if (error || !data) {
        throw new RequestError('BAD_REQUEST', 'The stored image could not be read.', 404);
      }
      bytes = new Uint8Array(await data.arrayBuffer());
    } else {
      bytes = fromBase64(input.imageBase64 ?? '');
    }

    const mimeType = assertImage(bytes);
    const imageBase64 = toBase64(bytes);

    // --- provider call ------------------------------------------------------
    const provider = resolveProvider();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    let output;
    try {
      output = await provider.extract({
        imageBase64,
        mimeType,
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        userInstruction: USER_INSTRUCTION,
        ...(input.hints ? { hints: input.hints } : {}),
        signal: controller.signal,
      });
    } catch (cause) {
      if (controller.signal.aborted) {
        return errorResponse(request, 'AI_TIMEOUT', 'The analysis service did not answer in time.', 504);
      }
      throw cause;
    } finally {
      clearTimeout(timeout);
    }

    // --- validate + bound ---------------------------------------------------
    if (!looksLikeExtraction(output.data)) {
      return errorResponse(
        request,
        'AI_INVALID_JSON',
        'The analysis service returned data in an unexpected format.',
        502,
      );
    }

    const data = boundPayload(output.data) as Record<string, unknown>;

    if (data.documentType === 'unreadable') {
      return errorResponse(
        request,
        'NO_LABEL_DETECTED',
        'No readable material label was found in the photo.',
        422,
      );
    }

    return jsonResponse(request, {
      ok: true,
      data,
      raw: boundPayload(output.raw),
      provider: provider.id,
      model: output.model,
      durationMs: Date.now() - started,
    });
  } catch (cause) {
    if (cause instanceof RequestError) {
      return errorResponse(request, cause.code, cause.message, cause.status);
    }
    if (cause instanceof ProviderError) {
      return errorResponse(request, cause.code, cause.message, cause.status);
    }
    console.error('extract-label failed', cause);
    return errorResponse(
      request,
      'AI_PROVIDER_ERROR',
      'The document analysis service failed unexpectedly.',
      502,
    );
  }
});
