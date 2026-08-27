/**
 * "COLOR METALIZATION" — SUPPLIER-IDENTITY SUPPRESSION
 * ---------------------------------------------------------------------------
 * The single most important rule of this application: nothing that identifies
 * the upstream supplier may reach the customer-facing A4 label.
 *
 * Three independent layers, deliberately redundant:
 *
 *   1. MODEL LAYER   the extraction prompt asks the model to place anything
 *                    supplier-identifying in `sensitiveSupplierInformation[]`
 *                    instead of in the product fields.
 *   2. RULE LAYER    (this file) a deterministic pass that removes fields whose
 *                    *caption* names a supplier role, whose *value* matches a
 *                    value the model already flagged, or that look like contact
 *                    details — regardless of what the model decided.
 *   3. RENDER GUARD  `assertNoSupplierLeak()` re-scans the finished label text
 *                    right before printing and drops anything that slipped
 *                    through.
 *
 * Counter-rule, equally important: do NOT delete valid product data out of
 * caution. Anything uncertain is *kept* and *flagged for review* instead of
 * being silently dropped. Color Metal's own details (it is the CUSTOMER on these
 * labels, never the supplier) are explicitly protected.
 */

import {
  type AdditionalField,
  type ExtractionResult,
  type ExtractionWarning,
  type FieldMap,
  type SensitiveCategory,
  type SensitiveItem,
  cloneExtraction,
} from './extraction';
import { FIELD_GROUPS, type FieldGroupId, humanLabel } from './fields';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * Captions that name the SUPPLIER role, in the languages that actually turn up
 * on European material labels. Matched against the field caption/key only —
 * never against a value, so the finish "Mill" is never mistaken for "mill name".
 */
const SUPPLIER_ROLE_PATTERNS: RegExp[] = [
  /\bsupplier\b/i,
  /\bvendor\b/i,
  /\bmanufacturer\b/i,
  /\bmanufactured\s+by\b/i,
  /\bproducer\b/i,
  /\bproduced\s+by\b/i,
  /\bmade\s+by\b/i,
  /\bmade\s+in\s+plant\b/i,
  /\bproduction\s+(?:plant|site|facility|works)\b/i,
  /\b(?:rolling\s+)?mill\s*(?:name|no\.?|number|works|site)\b/i,
  /\bplant\s*(?:name|code|id)\b/i,
  /\bworks\s*(?:name|no\.?|number)\b/i,
  /\bshipper\b/i,
  /\bconsignor\b/i,
  /\bsold\s+by\b/i,
  /\bseller\b/i,
  // German
  /\bhersteller/i,
  /\blieferant/i,
  /\bwerk\b/i,
  /\bversender\b/i,
  // Italian
  /\bproduttore/i,
  /\bfornitore/i,
  /\bstabilimento\b/i,
  // French
  /\bfabricant/i,
  /\bfournisseur/i,
  /\busine\b/i,
  // Spanish / Portuguese
  /\bfabricante/i,
  /\bproveedor/i,
  /\bfornecedor/i,
  // Romanian
  /\bfurnizor/i,
  /\bproduc[aă]tor/i,
  // Hungarian
  /\bgy[aá]rt[oó]/i,
  /\bsz[aá]ll[ií]t[oó]/i,
  // Dutch / Nordic / Polish / Czech
  /\bleverancier/i,
  /\bfabrikant/i,
  /\btillverkare/i,
  /\bleverant[oö]r/i,
  /\bdostawca/i,
  /\bproducent/i,
  /\bv[yý]robce/i,
  /\bdodavatel/i,
  // Bulgarian / Cyrillic
  /производител/i,
  /доставчик/i,
];

/** Captions that carry contact/branding data — always dropped from the label. */
const CONTACT_KEY_PATTERNS: RegExp[] = [
  /\b(?:web\s*site|website|homepage|url|www)\b/i,
  /\be-?mail\b/i,
  /\b(?:tel|telephone|phone|mobile|fax|gsm)\b/i,
  /\bcontact\b/i,
  /\bhotline\b/i,
  /\bslogan\b/i,
  /\blogo\b/i,
  /\btrademark\b/i,
  /\bpacked\s+by\b/i,
  /\binspect(?:ed|or)\s+by\b/i,
  /\bcontrolled\s+by\b/i,
  /\boperator\b/i,
  /\bshift\s*(?:leader|no)\b/i,
];

/**
 * Captions that are safe even though they are company-related: on a supplier
 * label these describe COLOR METAL (the buyer), not the supplier.
 */
