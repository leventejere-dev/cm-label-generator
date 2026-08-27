/**
 * In-memory state for the scan currently in progress.
 *
 * Persistence lives in the repository; this store only holds what cannot be
 * round-tripped through the database — the captured photo, its object URL and
 * the reviewer's unsaved edits.
 */

import { create } from 'zustand';
import type { ExtractionResult, ExtractionWarning } from '../domain/extraction';
import type { RemovedItem } from '../domain/sanitize';
import type { LabelRecord } from '../domain/labelRecord';
import type { ProcessedImage } from '../lib/image/preprocess';
import type { QualityReport } from '../lib/image/quality';

interface ScanSessionState {
  /** Optimised capture waiting to be analysed. */
  processed: ProcessedImage | null;
  quality: QualityReport | null;

  /** Result of the last completed scan. */
  record: LabelRecord | null;
  /** Editable, already-sanitised data shown on the review screen. */
  reviewed: ExtractionResult | null;
  removed: RemovedItem[];
  warnings: ExtractionWarning[];
  /** Displayable URL of the source photo (object URL or signed URL). */
  sourceImageUrl: string | null;
  /** True when sourceImageUrl is an object URL this store must revoke. */
  sourceImageUrlOwned: boolean;

  setCapture: (processed: ProcessedImage, quality: QualityReport | null) => void;
  clearCapture: () => void;
  setScanResult: (input: {
    record: LabelRecord;
    reviewed: ExtractionResult;
    removed: RemovedItem[];
    warnings: ExtractionWarning[];
    sourceImageUrl?: string | null;
    sourceImageUrlOwned?: boolean;
  }) => void;
  setReviewed: (data: ExtractionResult) => void;
  setRecord: (record: LabelRecord) => void;
  setSourceImageUrl: (url: string | null, owned: boolean) => void;
  reset: () => void;
}

function revoke(url: string | null, owned: boolean): void {
  if (url && owned) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

export const useScanSession = create<ScanSessionState>((set, get) => ({
  processed: null,
  quality: null,
  record: null,
  reviewed: null,
  removed: [],
  warnings: [],
  sourceImageUrl: null,
  sourceImageUrlOwned: false,

  setCapture: (processed, quality) => {
    const previous = get().processed;
    if (previous && previous.previewUrl !== processed.previewUrl) {
      revoke(previous.previewUrl, true);
    }
    set({ processed, quality });
  },

  clearCapture: () => {
    const previous = get().processed;
    if (previous) revoke(previous.previewUrl, true);
    set({ processed: null, quality: null });
  },

  setScanResult: ({ record, reviewed, removed, warnings, sourceImageUrl, sourceImageUrlOwned }) => {
    const state = get();
    if (sourceImageUrl !== undefined && state.sourceImageUrl !== sourceImageUrl) {
      revoke(state.sourceImageUrl, state.sourceImageUrlOwned);
    }
    set({
      record,
      reviewed,
      removed,
      warnings,
      ...(sourceImageUrl !== undefined
        ? { sourceImageUrl, sourceImageUrlOwned: sourceImageUrlOwned ?? false }
        : {}),
    });
  },

  setReviewed: (data) => set({ reviewed: data }),
  setRecord: (record) => set({ record }),

  setSourceImageUrl: (url, owned) => {
    const state = get();
    if (state.sourceImageUrl !== url) revoke(state.sourceImageUrl, state.sourceImageUrlOwned);
    set({ sourceImageUrl: url, sourceImageUrlOwned: owned });
  },

  reset: () => {
    const state = get();
    if (state.processed) revoke(state.processed.previewUrl, true);
    revoke(state.sourceImageUrl, state.sourceImageUrlOwned);
    set({
      processed: null,
      quality: null,
      record: null,
      reviewed: null,
      removed: [],
      warnings: [],
      sourceImageUrl: null,
      sourceImageUrlOwned: false,
    });
  },
}));
