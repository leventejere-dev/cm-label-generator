/**
 * EXTRACTION DATA MODEL + TOLERANT SCHEMA VALIDATION
 * ---------------------------------------------------------------------------
 * The AI returns JSON. Models occasionally return *nearly* the right shape:
 * a bare string instead of a {value,confidence} object, a number instead of a
 * string, an unexpected key inside a group, `"null"` as a string, and so on.
 *
 * Rather than rejecting the whole response we run it through a tolerant
 * normaliser that:
 *   • coerces the accepted variants into the canonical shape
 *   • harvests unknown keys into additionalFields[] instead of dropping them
 *   • records a machine-readable warning whenever it had to intervene
 *
 * SAFETY RULE (see README "material safety rule"): numeric values are always
 * carried as STRINGS so that "0.80" never silently becomes "0.8". If the model
 * sends a JSON number anyway we coerce it AND raise a warning so the reviewer
 * is told to check the value against the photo.
 */

import { z } from 'zod';
import {
  FIELD_GROUPS,
  type FieldGroupId,
  fieldKeysInGroup,
  humanLabel,
} from './fields';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FieldValue {
  /** Always a string — exact characters as printed on the label. */
  value: string;
  /** 0..1, or null when the provider gives no per-field confidence. */
  confidence: number | null;
  /** The literal text the model read this from, when available. */
  sourceText: string | null;
}

export type FieldMap = Record<string, FieldValue | null>;

export interface AdditionalField extends FieldValue {
  /** Stable key, slugified from the printed caption. */
  key: string;
  /** Caption as printed on the supplier label (may be non-English). */
  label: string;
  /** Which A4 section it should be printed under. */
  group: FieldGroupId | 'additional';
}

export const SENSITIVE_CATEGORIES = [
  'supplier_name',
  'supplier_logo',
  'supplier_address',
  'supplier_contact',
  'supplier_website',
  'supplier_email',
  'supplier_phone',
  'supplier_branding',
  'supplier_reference',
  'supplier_marketing',
  'other',
] as const;
export type SensitiveCategory = (typeof SENSITIVE_CATEGORIES)[number];

export interface SensitiveItem {
  category: SensitiveCategory;
  /** The offending text. Kept for internal verification only — never printed. */
  value: string;
  sourceText: string | null;
  reason: string;
  confidence: number | null;
}

export const WARNING_SEVERITIES = ['info', 'warning', 'error'] as const;
export type WarningSeverity = (typeof WARNING_SEVERITIES)[number];

export interface ExtractionWarning {
  code: string;
  message: string;
  severity: WarningSeverity;
  /** Optional pointer such as "product.thickness". */
  path?: string;
}

export interface DetectedCodes {
  /** How many 1D barcodes were visible. Content is deliberately NOT decoded. */
  barcodes: number;
  /** How many QR / datamatrix codes were visible. */
  qrCodes: number;
  note: string | null;
}

