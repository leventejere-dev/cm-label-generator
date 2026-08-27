/**
 * THE PERSISTED LABEL RECORD
 * Mirrors the `public.labels` table one-for-one (camelCase here, snake_case in SQL).
 */

import type { ExtractionResult, ExtractionWarning } from './extraction';
import type { RemovedItem } from './sanitize';
import { summarise } from './labelDocument';

export const LABEL_STATUSES = ['draft', 'extracted', 'reviewed', 'generated', 'failed'] as const;
export type LabelStatus = (typeof LABEL_STATUSES)[number];

export const LABEL_STATUS_LABELS: Record<LabelStatus, string> = {
  draft: 'Draft',
  extracted: 'Extracted',
  reviewed: 'Reviewed',
  generated: 'Generated',
  failed: 'Failed',
};

/** Version tag of the A4 template used, so old records can be re-rendered faithfully. */
export const CURRENT_LABEL_TEMPLATE = 'cm-a4-v1';

export interface LabelRecord {
  id: string;
  cmId: string;
  createdAt: string;
  updatedAt: string;
  status: LabelStatus;

  sourceImagePath: string | null;
  sourceImageMime: string | null;
  sourceImageBytes: number | null;

  /** Untouched provider payload, for troubleshooting extraction quality. */
  rawAiResponse: unknown;
  /** Validated AI output, before human edits. */
  structuredExtractedData: ExtractionResult | null;
  /** What the employee confirmed. This is what the label is printed from. */
  reviewedData: ExtractionResult | null;
  /** Internal-only record of what was suppressed. Never printed. */
  removedSensitiveData: RemovedItem[];

  aiProvider: string | null;
  aiModel: string | null;
  processingDurationMs: number | null;
  overallConfidence: number | null;
  generatedLabelVersion: string;

  summaryProduct: string | null;
  summaryDimensions: string | null;
  summaryWeight: string | null;

  warnings: ExtractionWarning[];
  appVersion: string | null;
}

/** Fields the client may write. `id`/`cmId`/timestamps are server-owned. */
export type LabelDraft = Omit<LabelRecord, 'id' | 'cmId' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<LabelRecord, 'id' | 'cmId' | 'createdAt' | 'updatedAt'>>;

/** Derive the denormalised history-list columns from reviewed (or extracted) data. */
export function deriveSummary(record: {
  reviewedData: ExtractionResult | null;
  structuredExtractedData: ExtractionResult | null;
}): Pick<LabelRecord, 'summaryProduct' | 'summaryDimensions' | 'summaryWeight'> {
  const data = record.reviewedData ?? record.structuredExtractedData;
  if (!data) {
    return { summaryProduct: null, summaryDimensions: null, summaryWeight: null };
  }
  const summary = summarise(data);
  return {
    summaryProduct: summary.product,
    summaryDimensions: summary.dimensions,
    summaryWeight: summary.weight,
  };
}
