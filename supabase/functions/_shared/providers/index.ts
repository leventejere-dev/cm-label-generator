/**
 * Provider registry.
 *
 * Selection is a secret, not code:
 *   supabase secrets set AI_PROVIDER=google    GOOGLE_API_KEY=...
 *   supabase secrets set AI_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-ant-...
 *   supabase secrets set AI_PROVIDER=openai    OPENAI_API_KEY=sk-...
 * `AI_MODEL` overrides the provider's default model.
 *
 * With no AI_PROVIDER set, whichever key is present wins. Google is checked
 * first because it is the only one with a free tier: an operator who pastes a
 * Gemini key and nothing else should get a working app, not a configuration
 * error about a provider they never chose.
 *
 * To add a vendor: implement LabelExtractionProvider in a new file and add one
 * case below.
 */

import { AnthropicProvider } from './anthropic.ts';
import { GoogleProvider } from './google.ts';
import { OpenAIProvider } from './openai.ts';
import { ProviderError, type LabelExtractionProvider } from './types.ts';

export function resolveProvider(): LabelExtractionProvider {
  const requested = (Deno.env.get('AI_PROVIDER') ?? '').toLowerCase().trim();
  const model = Deno.env.get('AI_MODEL')?.trim();

  const googleKey = (Deno.env.get('GOOGLE_API_KEY') ?? Deno.env.get('GEMINI_API_KEY'))?.trim();
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim();
  const openaiKey = Deno.env.get('OPENAI_API_KEY')?.trim();

  const detected = googleKey ? 'google' : anthropicKey ? 'anthropic' : openaiKey ? 'openai' : '';
  // 'gemini' is what the key is called in Google's console; accept both spellings.
  const provider = (requested === 'gemini' ? 'google' : requested) || detected;

  switch (provider) {
    case 'google':
      if (!googleKey) {
        throw new ProviderError('PROVIDER_NOT_CONFIGURED', 'GOOGLE_API_KEY is not set.');
      }
      return new GoogleProvider(googleKey, model);
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
        'No AI provider configured. Set GOOGLE_API_KEY (or ANTHROPIC_API_KEY / OPENAI_API_KEY) as an Edge Function secret.',
      );
  }
}

export { ProviderError };
export type { LabelExtractionProvider };
