/**
 * PERSISTENCE ABSTRACTION
 * ---------------------------------------------------------------------------
 * The UI only ever talks to this interface. Two implementations exist:
 *   • SupabaseLabelRepository — Postgres + private Storage bucket
 *   • LocalLabelRepository    — localStorage + IndexedDB, used in mock mode and
 *                               whenever Supabase credentials are absent, so the
 *                               whole workflow is demonstrable with zero setup
 */

import { env } from '../../config/env';
import type { LabelDraft, LabelRecord } from '../../domain/labelRecord';

export interface SourceImageRef {
  path: string;
  mimeType: string;
  bytes: number;
}

export interface LabelRepository {
  readonly kind: 'supabase' | 'local';
  create(draft: LabelDraft): Promise<LabelRecord>;
  update(id: string, patch: Partial<LabelDraft>): Promise<LabelRecord>;
  get(id: string): Promise<LabelRecord | null>;
  list(limit?: number): Promise<LabelRecord[]>;
  /** Stores the photographed label. Returns null when retention is disabled. */
  uploadSourceImage(blob: Blob, recordHint?: string): Promise<SourceImageRef | null>;
  /** Short-lived URL for displaying a stored photo. Never a public URL. */
  getSourceImageUrl(path: string): Promise<string | null>;
}

let instance: LabelRepository | null = null;

/** Lazily resolve the repository appropriate for the current configuration. */
export async function getRepository(): Promise<LabelRepository> {
  if (instance) return instance;
  if (env.mockMode || !env.supabase.configured) {
    const { LocalLabelRepository } = await import('./localRepository');
    instance = new LocalLabelRepository();
  } else {
    const { SupabaseLabelRepository } = await import('./supabaseRepository');
    instance = new SupabaseLabelRepository();
  }
  return instance;
}

/** Test seam. */
export function __setRepository(repo: LabelRepository | null): void {
  instance = repo;
}
