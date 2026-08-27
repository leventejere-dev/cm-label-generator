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

/**
 * Stop starting new attempts once this much of the call has already gone. The
 * caller aborts the whole thing at AI_TIMEOUT_MS (75s by default); leaving room
 * means a busy provider is reported as busy instead of as a timeout.
 */
const FALLBACK_DEADLINE_MS = 35_000;

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
    const startedAt = Date.now();

    for (const model of this.candidates) {
      // Falling back is only worth it if the answer can still arrive in time.
      // Without this the chain quietly spends the caller's whole timeout and
      // the person is left watching a spinner for over a minute — which is a
      // worse outcome than being told early that the service is busy.
      if (lastError && Date.now() - startedAt > FALLBACK_DEADLINE_MS) break;

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
    // Ask for everything we want, then drop exactly the field the model names
    // in its complaint. Google moves these knobs between model generations, so
    // a scan must never fail over a config field nobody reads — but giving up a
    // field it did not object to would waste a whole round trip.
    const variant: CallVariant = { jsonMime: true, thinking: true };
    let response = await this.call(model, input, variant);

    // At most one concession per field, hence the bounded loop.
    for (let attempt = 0; attempt < 2 && response.status === 400; attempt += 1) {
      const peek = await response.clone().text().catch(() => '');
      if (isKeyRejection(peek) || isModelMissing(peek)) break;

      const before = { ...variant };
      if (variant.thinking && /thinking/i.test(peek)) variant.thinking = false;
      else if (variant.jsonMime && /response_?mime_?type|response_?schema/i.test(peek)) variant.jsonMime = false;
      else if (/generation_?config/i.test(peek)) {
        // The config was refused without naming a field: give up both.
        variant.thinking = false;
        variant.jsonMime = false;
      }

      if (variant.thinking === before.thinking && variant.jsonMime === before.jsonMime) break;
      response = await this.call(model, input, variant);
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

  private call(model: string, input: ExtractionInput, variant: CallVariant): Promise<Response> {
    const thinking = variant.thinking ? thinkingConfigFor(model) : undefined;
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
        ...(variant.jsonMime ? { responseMimeType: 'application/json' } : {}),
        ...(thinking ? { thinkingConfig: thinking } : {}),
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

interface CallVariant {
  jsonMime: boolean;
  thinking: boolean;
}

/**
 * Reading a printed label is transcription, not reasoning — the model thinking
 * about it at length costs the person holding the phone real seconds and buys
 * nothing. The knob differs by model generation and sending the wrong one is a
 * 400, so choose by family and let extractWith() drop it if it is refused.
 */
function thinkingConfigFor(model: string): Record<string, unknown> | undefined {
  if (/^gemini-3/i.test(model)) return { thinkingLevel: 'minimal' };
  if (/^gemini-2\.5/i.test(model)) return { thinkingBudget: 0 };
  return undefined;
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
