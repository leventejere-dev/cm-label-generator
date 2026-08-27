import type { PostgrestError } from '@supabase/supabase-js';
import { env } from '../../config/env';
import { CURRENT_LABEL_TEMPLATE, type LabelDraft, type LabelRecord, type LabelStatus } from '../../domain/labelRecord';
import type { ExtractionResult, ExtractionWarning } from '../../domain/extraction';
import type { RemovedItem } from '../../domain/sanitize';
import { coerceCmId } from '../../domain/cmId';
import { appError } from '../errors';
import { getSupabase } from '../supabase';
import type { LabelRepository, SourceImageRef } from './repository';

const TABLE = 'labels';
const SIGNED_URL_TTL_SECONDS = 60 * 10;

/** Row shape as returned by Postgres (snake_case). */
interface LabelRow {
  id: string;
  cm_id: string;
  created_at: string;
  updated_at: string;
  status: string;
  source_image_path: string | null;
  source_image_mime: string | null;
  source_image_bytes: number | null;
  raw_ai_response: unknown;
  structured_extracted_data: unknown;
  reviewed_data: unknown;
  removed_sensitive_data: unknown;
  ai_provider: string | null;
  ai_model: string | null;
  processing_duration_ms: number | null;
  overall_confidence: number | string | null;
  generated_label_version: string | null;
  summary_product: string | null;
  summary_dimensions: string | null;
  summary_weight: string | null;
  warnings: unknown;
  app_version: string | null;
}

function toRecord(row: LabelRow): LabelRecord {
  return {
    id: row.id,
    cmId: coerceCmId(row.cm_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: (row.status as LabelStatus) ?? 'draft',
    sourceImagePath: row.source_image_path,
    sourceImageMime: row.source_image_mime,
    sourceImageBytes: row.source_image_bytes,
    rawAiResponse: row.raw_ai_response ?? null,
    structuredExtractedData: (row.structured_extracted_data as ExtractionResult | null) ?? null,
    reviewedData: (row.reviewed_data as ExtractionResult | null) ?? null,
    removedSensitiveData: Array.isArray(row.removed_sensitive_data)
      ? (row.removed_sensitive_data as RemovedItem[])
      : [],
    aiProvider: row.ai_provider,
    aiModel: row.ai_model,
    processingDurationMs: row.processing_duration_ms,
    overallConfidence:
      row.overall_confidence === null ? null : Number(row.overall_confidence),
    generatedLabelVersion: row.generated_label_version ?? CURRENT_LABEL_TEMPLATE,
    summaryProduct: row.summary_product,
    summaryDimensions: row.summary_dimensions,
    summaryWeight: row.summary_weight,
    warnings: Array.isArray(row.warnings) ? (row.warnings as ExtractionWarning[]) : [],
    appVersion: row.app_version,
  };
}

function toRow(draft: Partial<LabelDraft>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) row[key] = value;
  };
  set('status', draft.status);
  set('source_image_path', draft.sourceImagePath);
  set('source_image_mime', draft.sourceImageMime);
  set('source_image_bytes', draft.sourceImageBytes);
  set('raw_ai_response', draft.rawAiResponse);
  set('structured_extracted_data', draft.structuredExtractedData);
  set('reviewed_data', draft.reviewedData);
  set('removed_sensitive_data', draft.removedSensitiveData);
  set('ai_provider', draft.aiProvider);
  set('ai_model', draft.aiModel);
  set('processing_duration_ms', draft.processingDurationMs);
  set('overall_confidence', draft.overallConfidence);
  set('generated_label_version', draft.generatedLabelVersion);
  set('summary_product', draft.summaryProduct);
  set('summary_dimensions', draft.summaryDimensions);
  set('summary_weight', draft.summaryWeight);
  set('warnings', draft.warnings);
  set('app_version', draft.appVersion);
  return row;
}

function fail(error: PostgrestError | null, fallbackDetail: string): never {
  throw appError('DATABASE_FAILURE', {
    detail: error?.message ? `${fallbackDetail} (${error.message})` : fallbackDetail,
    cause: error,
  });
}

export class SupabaseLabelRepository implements LabelRepository {
  readonly kind = 'supabase' as const;

  async create(draft: LabelDraft): Promise<LabelRecord> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .insert(toRow(draft))
      .select('*')
      .single();
    if (error || !data) fail(error, 'The label could not be created.');
    return toRecord(data as LabelRow);
  }

  async update(id: string, patch: Partial<LabelDraft>): Promise<LabelRecord> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .update(toRow(patch))
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) fail(error, 'The label could not be updated.');
    return toRecord(data as LabelRow);
  }

  async get(id: string): Promise<LabelRecord | null> {
    const { data, error } = await getSupabase().from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) fail(error, 'The label could not be loaded.');
    return data ? toRecord(data as LabelRow) : null;
  }

  async list(limit = 25): Promise<LabelRecord[]> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) fail(error, 'Recent labels could not be loaded.');
    return (data ?? []).map((row) => toRecord(row as LabelRow));
  }

  async uploadSourceImage(blob: Blob, recordHint?: string): Promise<SourceImageRef | null> {
    if (!env.storage.retainSourceImage) return null;

    const now = new Date();
    const folder = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${String(now.getUTCDate()).padStart(2, '0')}`;
    const id = recordHint ?? crypto.randomUUID();
    const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${folder}/${id}.${extension}`;

    const { error } = await getSupabase()
      .storage.from(env.supabase.sourceImageBucket)
      .upload(path, blob, {
        contentType: blob.type || 'image/jpeg',
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      throw appError('STORAGE_UPLOAD_FAILED', {
        detail: `The photo could not be uploaded (${error.message}).`,
        cause: error,
      });
    }
    return { path, mimeType: blob.type || 'image/jpeg', bytes: blob.size };
  }

  async getSourceImageUrl(path: string): Promise<string | null> {
    const { data, error } = await getSupabase()
      .storage.from(env.supabase.sourceImageBucket)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data) return null;
    return data.signedUrl;
  }
}
