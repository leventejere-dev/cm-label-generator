/**
 * Google Gemini — the no-cost provider.
 *
 * Why it exists: the Gemini API has a genuinely free tier on the Flash models,
 * with image input and no credit card. For a company inside the EEA that also
 * comes with Google's paid-tier data terms (see README §5.4), which is what
 * makes it acceptable for supplier documents at all.
 *
 * Enable with:
 *   AI_PROVIDER=google
 *   GOOGLE_API_KEY=...          (GEMINI_API_KEY is accepted too)
 *   AI_MODEL=gemini-3.5-flash   (optional override)
 *
 * Shape strategy: this provider asks for `application/json` and lets the system
 * prompt carry the contract, exactly like the OpenAI provider. The prompt is
 * generated from the same field catalogue as everything else and already spells
 * out the object shape, so there is no second schema to keep in sync — and no
 * hard failure if Google tightens what its schema dialect accepts.
 */

import { parseModelJson } from '../validation.ts';
import {
  ProviderError,
  type ExtractionInput,
  type ExtractionOutput,
  type LabelExtractionProvider,
} from './types.ts';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.5-flash';

/**
 * Tried in order when the operator did NOT pin a model with AI_MODEL. Model IDs
 * are retired and renamed on Google's schedule, not ours; a warehouse employee
 * cannot act on "model not found", so falling back to an older free-tier model
 * beats going dark. An explicitly configured AI_MODEL is never second-guessed.
 */
const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-3.5-flash-lite'];

export class GoogleProvider implements LabelExtractionProvider {
  readonly id = 'google';
  readonly model: string;
  private readonly candidates: string[];

  constructor(
    private readonly apiKey: string,
    model?: string,
  ) {
    this.model = model || DEFAULT_MODEL;
    this.candidates = model ? [model] : [DEFAULT_MODEL, ...FALLBACK_MODELS];
  }

  async extract(input: ExtractionInput): Promise<ExtractionOutput> {
    let lastError: ProviderError | undefined;

    for (const model of this.candidates) {
      try {
        return await this.extractWith(model, input);
      } catch (error) {
        if (!(error instanceof ProviderError)) throw error;
        // Both of these mean "this model can't serve us right now" — the next
        // free model probably can, so keep going rather than failing the scan.
        if (error.code !== 'MODEL_NOT_FOUND' && error.code !== 'PROVIDER_OVERLOADED') throw error;
        lastError = error;
      }
    }

    // Every candidate was busy: that is a "come back in a minute", not a
    // misconfiguration, and the two need different advice on screen.
    if (lastError?.code === 'PROVIDER_OVERLOADED') {
      throw new ProviderError('PROVIDER_OVERLOADED', 'Every candidate model is overloaded.', 503);
    }
    throw new ProviderError(
      'PROVIDER_NOT_CONFIGURED',
      lastError?.message ?? 'No usable model was found for this API key.',
      502,
    );
  }

  private async extractWith(model: string, input: ExtractionInput): Promise<ExtractionOutput> {
    // First attempt asks for JSON mime type. If a model rejects that field we
    // retry once in plain-text mode; parseModelJson strips code fences anyway.
    let response = await this.call(model, input, true);

    if (response.status === 400) {
      const peek = await response.clone().text().catch(() => '');
      if (/response_?mime_?type|generation_?config/i.test(peek) && !isKeyRejection(peek)) {
        response = await this.call(model, input, false);
      }
    }

    if (!response.ok) {
      throw await toGoogleError(response);
    }

    const payload = (await response.json()) as GeminiResponse;

    if (payload.promptFeedback?.blockReason) {
      throw new ProviderError(
        'AI_PROVIDER_ERROR',
        `The provider refused the image (${payload.promptFeedback.blockReason}).`,
      );
    }

    const candidate = payload.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('')
      .trim();

    if (!text) {
      // An empty answer with MAX_TOKENS means the model spent its budget before
      // emitting the object; anything else is a refusal or an empty candidate.
      if (candidate?.finishReason === 'MAX_TOKENS') {
        throw new ProviderError(
          'AI_INVALID_JSON',
          'The model ran out of output budget before returning the label data.',
        );
      }
      throw new ProviderError('AI_INVALID_JSON', 'The model returned no usable content.');
    }

    return {
      data: parseModelJson(text),
      raw: {
        finishReason: candidate?.finishReason,
        usage: payload.usageMetadata,
        requestedModel: model,
      },
      model: payload.modelVersion ?? model,
    };
  }

  private call(model: string, input: ExtractionInput, jsonMime: boolean): Promise<Response> {
    const body = {
      systemInstruction: { parts: [{ text: input.systemPrompt }] },
      contents: [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: input.mimeType, data: input.imageBase64 } },
            { text: [input.userInstruction, ...(input.hints ?? [])].join('\n\n') },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 8192,
        ...(jsonMime ? { responseMimeType: 'application/json' } : {}),
      },
    };

    return fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Header, not ?key= — the key must never end up in a URL or a log line.
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
      signal: input.signal ?? null,
    });
  }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: unknown;
  modelVersion?: string;
}

/**
 * Gemini answers a bad API key with HTTP 400 INVALID_ARGUMENT, not 401/403.
 * Without this check the single most likely setup mistake — a mistyped or
 * half-pasted key — would surface as a generic "provider error" and send
 * someone hunting through logs instead of re-pasting the key.
 */
function isKeyRejection(body: string): boolean {
  return /API_?KEY_?INVALID|API key not valid|API key expired|PERMISSION_DENIED/i.test(body);
}

function isModelMissing(body: string): boolean {
  return /NOT_FOUND|is not found|not supported for generateContent|does not exist/i.test(body);
}

async function toGoogleError(response: Response): Promise<ProviderError> {
  const text = await response.text().catch(() => '');
  const message = text.slice(0, 400) || response.statusText;

  if (response.status === 429) {
    // The free tier has a per-minute AND a per-day allowance. Telling someone to
    // "wait a minute" when the day's quota is gone would waste their afternoon.
    if (/per\s*day|daily|PerDay|RequestsPerDay/i.test(text)) {
      return new ProviderError(
        'DAILY_QUOTA_EXCEEDED',
        "The provider's free daily allowance is used up.",
        429,
      );
    }
    return new ProviderError('RATE_LIMITED', 'The AI provider is rate limiting requests.', 429);
  }

  if (isKeyRejection(text) || response.status === 401 || response.status === 403) {
    return new ProviderError('PROVIDER_NOT_CONFIGURED', 'The AI provider rejected the API key.', 502);
  }

  // Internal code — caught by extract(), never returned to the browser.
  if (response.status === 404 || isModelMissing(text)) {
    return new ProviderError('MODEL_NOT_FOUND', `The model is unavailable for this key: ${message}`);
  }

  // 503 UNAVAILABLE is the free tier saying the model is busy; 5xx generally is
  // the provider's problem, not the request's, and is worth another model.
  if (response.status >= 500) {
    return new ProviderError('PROVIDER_OVERLOADED', `Provider unavailable (${response.status}).`, 503);
  }

  if (response.status === 400 && /image|inline_?data|mime/i.test(message)) {
    return new ProviderError('UNSUPPORTED_MEDIA_TYPE', 'The provider rejected the image.', 415);
  }

  return new ProviderError('AI_PROVIDER_ERROR', `Provider error ${response.status}: ${message}`);
}
