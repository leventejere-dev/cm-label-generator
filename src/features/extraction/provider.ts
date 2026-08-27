/**
 * LABEL EXTRACTION PROVIDER
 * ---------------------------------------------------------------------------
 * The application never talks to an AI vendor directly. It talks to this
 * interface, and the concrete implementation is chosen at runtime:
 *
 *   EdgeFunctionProvider  → Supabase Edge Function → whichever vendor is
 *                           configured server-side (see supabase/functions/
 *                           _shared/providers). Swapping vendors is a server
 *                           secret change; the frontend does not care.
 *   MockProvider          → local fixtures, no network, no keys.
 *
 * No API key ever exists on this side of the wire.
 */

import { env } from '../../config/env';
import type { ExtractionResult } from '../../domain/extraction';

export interface ExtractionRequest {
  /** The optimised photo. Sent inline when there is no storage path. */
  image: Blob;
  /** Storage path when the photo was already uploaded — avoids sending it twice. */
  imagePath?: string | null;
  /** Optional free-text hints (reserved for supplier-specific hints later). */
  hints?: string[];
}

export interface ExtractionResponse {
  /** Validated, normalised data. */
  result: ExtractionResult;
  /** Untouched provider payload, stored for troubleshooting. */
  raw: unknown;
  provider: string;
  model: string;
  /** Server-measured duration where available, else client-measured. */
  durationMs: number;
}

export interface LabelExtractionProvider {
  readonly id: string;
  extract(request: ExtractionRequest, signal?: AbortSignal): Promise<ExtractionResponse>;
}

let override: LabelExtractionProvider | null = null;

/** Test seam / future manual provider switch. */
export function setExtractionProvider(provider: LabelExtractionProvider | null): void {
  override = provider;
}

export async function getExtractionProvider(): Promise<LabelExtractionProvider> {
  if (override) return override;
  if (env.mockMode || !env.supabase.configured) {
    const { MockExtractionProvider } = await import('./mockProvider');
    return new MockExtractionProvider();
  }
  const { EdgeFunctionExtractionProvider } = await import('./edgeFunctionProvider');
  return new EdgeFunctionExtractionProvider();
}
