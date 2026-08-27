/**
 * OpenAI — the drop-in alternative.
 * Enable with:  supabase secrets set AI_PROVIDER=openai OPENAI_API_KEY=sk-...
 */

import { parseModelJson } from '../validation.ts';
import { ProviderError, type ExtractionInput, type ExtractionOutput, type LabelExtractionProvider } from './types.ts';

const API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4.1';

export class OpenAIProvider implements LabelExtractionProvider {
  readonly id = 'openai';
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    model?: string,
  ) {
    this.model = model || DEFAULT_MODEL;
  }

  async extract(input: ExtractionInput): Promise<ExtractionOutput> {
    const body = {
      model: this.model,
      temperature: 0,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: input.systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: [input.userInstruction, ...(input.hints ?? [])].join('\n\n') },
            {
              type: 'image_url',
              image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}`, detail: 'high' },
            },
          ],
        },
      ],
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: input.signal ?? null,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      if (response.status === 429) {
        return Promise.reject(
          new ProviderError('RATE_LIMITED', 'The AI provider is rate limiting requests.', 429),
        );
      }
      if (response.status === 401 || response.status === 403) {
        return Promise.reject(
          new ProviderError('PROVIDER_NOT_CONFIGURED', 'The AI provider rejected the API key.'),
        );
      }
      return Promise.reject(
        new ProviderError('AI_PROVIDER_ERROR', `Provider error ${response.status}: ${text.slice(0, 400)}`),
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: unknown;
      model?: string;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new ProviderError('AI_INVALID_JSON', 'The model returned no content.');

    return {
      data: parseModelJson(content),
      raw: { usage: payload.usage, finish_reason: payload.choices?.[0]?.finish_reason },
      model: payload.model ?? this.model,
    };
  }
}
