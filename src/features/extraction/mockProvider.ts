/**
 * MOCK EXTRACTION PROVIDER
 * ---------------------------------------------------------------------------
 * Runs the complete workflow with no Supabase project and no AI credentials.
 * Deliberately isolated in this one file: switching to the real provider is
 * purely a matter of configuration (see config/env.ts → mockMode).
 *
 * It rotates through the bundled fixtures so consecutive demo scans do not all
 * produce the same label, and it takes a realistic amount of time so the
 * processing screen behaves as it will in production.
 */

import { parseExtraction } from '../../domain/extraction';
import { appError } from '../../lib/errors';
import { pickFixture, type LabelFixture } from './fixtures';
import type { ExtractionRequest, ExtractionResponse, LabelExtractionProvider } from './provider';

const COUNTER_KEY = 'cm-label-generator/mock-counter';

/**
 * Returns the current counter and advances it, so the FIRST demo scan returns
 * the fixture matching the sample photograph and later scans rotate through the
 * other supplier layouts.
 */
function nextIndex(): number {
  try {
    const parsed = Number.parseInt(localStorage.getItem(COUNTER_KEY) ?? '0', 10);
    const current = Number.isFinite(parsed) ? parsed : 0;
    localStorage.setItem(COUNTER_KEY, String(current + 1));
    return current;
  } catch {
    return 0;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(appError('UNKNOWN', { title: 'Analiză anulată', detail: 'Analiza a fost anulată.' }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(appError('UNKNOWN', { title: 'Analiză anulată', detail: 'Analiza a fost anulată.' }));
      },
      { once: true },
    );
  });
}

export class MockExtractionProvider implements LabelExtractionProvider {
  readonly id = 'mock';

  constructor(private readonly forced?: LabelFixture) {}

  async extract(_request: ExtractionRequest, signal?: AbortSignal): Promise<ExtractionResponse> {
    const fixture = this.forced ?? pickFixture(nextIndex());
    const started = Date.now();
    await sleep(fixture.simulatedDurationMs, signal);

    const outcome = parseExtraction(fixture.raw);
    return {
      result: outcome.result,
      raw: fixture.raw,
      provider: 'mock',
      model: `fixture:${fixture.id}`,
      durationMs: Date.now() - started,
    };
  }
}