const CUSTOMER_ROLE_PATTERNS: RegExp[] = [
  /\bcustomer\b/i,
  /\bclient\b/i,
  /\bbuyer\b/i,
  /\bship\s*-?\s*to\b/i,
  /\bsold\s*-?\s*to\b/i,
  /\bbill\s*-?\s*to\b/i,
  /\bdeliver(?:y)?\s*(?:to|address)\b/i,
  /\bconsignee\b/i,
  /\bdestination\b/i,
  /\bkunde\b/i,
  /\bempf[aä]nger\b/i,
  /\bcliente\b/i,
  /\bdestinatar/i,
  /\bcump[aă]r[aă]tor/i,
  /\bbeneficiar/i,
];

/** Values that are unmistakably contact details, whatever the caption says. */
const CONTACT_VALUE_PATTERNS: RegExp[] = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, // e-mail
  /\b(?:https?:\/\/|www\.)[^\s]+/i, // url
  /\b[a-z0-9-]+\.(?:com|net|org|eu|de|it|ro|bg|hu|pl|cz|fr|es|nl|tr|uk|at|ch|sk|si|rs|gr)\b/i, // bare domain
  /(?:\+|00)\d[\d\s().-]{7,}/, // international phone number
];

/** Color Metal itself — never treated as a supplier. */
const COLOR_METAL_PATTERNS: RegExp[] = [
  /\bcolou?r\s*[-–—]?\s*metal\b/i,
  /\bcolormetal\b/i,
  /\bcm\s*label\b/i,
];

/** Minimum token length before a value is matched against the supplier blocklist. */
const MIN_BLOCKLIST_TOKEN = 4;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RemovedItem {
  /** Where the decision came from. */
  source: 'model' | 'rule';
  category: SensitiveCategory;
  /** Dotted path of the removed field, or "-" for model-reported free text. */
  path: string;
  /** Caption as shown to the reviewer. */
  label: string;
  /** The removed text — internal verification only, never printed. */
  value: string;
  reason: string;
}

export interface SanitizeOutcome {
  /** Data that is safe to print. Same shape as the input. */
  safe: ExtractionResult;
  /** Everything held back, for the collapsed "Removed supplier information" panel. */
  removed: RemovedItem[];
  /** Extra warnings raised while sanitising. */
  warnings: ExtractionWarning[];
}

export function isColorMetal(value: string | null | undefined): boolean {
  if (!value) return false;
  return COLOR_METAL_PATTERNS.some((re) => re.test(value));
}

/**
 * Would putting this caption on a Color Metal label expose the supplier?
 * Used both by the sanitiser and by the review form, which refuses to let an
 * employee re-introduce supplier branding through "Add field" / "Rename field".
 */
export function isSupplierIdentifyingCaption(caption: string): boolean {
  const text = caption.trim();
  if (!text) return false;
  if (CUSTOMER_ROLE_PATTERNS.some((re) => re.test(text))) return false;
  return (
    SUPPLIER_ROLE_PATTERNS.some((re) => re.test(text)) ||
    CONTACT_KEY_PATTERNS.some((re) => re.test(text))
  );
}

/** Does the value itself look like contact/branding data? */
export function looksLikeContactDetail(value: string): boolean {
  return CONTACT_VALUE_PATTERNS.some((re) => re.test(value));
}

function normaliseForMatch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface SupplierBlocklist {
  /** Distinctive single words, matched on whole-word equality. */
  tokens: string[];
  /** Whole flagged values, matched as substrings (multi-word only). */
  phrases: string[];
}

/**
 * Build the matching vocabulary from model-flagged sensitive values.
 *
 * Matching is deliberately conservative in BOTH directions:
 *   • whole-word equality for single tokens, so a supplier called
 *     "Acciai Speciali Lombardi" never deletes the material "Acciaio inox"
 *   • prefix matching only for tokens of 7+ characters ("alcomet" still
 *     catches "ALCOMETAD"), where an accidental collision is implausible
 *   • substring matching only for multi-word phrases, which catches free text
 *     such as "Prodotto da Acciai Speciali Lombardi"
 * Generic industry words are stopworded out entirely.
 */
