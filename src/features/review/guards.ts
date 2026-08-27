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
  if (!trimmed) return { ok: false, message: 'Dă un nume câmpului.' };
  if (trimmed.length > 60) return { ok: false, message: 'Numele câmpului trebuie să aibă sub 60 de caractere.' };
  if (isSupplierIdentifyingCaption(trimmed)) {
    return {
      ok: false,
      message:
        'Acest nume de câmp ar identifica furnizorul, așa că nu poate apărea pe o etichetă Color Metal. Folosește un nume neutru, pentru datele produsului.',
    };
  }
  return OK;
}

export function checkValue(value: string, removed: RemovedItem[]): GuardVerdict {
  const trimmed = value.trim();
  if (!trimmed) return OK;
  if (trimmed.length > 300) return { ok: false, message: 'Valoarea este prea lungă pentru un câmp de etichetă.' };
  if (isColorMetal(trimmed)) return OK;

  if (looksLikeContactDetail(trimmed)) {
    return {
      ok: false,
      message:
        'Adresele de e-mail, site-urile și numerele de telefon nu se tipăresc pe etichetele Color Metal.',
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
        'Această valoare repetă o informație eliminată pentru că identifică furnizorul. Nu poate fi tipărită pe eticheta Color Metal.',
    };
  }
  return OK;
}
