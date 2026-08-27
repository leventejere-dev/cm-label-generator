/**
 * Provider registry.
 *
 * Selection is a secret, not code:
 *   supabase secrets set AI_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-ant-...
 *   supabase secrets set AI_PROVIDER=openai    OPENAI_API_KEY=sk-...
 * `AI_MODEL` overrides the provider's default model.
 *
 * To add a vendor: implement LabelExtractionProvider in a new file and add one
 * case below.
 */

import { AnthropicProvider } from './anthropic.ts';
import { OpenAIProvider } from './openai.ts';
import { ProviderError, type LabelExtractionProvider } from './types.ts';

export function resolveProvider(): LabelExtractionProvider {
  const requested = (Deno.env.get('AI_PROVIDER') ?? '').toLowerCase().trim();
  const model = Deno.env.get('AI_MODEL')?.trim();

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim();
  const openaiKey = Deno.env.get('OPENAI_API_KEY')?.trim();

  const provider = requested || (anthropicKey ? 'anthropic' : openaiKey ? 'openai' : '');

  switch (provider) {
    case 'anthropic':
      if (!anthropicKey) {
        throw new ProviderError('PROVIDER_NOT_CONFIGURED', 'ANTHROPIC_API_KEY is not set.');
      }
      return new AnthropicProvider(anthropicKey, model);
    case 'openai':
      if (!openaiKey) {
        throw new ProviderError('PROVIDER_NOT_CONFIGURED', 'OPENAI_API_KEY is not set.');
      }
      return new OpenAIProvider(openaiKey, model);
    default:
      throw new ProviderError(
        'PROVIDER_NOT_CONFIGURED',
        'No AI provider configured. Set ANTHROPIC_API_KEY (or OPENAI_API_KEY) as an Edge Function secret.',
      );
  }
}

export { ProviderError };
export type { LabelExtractionProvider };