export const DOCUMENT_TYPES = [
  'material_label',
  'packing_list',
  'delivery_note',
  'certificate',
  'other',
  'unreadable',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export interface ExtractionResult {
  documentType: DocumentType;
  detectedLanguage: string | null;
  /** Color Metal's own delivery details — filled in by the employee, never by the model. */
  delivery: FieldMap;
  product: FieldMap;
  quantity: FieldMap;
  traceability: FieldMap;
  dates: FieldMap;
  commercial: FieldMap;
  additionalFields: AdditionalField[];
  sensitiveSupplierInformation: SensitiveItem[];
  codes: DetectedCodes;
  warnings: ExtractionWarning[];
  overallConfidence: number | null;
}

// ---------------------------------------------------------------------------
// Confidence bands
// ---------------------------------------------------------------------------

export type ConfidenceBand = 'high' | 'medium' | 'low' | 'unknown';

export const CONFIDENCE_THRESHOLDS = { high: 0.9, medium: 0.7 } as const;

export function confidenceBand(confidence: number | null | undefined): ConfidenceBand {
  if (confidence === null || confidence === undefined || Number.isNaN(confidence)) return 'unknown';
  if (confidence >= CONFIDENCE_THRESHOLDS.high) return 'high';
  if (confidence >= CONFIDENCE_THRESHOLDS.medium) return 'medium';
  return 'low';
}

/** Fields the reviewer should look at before printing. */
export function needsReview(confidence: number | null | undefined): boolean {
  const band = confidenceBand(confidence);
  return band === 'low' || band === 'medium';
}

// ---------------------------------------------------------------------------
// Zod schema (permissive on input, strict on output)
// ---------------------------------------------------------------------------

/** Strings a model uses to mean "nothing here". */
const NULLISH = new Set(['', '-', '--', 'n/a', 'na', 'null', 'none', 'undefined', 'not specified', 'not available', '?']);

function isNullish(raw: string): boolean {
  return NULLISH.has(raw.trim().toLowerCase());
}

const rawFieldValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.undefined(),
  z
    .object({
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
      confidence: z.union([z.number(), z.string(), z.null()]).optional(),
      sourceText: z.union([z.string(), z.null()]).optional(),
      source_text: z.union([z.string(), z.null()]).optional(),
    })
    .passthrough(),
]);

type RawFieldValue = z.infer<typeof rawFieldValue>;

const rawAdditionalField = z
  .object({
    key: z.union([z.string(), z.null()]).optional(),
    name: z.union([z.string(), z.null()]).optional(),
    label: z.union([z.string(), z.null()]).optional(),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
    confidence: z.union([z.number(), z.string(), z.null()]).optional(),
    sourceText: z.union([z.string(), z.null()]).optional(),
    source_text: z.union([z.string(), z.null()]).optional(),
    group: z.union([z.string(), z.null()]).optional(),
  })
  .passthrough();

const rawSensitiveItem = z.union([
  z.string(),
  z
    .object({
      category: z.union([z.string(), z.null()]).optional(),
      type: z.union([z.string(), z.null()]).optional(),
      value: z.union([z.string(), z.number(), z.null()]).optional(),
      text: z.union([z.string(), z.null()]).optional(),
      reason: z.union([z.string(), z.null()]).optional(),
      sourceText: z.union([z.string(), z.null()]).optional(),
      source_text: z.union([z.string(), z.null()]).optional(),
      confidence: z.union([z.number(), z.string(), z.null()]).optional(),
    })
    .passthrough(),
]);

const rawWarning = z.union([
  z.string(),
  z
    .object({
      code: z.union([z.string(), z.null()]).optional(),
      message: z.union([z.string(), z.null()]).optional(),
      severity: z.union([z.string(), z.null()]).optional(),
      path: z.union([z.string(), z.null()]).optional(),
    })
    .passthrough(),
]);

/** The permissive envelope we accept from any provider. */
export const RawExtractionSchema = z
  .object({
    documentType: z.union([z.string(), z.null()]).optional(),
    document_type: z.union([z.string(), z.null()]).optional(),
    detectedLanguage: z.union([z.string(), z.null()]).optional(),
    detected_language: z.union([z.string(), z.null()]).optional(),
    delivery: z.record(rawFieldValue).nullish(),
    product: z.record(rawFieldValue).nullish(),
    quantity: z.record(rawFieldValue).nullish(),
    traceability: z.record(rawFieldValue).nullish(),
    dates: z.record(rawFieldValue).nullish(),
    commercial: z.record(rawFieldValue).nullish(),
    additionalFields: z.array(rawAdditionalField).nullish(),
    additional_fields: z.array(rawAdditionalField).nullish(),
    sensitiveSupplierInformation: z.array(rawSensitiveItem).nullish(),
    sensitive_supplier_information: z.array(rawSensitiveItem).nullish(),
    codes: z
      .object({
        barcodes: z.union([z.number(), z.string(), z.null()]).optional(),
        qrCodes: z.union([z.number(), z.string(), z.null()]).optional(),
        qr_codes: z.union([z.number(), z.string(), z.null()]).optional(),
        note: z.union([z.string(), z.null()]).optional(),
      })
      .passthrough()
      .nullish(),
    warnings: z.array(rawWarning).nullish(),
    overallConfidence: z.union([z.number(), z.string(), z.null()]).optional(),
    overall_confidence: z.union([z.number(), z.string(), z.null()]).optional(),
  })
  .passthrough();

