/**
 * Anthropic Claude — the default provider.
 *
 * Why: photographed technical documents with small multilingual print are the
 * case it is strongest at, and forced tool use gives schema-shaped JSON without
 * post-hoc repair. Temperature is 0 because this is extraction, not writing.
 */

import { EXTRACTION_JSON_SCHEMA, EXTRACTION_TOOL_NAME } from '../schema.ts';
import { parseModelJson } from '../validation.ts';
import { ProviderError, type ExtractionInput, type ExtractionOutput, type LabelExtractionProvider } from './types.ts';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-5';

export class AnthropicProvider implements LabelExtractionProvider {
  readonly id = 'anthropic';
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
      max_tokens: 4096,
      temperature: 0,
      system: input.systemPrompt,
      tools: [
        {
          name: EXTRACTION_TOOL_NAME,
          description:
            'Return the structured data read from the photographed supplier material label.',
          input_schema: EXTRACTION_JSON_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: EXTRACTION_TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: input.mimeType, data: input.imageBase64 },
            },
            {
              type: 'text',
              text: [input.userInstruction, ...(input.hints ?? [])].join('\n\n'),
            },
          ],
        },
      ],
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify(body),
      signal: input.signal ?? null,
    });

    if (!response.ok) {
      throw await toProviderError(response);
    }

    const payload = (await response.json()) as {
      content?: Array<{ type: string; input?: unknown; text?: string }>;
      stop_reason?: string;
      usage?: unknown;
      model?: string;
    };

    const toolUse = payload.content?.find((block) => block.type === 'tool_use');
    if (toolUse?.input && typeof toolUse.input === 'object') {
      return {
        data: toolUse.input,
        raw: { stop_reason: payload.stop_reason, usage: payload.usage, model: payload.model },
        model: payload.model ?? this.model,
      };
    }

    // The model answered in prose despite forced tool use — recover if we can.
    const text = payload.content?.find((block) => block.type === 'text')?.text;
    if (text) {
      return {
        data: parseModelJson(text),
        raw: { stop_reason: payload.stop_reason, usage: payload.usage, recovered: true },
        model: payload.model ?? this.model,
      };
    }

    throw new ProviderError('AI_INVALID_JSON', 'The model returned no usable content.');
  }
}

async function toProviderError(response: Response): Promise<ProviderError> {
  const text = await response.text().catch(() => '');
  const message = text.slice(0, 400) || response.statusText;

  if (response.status === 429) {
    return new ProviderError('RATE_LIMITED', 'The AI provider is rate limiting requests.', 429);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderError('PROVIDER_NOT_CONFIGURED', 'The AI provider rejected the API key.', 502);
  }
  if (response.status === 400 && /image/i.test(message)) {
    return new ProviderError('UNSUPPORTED_MEDIA_TYPE', 'The provider rejected the image.', 415);
  }
  return new ProviderError('AI_PROVIDER_ERROR', `Provider error ${response.status}: ${message}`);
}