export function buildSupplierBlocklist(items: SensitiveItem[]): SupplierBlocklist {
  const STOPWORDS = new Set([
    'ltd', 'gmbh', 'srl', 'spa', 'sa', 'ag', 'bv', 'nv', 'plc', 'inc', 'llc', 'kft', 'zrt',
    'sp', 'zoo', 'as', 'oy', 'ab', 'ad', 'ood', 'eood', 'jsc', 'co', 'company', 'group',
    'street', 'strasse', 'str', 'road', 'via', 'bul', 'blvd', 'nr', 'no', 'the', 'and',
    'metal', 'metals', 'aluminium', 'aluminum', 'alu', 'steel', 'inox', 'industry',
    'industries', 'works', 'werke', 'werk', 'produkt', 'produkte', 'products',
  ]);
  const tokens = new Set<string>();
  const phrases = new Set<string>();

  for (const item of items) {
    const normalised = normaliseForMatch(item.value);
    if (normalised.includes(' ') && normalised.length >= 6) phrases.add(normalised);
    for (const token of normalised.split(' ')) {
      if (token.length < MIN_BLOCKLIST_TOKEN) continue;
      if (STOPWORDS.has(token)) continue;
      if (/^\d+$/.test(token)) continue;
      tokens.add(token);
    }
  }
  return { tokens: [...tokens], phrases: [...phrases] };
}

const PREFIX_MATCH_MIN = 7;

export function matchesBlocklist(value: string, blocklist: SupplierBlocklist): string | null {
  if (blocklist.tokens.length === 0 && blocklist.phrases.length === 0) return null;
  const normalised = normaliseForMatch(value);
  if (!normalised) return null;

  for (const phrase of blocklist.phrases) {
    if (normalised.includes(phrase)) return phrase;
  }

  const words = normalised.split(' ');
  for (const token of blocklist.tokens) {
    for (const word of words) {
      if (word === token) return token;
      if (token.length >= PREFIX_MATCH_MIN && word.startsWith(token)) return token;
    }
  }
  return null;
}

interface Verdict {
  remove: boolean;
  category: SensitiveCategory;
  reason: string;
}

function judge(caption: string, value: string, blocklist: SupplierBlocklist): Verdict {
  // 1. Color Metal is the customer. Never remove it.
  if (isColorMetal(value) || isColorMetal(caption)) {
    return { remove: false, category: 'other', reason: '' };
  }

  // 2. Caption names a supplier role.
  const captionIsCustomerRole = CUSTOMER_ROLE_PATTERNS.some((re) => re.test(caption));
  if (!captionIsCustomerRole && SUPPLIER_ROLE_PATTERNS.some((re) => re.test(caption))) {
    return {
      remove: true,
      category: 'supplier_name',
      reason: 'The field caption names the supplier / manufacturer role.',
    };
  }

  // 3. Caption is contact or branding data (supplier's, in practice).
  if (CONTACT_KEY_PATTERNS.some((re) => re.test(caption))) {
    return {
      remove: true,
      category: 'supplier_contact',
      reason: 'Contact or branding information does not belong on a Color Metal label.',
    };
  }

  // 4. Value looks like contact details wherever it came from.
  if (looksLikeContactDetail(value)) {
    return {
      remove: true,
      category: 'supplier_contact',
      reason: 'The value looks like an e-mail address, website or telephone number.',
    };
  }

  // 5. Value repeats something the model already flagged as supplier-identifying.
  const hit = matchesBlocklist(value, blocklist);
  if (hit) {
    return {
      remove: true,
      category: 'supplier_name',
      reason: `The value contains "${hit}", which was identified as supplier information.`,
    };
  }

  return { remove: false, category: 'other', reason: '' };
}

/**
 * Run the deterministic supplier-suppression pass.
 * Pure function: the input is never mutated.
 */