export type RawExtraction = z.infer<typeof RawExtractionSchema>;

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

function toConfidence(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  const num = typeof input === 'number' ? input : Number.parseFloat(String(input));
  if (!Number.isFinite(num)) return null;
  // Some models answer 0-100 instead of 0-1.
  const scaled = num > 1 && num <= 100 ? num / 100 : num;
  return Math.min(1, Math.max(0, Number(scaled.toFixed(3))));
}

interface NormaliseContext {
  warnings: ExtractionWarning[];
}

function normaliseFieldValue(
  raw: RawFieldValue,
  path: string,
  ctx: NormaliseContext,
): FieldValue | null {
  if (raw === null || raw === undefined) return null;

  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    if (typeof raw === 'number') {
      ctx.warnings.push({
        code: 'NUMERIC_VALUE_COERCED',
        severity: 'warning',
        path,
        message: `„${path}” a venit ca număr JSON; zerourile de la final se pot pierde. Verifică valoarea pe fotografie.`,
      });
    }
    const text = String(raw).trim();
    if (isNullish(text)) return null;
    return { value: text, confidence: null, sourceText: null };
  }

  const value = raw.value;
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    ctx.warnings.push({
      code: 'NUMERIC_VALUE_COERCED',
      severity: 'warning',
      path,
      message: `„${path}” a venit ca număr JSON; zerourile de la final se pot pierde. Verifică valoarea pe fotografie.`,
    });
  }
  const text = String(value).trim();
  if (isNullish(text)) return null;

  return {
    value: text,
    confidence: toConfidence(raw.confidence),
    sourceText: normaliseOptionalString(raw.sourceText ?? raw.source_text),
  };
}

function normaliseOptionalString(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  return trimmed.length === 0 || isNullish(trimmed) ? null : trimmed;
}

export function slugifyKey(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return slug.length > 0 ? slug.slice(0, 64) : 'field';
}

function normaliseGroup(
  raw: Record<string, RawFieldValue> | null | undefined,
  group: FieldGroupId,
  ctx: NormaliseContext,
  harvested: AdditionalField[],
): FieldMap {
  const known = new Set(fieldKeysInGroup(group));
  const out: FieldMap = {};
  for (const key of known) out[key] = null;

  if (!raw) return out;

  for (const [key, value] of Object.entries(raw)) {
    const path = `${group}.${key}`;
    const normalised = normaliseFieldValue(value, path, ctx);
    if (known.has(key)) {
      out[key] = normalised;
      continue;
    }
    // Unknown key inside a known group: keep it rather than lose data.
    if (normalised) {
      harvested.push({
        key: slugifyKey(key),
        label: humanLabel(key),
        group,
        ...normalised,
      });
    }
  }
  return out;
}

function normaliseSensitive(raw: z.infer<typeof rawSensitiveItem>[] | null | undefined): SensitiveItem[] {
  if (!raw) return [];
  const out: SensitiveItem[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const value = item.trim();
      if (!value || isNullish(value)) continue;
      out.push({
        category: 'other',
        value,
        sourceText: null,
        reason: 'Semnalat de modelul de analiză ca informație care identifică furnizorul.',
        confidence: null,
      });
      continue;
    }
    const value = normaliseOptionalString(item.value != null ? String(item.value) : null) ??
      normaliseOptionalString(item.text);
    if (!value) continue;
    const rawCategory = (item.category ?? item.type ?? 'other') as string;
    const category = (SENSITIVE_CATEGORIES as readonly string[]).includes(rawCategory)
      ? (rawCategory as SensitiveCategory)
      : guessCategory(rawCategory);
    out.push({
      category,
      value,
      sourceText: normaliseOptionalString(item.sourceText ?? item.source_text),
      reason:
        normaliseOptionalString(item.reason) ??
        'Semnalat de modelul de analiză ca informație care identifică furnizorul.',
      confidence: toConfidence(item.confidence),
    });
  }
  return out;
}

