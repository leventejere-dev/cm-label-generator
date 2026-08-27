/**
 * SUPABASE EDGE FUNCTION PROVIDER
 * ---------------------------------------------------------------------------
 * Posts the photographed label to the `extract-label` Edge Function, which
 * holds the AI credentials and does the vendor call server-side.
 *
 * Two transport modes:
 *   • imagePath  — the photo is already in the private Storage bucket; the
 *                  function downloads it with its service-role key. Preferred:
 *                  the bytes cross the network once.
 *   • base64     — inline fallback when retention is switched off.
 */

import { env } from '../../config/env';
import { parseExtraction } from '../../domain/extraction';
import { appError, errorCodeForWarning } from '../../lib/errors';
import { blobToBase64 } from '../../lib/image/preprocess';
import { getSupabase } from '../../lib/supabase';
import type { ExtractionRequest, ExtractionResponse, LabelExtractionProvider } from './provider';

const CLIENT_TIMEOUT_MS = 90_000;

interface EdgeSuccess {
  ok: true;
  data: unknown;
  raw: unknown;
  provider: string;
  model: string;
  durationMs: number;
}

interface EdgeFailure {
  ok: false;
  code?: string;
  message?: string;
}

export class EdgeFunctionExtractionProvider implements LabelExtractionProvider {
  readonly id = 'supabase-edge';

  async extract(request: ExtractionRequest, signal?: AbortSignal): Promise<ExtractionResponse> {
    const body: Record<string, unknown> = {
      bucket: env.supabase.sourceImageBucket,
      appVersion: env.appVersion,
    };

    if (request.imagePath) {
      body.imagePath = request.imagePath;
    } else {
      body.imageBase64 = await blobToBase64(request.image);
      body.mimeType = request.image.type || 'image/jpeg';
    }
    if (request.hints?.length) body.hints = request.hints;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    signal?.addEventListener('abort', () => controller.abort(), { once: true });

    const started = Date.now();
    let payload: EdgeSuccess | EdgeFailure;
    try {
      const { data, error } = await getSupabase().functions.invoke(
        env.supabase.extractFunctionName,
        { body },
      );
      if (error) {
        // supabase-js wraps non-2xx responses; try to read the structured body.
        const parsed = await readFunctionError(error);
        throw mapFailure(parsed);
      }
      payload = data as EdgeSuccess | EdgeFailure;
    } catch (cause) {
      if (controller.signal.aborted && !signal?.aborted) throw appError('AI_TIMEOUT', { cause });
      if (cause instanceof TypeError) throw appError('NETWORK_FAILURE', { cause });
      throw cause;
    } finally {
      clearTimeout(timeout);
    }

    if (!payload || payload.ok !== true) {
      throw mapFailure(payload as EdgeFailure);
    }

    const outcome = parseExtraction(payload.data);
    if (!outcome.ok) {
      throw appError('AI_INVALID_JSON', { cause: outcome.fatalError });
    }

    // Promote blocking model warnings into actionable errors.
    for (const warning of outcome.result.warnings) {
      if (warning.severity !== 'error') continue;
      const code = errorCodeForWarning(warning.code);
      if (code) throw appError(code, { detail: warning.message });
    }
    if (outcome.result.documentType === 'unreadable') {
      throw appError('NO_LABEL_DETECTED');
    }

    return {
      result: outcome.result,
      raw: payload.raw ?? payload.data,
      provider: payload.provider ?? 'unknown',
      model: payload.model ?? 'unknown',
      durationMs: payload.durationMs ?? Date.now() - started,
    };
  }
}

async function readFunctionError(error: unknown): Promise<EdgeFailure> {
  const context = (error as { context?: unknown }).context;
  if (context && typeof (context as Response).json === 'function') {
    try {
      return (await (context as Response).json()) as EdgeFailure;
    } catch {
      /* body was not JSON */
    }
  }
  const message = (error as { message?: string }).message;
  return { ok: false, message };
}

function mapFailure(failure: EdgeFailure | null | undefined) {
  const code = failure?.code ?? '';
  switch (code) {
    case 'RATE_LIMITED':
      return appError('AI_RATE_LIMITED');
    case 'AI_TIMEOUT':
      return appError('AI_TIMEOUT');
    case 'AI_INVALID_JSON':
      return appError('AI_INVALID_JSON');
    case 'IMAGE_TOO_LARGE':
      return appError('IMAGE_TOO_LARGE');
    case 'UNSUPPORTED_MEDIA_TYPE':
      return appError('IMAGE_UNSUPPORTED_TYPE');
    case 'NO_LABEL_DETECTED':
      return appError('NO_LABEL_DETECTED');
    case 'PROVIDER_NOT_CONFIGURED':
      return appError('NOT_CONFIGURED', {
        title: 'Label reading is not switched on yet',
        detail:
          'The app is installed and working, but the image-reading service still has to be activated by whoever administers it. Nothing you did is wrong — please pass this message on and try again afterwards.',
      });
    default:
      return appError('AI_PROVIDER_ERROR', {
        detail: failure?.message
          ? `The document analysis service returned an error: ${failure.message}`
          : undefined,
      });
  }
}