export function colorMetalize(input: ExtractionResult): SanitizeOutcome {
  const safe = cloneExtraction(input);
  const removed: RemovedItem[] = [];
  const warnings: ExtractionWarning[] = [];

  // Layer 1 — everything the model flagged is removed outright.
  for (const item of safe.sensitiveSupplierInformation) {
    removed.push({
      source: 'model',
      category: item.category,
      path: '-',
      label: categoryLabel(item.category),
      value: item.value,
      reason: item.reason,
    });
  }

  const blocklist = buildSupplierBlocklist(safe.sensitiveSupplierInformation);

  // The flagged values now live only in `removed`, which the review panel shows
  // read-only. Clearing them here means the printable data object never carries
  // supplier identity at all — not into the database, not into the label, not
  // into an export.
  safe.sensitiveSupplierInformation = [];

  // Layer 2 — deterministic rules over every standard field.
  for (const group of FIELD_GROUPS) {
    const map = safe[group] as FieldMap;
    for (const [key, field] of Object.entries(map)) {
      if (!field) continue;
      const caption = `${key} ${humanLabel(key)}`;
      const verdict = judge(caption, field.value, blocklist);
      if (!verdict.remove) continue;
      removed.push({
        source: 'rule',
        category: verdict.category,
        path: `${group}.${key}`,
        label: humanLabel(key),
        value: field.value,
        reason: verdict.reason,
      });
      map[key] = null;
    }
  }

  // Layer 2 — and over every ad-hoc field.
  const keptAdditional: AdditionalField[] = [];
  for (const field of safe.additionalFields) {
    const caption = `${field.key} ${field.label}`;
    const verdict = judge(caption, field.value, blocklist);
    if (verdict.remove) {
      removed.push({
        source: 'rule',
        category: verdict.category,
        path: `additionalFields.${field.key}`,
        label: field.label,
        value: field.value,
        reason: verdict.reason,
      });
      continue;
    }
    keptAdditional.push(field);
  }
  safe.additionalFields = keptAdditional;

  // Advisory warnings.
  if (safe.codes.qrCodes > 0 || safe.codes.barcodes > 0) {
    warnings.push({
      code: 'SOURCE_CODES_NOT_COPIED',
      severity: 'info',
      message: `The supplier label contains ${describeCodes(safe.codes.qrCodes, safe.codes.barcodes)}. They are deliberately not reproduced — they may encode supplier data.`,
    });
  }
  if (removed.length > 0) {
    warnings.push({
      code: 'SUPPLIER_INFORMATION_REMOVED',
      severity: 'info',
      message: `${removed.length} item${removed.length === 1 ? '' : 's'} of supplier information were excluded from the Color Metal label.`,
    });
  }

  return { safe, removed, warnings };
}

function describeCodes(qr: number, barcodes: number): string {
  const parts: string[] = [];
  if (qr > 0) parts.push(`${qr} QR code${qr === 1 ? '' : 's'}`);
  if (barcodes > 0) parts.push(`${barcodes} barcode${barcodes === 1 ? '' : 's'}`);
  return parts.join(' and ');
}

export function categoryLabel(category: SensitiveCategory): string {
  const labels: Record<SensitiveCategory, string> = {
    supplier_name: 'Supplier name',
    supplier_logo: 'Supplier logo',
    supplier_address: 'Supplier address',
    supplier_contact: 'Supplier contact',
    supplier_website: 'Supplier website',
    supplier_email: 'Supplier e-mail',
    supplier_phone: 'Supplier telephone',
    supplier_branding: 'Supplier branding',
    supplier_reference: 'Supplier reference',
    supplier_marketing: 'Supplier marketing text',
    other: 'Supplier information',
  };
  return labels[category] ?? 'Supplier information';
}

/**
 * FINAL RENDER GUARD.
 * Re-scan already-composed label strings immediately before printing and drop
 * anything that still matches the supplier blocklist. Returns the surviving
 * entries plus a list of what it caught (which should normally be empty).
 */
export function assertNoSupplierLeak<T extends { label: string; value: string }>(
  rows: T[],
  removedItems: RemovedItem[],
): { rows: T[]; leaked: T[] } {
  const blocklist = buildSupplierBlocklist(
    removedItems.map((item) => ({
      category: item.category,
      value: item.value,
      sourceText: null,
      reason: item.reason,
      confidence: null,
    })),
  );
  if (blocklist.tokens.length === 0 && blocklist.phrases.length === 0) {
    return { rows, leaked: [] };
  }

  const kept: T[] = [];
  const leaked: T[] = [];
  for (const row of rows) {
    if (isColorMetal(row.value)) {
      kept.push(row);
      continue;
    }
    if (matchesBlocklist(row.value, blocklist) || matchesBlocklist(row.label, blocklist)) {
      leaked.push(row);
      continue;
    }
    kept.push(row);
  }
  return { rows: kept, leaked };
}

/** Groups the removed items by category for the review panel. */
export function groupRemoved(removed: RemovedItem[]): Array<{ category: SensitiveCategory; label: string; items: RemovedItem[] }> {
  const byCategory = new Map<SensitiveCategory, RemovedItem[]>();
  for (const item of removed) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  return [...byCategory.entries()].map(([category, items]) => ({
    category,
    label: categoryLabel(category),
    items,
  }));
}

export type { FieldGroupId };
