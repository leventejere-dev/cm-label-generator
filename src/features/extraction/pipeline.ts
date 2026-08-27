/**
 * THE SCAN PIPELINE
 * ---------------------------------------------------------------------------
 * One place that owns the sequence:
 *
 *   optimise photo → create record → upload photo → AI extraction
 *   → supplier suppression → summarise → persist
 *
 * Stage callbacks drive the processing screen. Every stage transition here is
 * REAL work finishing — the UI never invents a percentage. The only exception
 * is the split between "Reading document" and "Identifying product
 * information", which are two labels over one opaque provider call; they change
 * on a timer and show no percentage.
 *
 * A database row is created *before* the AI call so that a failed extraction is
 * still recorded and can be inspected later.
 */

import { env } from '../../config/env';
import { CURRENT_LABEL_TEMPLATE, deriveSummary, type LabelRecord } from '../../domain/labelRecord';
import { colorMetalize, type SanitizeOutcome } from '../../domain/sanitize';
import { countPopulatedFields, type ExtractionResult, type ExtractionWarning } from '../../domain/extraction';
import { getRepository } from '../../lib/data/repository';
import { appError, toAppError } from '../../lib/errors';
import { preprocessImage, type ProcessedImage } from '../../lib/image/preprocess';
import { getExtractionProvider } from './provider';

export const PIPELINE_STAGES = [
  { id: 'optimising', label: 'Se optimizează fotografia' },
  { id: 'uploading', label: 'Se încarcă imaginea' },
  { id: 'reading', label: 'Se citește documentul' },
  { id: 'identifying', label: 'Se identifică informațiile despre produs' },
  { id: 'removing', label: 'Se elimină informațiile despre furnizor' },
  { id: 'preparing', label: 'Se pregătesc datele Color Metal' },
] as const;

export type PipelineStageId = (typeof PIPELINE_STAGES)[number]['id'];
export type StageState = 'pending' | 'active' | 'done';

export interface StageSnapshot {
  id: PipelineStageId;
  label: string;
  state: StageState;
}

export interface ScanOutcome {
  record: LabelRecord;
  extracted: ExtractionResult;
  sanitized: SanitizeOutcome;
  processed: ProcessedImage;
}

export interface RunScanOptions {
  image: Blob;
  /** Already-optimised image, when the preview screen did the work. */
  processed?: ProcessedImage;
  onStages?: (stages: StageSnapshot[]) => void;
  signal?: AbortSignal;
}

class StageTracker {
  private readonly states = new Map<PipelineStageId, StageState>();

  constructor(private readonly emit?: (stages: StageSnapshot[]) => void) {
    for (const stage of PIPELINE_STAGES) this.states.set(stage.id, 'pending');
    this.publish();
  }

  begin(id: PipelineStageId): void {
    this.states.set(id, 'active');
    this.publish();
  }

  complete(...ids: PipelineStageId[]): void {
    for (const id of ids) this.states.set(id, 'done');
    this.publish();
  }

  snapshot(): StageSnapshot[] {
    return PIPELINE_STAGES.map((stage) => ({
      id: stage.id,
      label: stage.label,
      state: this.states.get(stage.id) ?? 'pending',
    }));
  }

  private publish(): void {
    this.emit?.(this.snapshot());
  }
}