function guessCategory(raw: string): SensitiveCategory {
  const lowered = raw.toLowerCase();
  if (lowered.includes('logo')) return 'supplier_logo';
  if (lowered.includes('address')) return 'supplier_address';
  if (lowered.includes('mail')) return 'supplier_email';
  if (lowered.includes('phone') || lowered.includes('tel') || lowered.includes('fax')) return 'supplier_phone';
  if (lowered.includes('web') || lowered.includes('url') || lowered.includes('site')) return 'supplier_website';
  if (lowered.includes('brand')) return 'supplier_branding';
  if (lowered.includes('market')) return 'supplier_marketing';
  if (lowered.includes('contact')) return 'supplier_contact';
  if (lowered.includes('name') || lowered.includes('supplier') || lowered.includes('manufact')) return 'supplier_name';
  if (lowered.includes('ref')) return 'supplier_reference';
  return 'other';
}

function normaliseWarnings(raw: z.infer<typeof rawWarning>[] | null | undefined): ExtractionWarning[] {
  if (!raw) return [];
  const out: ExtractionWarning[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const message = item.trim();
      if (!message) continue;
      out.push({ code: 'MODEL_WARNING', message, severity: 'warning' });
      continue;
    }
    const message = normaliseOptionalString(item.message) ?? normaliseOptionalString(item.code);
    if (!message) continue;
    const severity = (WARNING_SEVERITIES as readonly string[]).includes(String(item.severity))
      ? (item.severity as WarningSeverity)
      : 'warning';
    const warning: ExtractionWarning = {
      code: normaliseOptionalString(item.code) ?? 'MODEL_WARNING',
      message,
      severity,
    };
    const path = normaliseOptionalString(item.path);
    if (path) warning.path = path;
    out.push(warning);
  }
  return out;
}

function normaliseCount(input: unknown): number {
  const num = typeof input === 'number' ? input : Number.parseInt(String(input ?? ''), 10);
  return Number.isFinite(num) && num > 0 ? Math.min(50, Math.trunc(num)) : 0;
}

export function emptyExtractionResult(): ExtractionResult {
  const groups = Object.fromEntries(
    FIELD_GROUPS.map((group) => [
      group,
      Object.fromEntries(fieldKeysInGroup(group).map((key) => [key, null])),
    ]),
  ) as Record<FieldGroupId, FieldMap>;

  return {
    documentType: 'material_label',
    detectedLanguage: null,
    delivery: groups.delivery,
    product: groups.product,
    quantity: groups.quantity,
    traceability: groups.traceability,
    dates: groups.dates,
    commercial: groups.commercial,
    additionalFields: [],
    sensitiveSupplierInformation: [],
    codes: { barcodes: 0, qrCodes: 0, note: null },
    warnings: [],
    overallConfidence: null,
  };
}

export interface ParseOutcome {
  ok: boolean;
  result: ExtractionResult;
  /** Populated when the payload could not be understood at all. */
  fatalError?: string;
}

/**
 * Parse anything a provider returned into a canonical ExtractionResult.
 * Never throws — a malformed response degrades into an empty result plus an
 * error-level warning, so the reviewer can still enter the data by hand.
 */
