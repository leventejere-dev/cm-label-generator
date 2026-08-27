/**
 * Local, zero-backend persistence.
 * Active in mock mode and whenever Supabase credentials are missing, so the
 * complete workflow — scan, review, generate, history, reprint — can be
 * demonstrated on a phone with nothing configured.
 */

import { CURRENT_LABEL_TEMPLATE, type LabelDraft, type LabelRecord } from '../../domain/labelRecord';
import { generateCmId } from '../../domain/cmId';
import { env } from '../../config/env';
import type { LabelRepository, SourceImageRef } from './repository';
import { getBlob, putBlob } from './idb';

const STORAGE_KEY = 'cm-label-generator/labels';
const MAX_RECORDS = 100;

function readAll(): LabelRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LabelRecord[]) : [];
  } catch {
    return [];
  }
}

function writeAll(records: LabelRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
  } catch {
    /* quota exceeded — history is a convenience, never load-bearing */
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class LocalLabelRepository implements LabelRepository {
  readonly kind = 'local' as const;

  async create(draft: LabelDraft): Promise<LabelRecord> {
    const now = new Date().toISOString();
    const record: LabelRecord = {
      id: draft.id ?? newId(),
      cmId: draft.cmId ?? generateCmId(),
      createdAt: now,
      updatedAt: now,
      status: draft.status ?? 'draft',
      sourceImagePath: draft.sourceImagePath ?? null,
      sourceImageMime: draft.sourceImageMime ?? null,
      sourceImageBytes: draft.sourceImageBytes ?? null,
      rawAiResponse: draft.rawAiResponse ?? null,
      structuredExtractedData: draft.structuredExtractedData ?? null,
      reviewedData: draft.reviewedData ?? null,
      removedSensitiveData: draft.removedSensitiveData ?? [],
      aiProvider: draft.aiProvider ?? null,
      aiModel: draft.aiModel ?? null,
      processingDurationMs: draft.processingDurationMs ?? null,
      overallConfidence: draft.overallConfidence ?? null,
      generatedLabelVersion: draft.generatedLabelVersion ?? CURRENT_LABEL_TEMPLATE,
      summaryProduct: draft.summaryProduct ?? null,
      summaryDimensions: draft.summaryDimensions ?? null,
      summaryWeight: draft.summaryWeight ?? null,
      warnings: draft.warnings ?? [],
      appVersion: draft.appVersion ?? env.appVersion,
    };
    writeAll([record, ...readAll()]);
    return record;
  }

  async update(id: string, patch: Partial<LabelDraft>): Promise<LabelRecord> {
    const records = readAll();
    const index = records.findIndex((record) => record.id === id);
    if (index === -1) {
      // Recreate rather than fail: local storage may have been cleared mid-session.
      return this.create({ ...(patch as LabelDraft), id });
    }
    const existing = records[index] as LabelRecord;
    const updated: LabelRecord = {
      ...existing,
      ...(patch as Partial<LabelRecord>),
      id: existing.id,
      cmId: existing.cmId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    records[index] = updated;
    writeAll(records);
    return updated;
  }

  async get(id: string): Promise<LabelRecord | null> {
    return readAll().find((record) => record.id === id) ?? null;
  }

  async list(limit = 25): Promise<LabelRecord[]> {
    return readAll()
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async uploadSourceImage(blob: Blob, recordHint?: string): Promise<SourceImageRef | null> {
    if (!env.storage.retainSourceImage) return null;
    const path = `local/${recordHint ?? newId()}.jpg`;
    await putBlob(path, blob);
    return { path, mimeType: blob.type || 'image/jpeg', bytes: blob.size };
  }

  async getSourceImageUrl(path: string): Promise<string | null> {
    const blob = await getBlob(path);
    return blob ? URL.createObjectURL(blob) : null;
  }
}