/** Run the complete scan. Throws an AppError the UI can present as-is. */
export async function runScan(options: RunScanOptions): Promise<ScanOutcome> {
  const tracker = new StageTracker(options.onStages);
  const repository = await getRepository();

  // --- 1. optimise --------------------------------------------------------
  tracker.begin('optimising');
  const processed =
    options.processed ??
    (await preprocessImage(options.image, {
      maxEdge: env.image.maxEdge,
      targetBytes: env.image.targetBytes,
      hardMaxBytes: env.image.hardMaxBytes,
    }));
  tracker.complete('optimising');

  // --- 2. create the record up front -------------------------------------
  let record: LabelRecord;
  try {
    record = await repository.create({
      status: 'draft',
      sourceImagePath: null,
      sourceImageMime: processed.mimeType,
      sourceImageBytes: processed.bytes,
      rawAiResponse: null,
      structuredExtractedData: null,
      reviewedData: null,
      removedSensitiveData: [],
      aiProvider: null,
      aiModel: null,
      processingDurationMs: null,
      overallConfidence: null,
      generatedLabelVersion: CURRENT_LABEL_TEMPLATE,
      summaryProduct: null,
      summaryDimensions: null,
      summaryWeight: null,
      warnings: [],
      appVersion: env.appVersion,
    });
  } catch (cause) {
    throw toAppError(cause);
  }

  // --- 3. upload the photo ------------------------------------------------
  tracker.begin('uploading');
  let imagePath: string | null = null;
  try {
    const uploaded = await repository.uploadSourceImage(processed.blob, record.id);
    if (uploaded) {
      imagePath = uploaded.path;
      record = await repository.update(record.id, {
        sourceImagePath: uploaded.path,
        sourceImageMime: uploaded.mimeType,
        sourceImageBytes: uploaded.bytes,
      });
    }
  } catch (cause) {
    // Retention is a troubleshooting nicety — never block a scan because the
    // bucket is missing. Record the problem and carry on with an inline upload.
    const failure = toAppError(cause);
    if (failure.code !== 'STORAGE_UPLOAD_FAILED') throw failure;
  }
  tracker.complete('uploading');

  // --- 4. AI extraction ---------------------------------------------------
  tracker.begin('reading');
  const switchLabelTimer = setTimeout(() => {
    tracker.complete('reading');
    tracker.begin('identifying');
  }, 1400);

  let response;
  try {
    const provider = await getExtractionProvider();
    response = await provider.extract(
      { image: processed.blob, imagePath, hints: [] },
      options.signal,
    );
  } catch (cause) {
    clearTimeout(switchLabelTimer);
    const failure = toAppError(cause);
    await safeMarkFailed(repository, record.id, failure.title);
    throw failure;
  } finally {
    clearTimeout(switchLabelTimer);
  }
  tracker.complete('reading', 'identifying');

  // --- 5. supplier suppression -------------------------------------------
  tracker.begin('removing');
  const sanitized = colorMetalize(response.result);
  tracker.complete('removing');

  // --- 6. summarise + persist --------------------------------------------
  tracker.begin('preparing');
  const warnings: ExtractionWarning[] = [
    ...response.result.warnings,
    ...sanitized.warnings,
  ];
  const summary = deriveSummary({
    reviewedData: sanitized.safe,
    structuredExtractedData: response.result,
  });

  try {
    record = await repository.update(record.id, {
      status: 'extracted',
      rawAiResponse: response.raw,
      structuredExtractedData: response.result,
      reviewedData: sanitized.safe,
      removedSensitiveData: sanitized.removed,
      aiProvider: response.provider,
      aiModel: response.model,
      processingDurationMs: response.durationMs,
      overallConfidence: response.result.overallConfidence,
      warnings,
      ...summary,
    });
  } catch (cause) {
    // The data is good; only saving failed. Continue with an in-memory record
    // so the employee can still review and print.
    const failure = toAppError(cause);
    if (failure.code !== 'DATABASE_FAILURE') throw failure;
    record = {
      ...record,
      status: 'extracted',
      structuredExtractedData: response.result,
      reviewedData: sanitized.safe,
      removedSensitiveData: sanitized.removed,
      aiProvider: response.provider,
      aiModel: response.model,
      processingDurationMs: response.durationMs,
      overallConfidence: response.result.overallConfidence,
      warnings: [
        ...warnings,
        {
          code: 'NOT_SAVED',
          severity: 'warning',
          message: 'Eticheta nu a putut fi salvată în baza de date. O poți tipări în continuare.',
        },
      ],
      ...summary,
    };
  }
  tracker.complete('preparing');

  if (isEffectivelyEmpty(response.result)) {
    throw appError('NO_LABEL_DETECTED');
  }

  return { record, extracted: response.result, sanitized, processed };
}

async function safeMarkFailed(
  repository: Awaited<ReturnType<typeof getRepository>>,
  id: string,
  reason: string,
): Promise<void> {
  try {
    await repository.update(id, {
      status: 'failed',
      warnings: [{ code: 'EXTRACTION_FAILED', severity: 'error', message: reason }],
    });
  } catch {
    /* best effort */
  }
}

function isEffectivelyEmpty(result: ExtractionResult): boolean {
  return countPopulatedFields(result) === 0;
}