export function parseExtraction(input: unknown): ParseOutcome {
  const parsed = RawExtractionSchema.safeParse(input);
  if (!parsed.success) {
    const result = emptyExtractionResult();
    result.documentType = 'unreadable';
    result.warnings.push({
      code: 'SCHEMA_VALIDATION_FAILED',
      severity: 'error',
      message:
        'Serviciul de analiză a returnat datele într-un format neașteptat. Nu s-a completat nimic automat — refă fotografia sau introdu valorile manual.',
    });
    return { ok: false, result, fatalError: parsed.error.issues[0]?.message ?? 'Invalid payload' };
  }

  const raw = parsed.data;
  const ctx: NormaliseContext = { warnings: [] };
  const harvested: AdditionalField[] = [];

  const delivery = normaliseGroup(raw.delivery, 'delivery', ctx, harvested);
  const product = normaliseGroup(raw.product, 'product', ctx, harvested);
  const quantity = normaliseGroup(raw.quantity, 'quantity', ctx, harvested);
  const traceability = normaliseGroup(raw.traceability, 'traceability', ctx, harvested);
  const dates = normaliseGroup(raw.dates, 'dates', ctx, harvested);
  const commercial = normaliseGroup(raw.commercial, 'commercial', ctx, harvested);

  const additionalRaw = raw.additionalFields ?? raw.additional_fields ?? [];
  const additionalFields: AdditionalField[] = [];
  for (const [index, item] of additionalRaw.entries()) {
    const value = item.value;
    if (value === null || value === undefined) continue;
    if (typeof value === 'number') {
      ctx.warnings.push({
        code: 'NUMERIC_VALUE_COERCED',
        severity: 'warning',
        path: `additionalFields[${index}]`,
        message:
          'Un câmp suplimentar a venit ca număr JSON; zerourile de la final se pot pierde. Verifică valoarea pe fotografie.',
      });
    }
    const text = String(value).trim();
    if (!text || isNullish(text)) continue;
    const label =
      normaliseOptionalString(item.label) ??
      normaliseOptionalString(item.name) ??
      normaliseOptionalString(item.key) ??
      'Câmp suplimentar';
    const key = slugifyKey(normaliseOptionalString(item.key) ?? label);
    const groupCandidate = normaliseOptionalString(item.group);
    const group: FieldGroupId | 'additional' =
      groupCandidate && (FIELD_GROUPS as readonly string[]).includes(groupCandidate)
        ? (groupCandidate as FieldGroupId)
        : 'additional';
    additionalFields.push({
      key,
      label,
      group,
      value: text,
      confidence: toConfidence(item.confidence),
      sourceText: normaliseOptionalString(item.sourceText ?? item.source_text),
    });
  }

  // Merge harvested unknown-group keys, avoiding duplicate keys.
  const seenKeys = new Set(additionalFields.map((f) => f.key));
  for (const item of harvested) {
    let key = item.key;
    let n = 2;
    while (seenKeys.has(key)) key = `${item.key}_${n++}`;
    seenKeys.add(key);
    additionalFields.push({ ...item, key });
  }

  const documentTypeRaw = normaliseOptionalString(raw.documentType ?? raw.document_type);
  const documentType: DocumentType = (DOCUMENT_TYPES as readonly string[]).includes(
    documentTypeRaw ?? '',
  )
    ? (documentTypeRaw as DocumentType)
    : 'material_label';

  const result: ExtractionResult = {
    documentType,
    detectedLanguage: normaliseOptionalString(raw.detectedLanguage ?? raw.detected_language),
    delivery,
    product,
    quantity,
    traceability,
    dates,
    commercial,
    additionalFields,
    sensitiveSupplierInformation: normaliseSensitive(
      raw.sensitiveSupplierInformation ?? raw.sensitive_supplier_information,
    ),
    codes: {
      barcodes: normaliseCount(raw.codes?.barcodes),
      qrCodes: normaliseCount(raw.codes?.qrCodes ?? raw.codes?.qr_codes),
      note: normaliseOptionalString(raw.codes?.note),
    },
    warnings: [...normaliseWarnings(raw.warnings), ...ctx.warnings],
    overallConfidence: toConfidence(raw.overallConfidence ?? raw.overall_confidence),
  };

  return { ok: true, result };
}

/** Count of populated standard + additional fields — used for empty-result detection. */
export function countPopulatedFields(result: ExtractionResult): number {
  let count = 0;
  for (const group of FIELD_GROUPS) {
    for (const value of Object.values(result[group])) if (value) count += 1;
  }
  return count + result.additionalFields.length;
}

/** Deep clone that is safe for our plain-JSON model (used before editing). */
export function cloneExtraction(result: ExtractionResult): ExtractionResult {
  return JSON.parse(JSON.stringify(result)) as ExtractionResult;
}
