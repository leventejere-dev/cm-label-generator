/**
 * REVIEW-FORM GUARDS
 * ---------------------------------------------------------------------------
 * The employee must be able to correct anything the model got wrong — but must
 * NOT be able to put supplier branding back onto the customer-facing label,
 * whether by naming a field "Supplier" or by typing the supplier's name into an
 * otherwise innocent field.
 */

import {
  buildSupplierBlocklist,
  isColorMetal,
  isSupplierIdentifyingCaption,
  looksLikeContactDetail,
  matchesBlocklist,
  type RemovedItem,
} from '../../domain/sanitize';

export interface GuardVerdict {
  ok: boolean;
  message?: string;
}

const OK: GuardVerdict = { ok: true };

export function checkCaption(caption: string): GuardVerdict {
  const trimmed = caption.trim();
  if (!trimmed) return { ok: false, message: 'Give the field a name.' };
  if (trimmed.length > 60) return { ok: false, message: 'Keep the field name under 60 characters.' };
  if (isSupplierIdentifyingCaption(trimmed)) {
    return {
      ok: false,
      message:
        'This field name would identify the supplier, so it cannot appear on a Color Metal label. Use a neutral name for product data instead.',
    };
  }
  return OK;
}

export function checkValue(value: string, removed: RemovedItem[]): GuardVerdict {
  const trimmed = value.trim();
  if (!trimmed) return OK;
  if (trimmed.length > 300) return { ok: false, message: 'This value is too long for a label field.' };
  if (isColorMetal(trimmed)) return OK;

  if (looksLikeContactDetail(trimmed)) {
    return {
      ok: false,
      message:
        'E-mail addresses, websites and telephone numbers are not printed on Color Metal labels.',
    };
  }

  const blocklist = buildSupplierBlocklist(
    removed.map((item) => ({
      category: item.category,
      value: item.value,
      sourceText: null,
      reason: item.reason,
      confidence: null,
    })),
  );
  const hit = matchesBlocklist(trimmed, blocklist);
  if (hit) {
    return {
      ok: false,
      message:
        'This value repeats information that was removed because it identifies the supplier. It cannot be printed on the Color Metal label.',
    };
  }
  return OK;
}
