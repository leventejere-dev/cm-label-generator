/** Immutable edit operations on the reviewed extraction data. */

import {
  slugifyKey,
  type AdditionalField,
  type ExtractionResult,
  type FieldMap,
} from '../../domain/extraction';
import type { FieldGroupId } from '../../domain/fields';

export function setStandardField(
  data: ExtractionResult,
  group: FieldGroupId,
  key: string,
  value: string,
): ExtractionResult {
  const current = (data[group] as FieldMap)[key] ?? null;
  const trimmed = value;
  const next: FieldMap = { ...(data[group] as FieldMap) };
  next[key] =
    trimmed.trim().length === 0
      ? null
      : { value: trimmed, confidence: current?.confidence ?? null, sourceText: current?.sourceText ?? null };
  return { ...data, [group]: next };
}

export function ensureStandardField(
  data: ExtractionResult,
  group: FieldGroupId,
  key: string,
): ExtractionResult {
  const map = data[group] as FieldMap;
  if (map[key]) return data;
  return { ...data, [group]: { ...map, [key]: { value: '', confidence: null, sourceText: null } } };
}

export function clearStandardField(
  data: ExtractionResult,
  group: FieldGroupId,
  key: string,
): ExtractionResult {
  const map = { ...(data[group] as FieldMap) };
  map[key] = null;
  return { ...data, [group]: map };
}

export function setAdditionalValue(
  data: ExtractionResult,
  index: number,
  value: string,
): ExtractionResult {
  const list = data.additionalFields.slice();
  const current = list[index];
  if (!current) return data;
  list[index] = { ...current, value };
  return { ...data, additionalFields: list };
}

export function setAdditionalLabel(
  data: ExtractionResult,
  index: number,
  label: string,
): ExtractionResult {
  const list = data.additionalFields.slice();
  const current = list[index];
  if (!current) return data;
  list[index] = { ...current, label };
  return { ...data, additionalFields: list };
}

export function removeAdditional(data: ExtractionResult, index: number): ExtractionResult {
  const list = data.additionalFields.slice();
  list.splice(index, 1);
  return { ...data, additionalFields: list };
}

export function addAdditional(
  data: ExtractionResult,
  label: string,
  group: FieldGroupId | 'additional' = 'additional',
): { data: ExtractionResult; index: number } {
  const existing = new Set(data.additionalFields.map((field) => field.key));
  let key = slugifyKey(label);
  let n = 2;
  while (existing.has(key)) key = `${slugifyKey(label)}_${n++}`;

  const field: AdditionalField = {
    key,
    label: label.trim(),
    group,
    value: '',
    confidence: null,
    sourceText: null,
  };
  return {
    data: { ...data, additionalFields: [...data.additionalFields, field] },
    index: data.additionalFields.length,
  };
}

/** Fields whose value is empty are dropped before the label is generated. */
export function stripEmptyFields(data: ExtractionResult): ExtractionResult {
  const next = { ...data };
  for (const group of ['product', 'quantity', 'traceability', 'dates', 'commercial'] as const) {
    const map = { ...(next[group] as FieldMap) };
    for (const [key, field] of Object.entries(map)) {
      if (field && field.value.trim().length === 0) map[key] = null;
    }
    next[group] = map;
  }
  next.additionalFields = next.additionalFields.filter(
    (field) => field.value.trim().length > 0 && field.label.trim().length > 0,
  );
  return next;
}
