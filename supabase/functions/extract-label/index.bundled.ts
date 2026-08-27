// ---------------------------------------------------------------------------
// extract-label — SINGLE-FILE BUILD (GENERATED — do not edit here)
// ---------------------------------------------------------------------------
// The modular source is the canonical version and is far easier to read:
//
//   supabase/functions/_shared/prompt.ts          the extraction prompt
//   supabase/functions/_shared/schema.ts          the JSON schema
//   supabase/functions/_shared/validation.ts      request + response validation
//   supabase/functions/_shared/providers/*.ts     the vendor abstraction
//   supabase/functions/_shared/rateLimit.ts
//   supabase/functions/extract-label/index.ts
//
// This file exists because the Supabase dashboard deploys a single entrypoint.
// Regenerate:  node scripts/bundle-edge-function.mjs
// Or deploy the modular version:  supabase functions deploy extract-label
// ---------------------------------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';


// =========================================================================
// _shared/cors.ts
// =========================================================================
/**
 * CORS for the extraction endpoint.
 *
 * ALLOWED_ORIGINS (a comma-separated Edge Function secret) restricts which
 * sites may call the function, e.g.
 *   supabase secrets set ALLOWED_ORIGINS="https://acme.github.io,http://localhost:5173"
 * Leaving it unset allows any origin, which is convenient while developing but
 * should be tightened before the URL is shared widely.
 */

const FALLBACK_ORIGIN = '*';

function allowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS') ?? '';
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function resolveOrigin(request: Request): string {
  const origin = request.headers.get('origin');
  const allowed = allowedOrigins();
  if (allowed.length === 0) return FALLBACK_ORIGIN;
  if (origin && allowed.includes(origin)) return origin;
  return allowed[0] ?? FALLBACK_ORIGIN;
}

export function corsHeaders(request: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(request),
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-cm-app-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  });
}

export function errorResponse(
  request: Request,
  code: string,
  message: string,
  status = 400,
): Response {
  return jsonResponse(request, { ok: false, code, message }, status);
}


// =========================================================================
// _shared/prompt.ts
// =========================================================================
/**
 * THE EXTRACTION PROMPT
 * ---------------------------------------------------------------------------
 * This is the most important text in the project. It is what makes the system
 * work across suppliers instead of against one label template.
 *
 * NOTE: the standard field list is duplicated from src/domain/fields.ts because
 * Edge Functions run in Deno and cannot import from the Vite app. If you add a
 * standard field there, add it here too — the client tolerates extra keys (they
 * become additionalFields), so a mismatch degrades gracefully rather than
 * breaking.
 */

export const EXTRACTION_SYSTEM_PROMPT = `
You are a document-understanding system for Color Metal, a Romanian distributor of
semi-finished non-ferrous metal products (aluminium, copper, brass, bronze, stainless steel).

You are given ONE photograph of a material label that a SUPPLIER attached to delivered
material. Your job is to read the whole document semantically and return structured JSON.

=====================================================================
1. THESE LABELS ARE NOT STANDARDIZED
=====================================================================
Every supplier designs its own label. Never assume a fixed layout, fixed positions,
fixed captions or a fixed language. Read and understand the ENTIRE document: headers,
tables, free text, handwriting, stamps, and text printed sideways or upside down.

Captions appear in many languages. The same concept can be written as, for example:
  net weight  = Net Weight, Net Wt., Nettogewicht, Netto, Peso netto, Poids net,
                Greutate netă, Cantitate netă, Nettó tömeg, нето тегло
  alloy       = Alloy, Legierung, Lega, Alliage, Aliaj, Ötvözet, Grade, Quality
  temper      = Temper, Zustand, Stato, État, Stare, Condition, Hardness
  cast/heat   = Cast No., Heat No., Charge, Schmelze, Colata, Coulée, Șarjă
  pieces      = Pieces, Pcs, Stück, Pezzi, Bucăți, Db
A value may also sit in a table cell with the caption only in the column header, or be
embedded in a compound product code such as "500-0830/6060/T6/50/50/2/0/Mill-".

=====================================================================
2. PRECISION RULES — THIS IS TECHNICAL PRODUCT DATA
=====================================================================
- NEVER invent, complete or "correct" a value. If it is not readable, use null.
- Return every value as a STRING, exactly as printed. Do not return JSON numbers.
- Preserve the decimal separator exactly: "0,80" stays "0,80"; "0.80" stays "0.80".
- Preserve trailing zeros: "0.80" must never become "0.8".
- Preserve thousands separators as printed: "2.418" stays "2.418".
- Include the unit ONLY if it is actually visible for that value. If the label prints
  "Net Wt. 690" with no unit, return "690" — never "690 kg" — and add a warning with
  code UNIT_NOT_PRINTED.
- Distinguish GROSS from NET weight. If only one weight is printed and it is not
  labelled, put it in netWeight and warn with code AMBIGUOUS_VALUE.
- Distinguish thickness / width / length / diameter. Do not guess which is which from
  order alone; if the order is ambiguous, fill "dimensions" with the full string as
  printed, leave the individual fields null, and warn.
- Recognise alloy designations in any style: EN AW-5754, AW5754, 5754, 6060, AlMg3,
  CuZn37, AISI 304, 1.4301, EN AW-2024, 7075.
- Recognise tempers: T3, T4, T6, T651, T6511, H111, H14, H22, O, F, 2B, BA.
- Recognise identifiers: cast/heat/charge number, batch/lot number, coil number,
  pallet number, bundle/package number, certificate number, serial number.
- Recognise order references: purchase order, production order/contract, delivery note,
  customer reference, position/item number.
- Dates: return ISO yyyy-mm-dd when the format is unambiguous. If it is ambiguous
  (e.g. 05.06.2026 could be 5 June or 6 May), return the string exactly as printed and
  warn with code AMBIGUOUS_DATE.
- If a value is partly illegible, return the readable part, set a low confidence and warn.

=====================================================================
3. CUSTOMER VERSUS SUPPLIER — READ THIS TWICE
=====================================================================
The label was printed by the SUPPLIER. On it:
  • COLOR METAL (also written SC COLOR-METAL SRL, COLOR-METAL, Color Metal) is the
    CUSTOMER / buyer / ship-to / consignee. It is NEVER the supplier.
  • The SUPPLIER is the other company: the one whose logo, letterhead, branding,
    address, website, e-mail, telephone or "manufactured by" wording appears.

Color Metal's own details are NOT sensitive — keep them in the normal fields.
The supplier's details ARE sensitive — see section 4.

If you cannot tell which company is the supplier, do NOT guess it into a product field:
put it in sensitiveSupplierInformation with a low confidence and explain in "reason".

=====================================================================
4. SUPPLIER-IDENTIFYING INFORMATION
=====================================================================
Put EVERYTHING that could reveal where Color Metal bought this material into
sensitiveSupplierInformation[] — never into product/quantity/traceability fields:
  supplier or manufacturer company name; logo or brand mark (describe it, e.g.
  "ALCOMET logo, bottom left"); supplier address, plant, works or mill name;
  supplier website, e-mail, telephone, fax; supplier VAT or registration number;
  supplier marketing or slogan text; names of supplier employees ("Packed by: ...");
  supplier-internal document references that carry the supplier's name.

Do NOT be over-aggressive. Genuine product data must be kept even when you are unsure:
  • "Mill" as a surface finish is product data, not a mill name.
  • An alloy, standard or certificate number is product data.
  • A cast, heat, batch, coil or pallet number is product data, even though the supplier
    generated it — unless the supplier's NAME is embedded in it.
When unsure whether something is supplier-identifying, KEEP it in the normal fields,
set a lower confidence and add a warning. A human reviews everything before printing.

=====================================================================
5. BARCODES AND QR CODES
=====================================================================
Count how many barcodes and QR/DataMatrix codes are visible and report the counts in
"codes". Do NOT attempt to decode them and do NOT transcribe their content — they may
encode supplier information, and they are never reproduced on the Color Metal label.

=====================================================================
6. CONFIDENCE AND WARNINGS
=====================================================================
Every extracted value is an object: { "value": "...", "confidence": 0.0-1.0, "sourceText": "..." }
  • confidence  — how certain you are that this value is correct AND correctly assigned
                  to this field. Be honest: use < 0.7 whenever the caption was missing,
                  the text was faint, or you inferred the meaning from position.
  • sourceText  — the literal text you read it from, including the caption when visible.
Use null (not an object) when the field is genuinely absent from the label.

Add entries to warnings[] with these codes where applicable:
  UNIT_NOT_PRINTED, AMBIGUOUS_VALUE, AMBIGUOUS_DATE, TEXT_UNREADABLE,
  DECIMAL_SEPARATOR_PRESERVED, NO_LABEL_DETECTED, MULTIPLE_LABELS_DETECTED,
  INCOMPLETE_LABEL, UNSUPPORTED_DOCUMENT, HANDWRITING_PRESENT, LOW_IMAGE_QUALITY
Each warning is { "code": "...", "severity": "info"|"warning"|"error", "message": "...", "path": "group.field" }
Use severity "error" only for NO_LABEL_DETECTED, MULTIPLE_LABELS_DETECTED and
UNSUPPORTED_DOCUMENT, which stop the workflow.

If the photograph does not contain a material label at all, return documentType
"unreadable" (or the closest match), leave the fields null and emit an error warning.

=====================================================================
7. OUTPUT
=====================================================================
Return ONLY the JSON object. No explanation, no markdown, no code fences.

Standard field keys — use exactly these, and put anything else in additionalFields[]:
  product:      material, productType, profileType, alloy, temper, standard, finish,
                surfaceTreatment, dimensions, thickness, width, length, diameter,
                wallThickness
  quantity:     pieces, quantity, unit, netWeight, grossWeight, tareWeight, packages
  traceability: lotNumber, packageNumber, castNumber, heatNumber, batchNumber,
                coilNumber, palletNumber, bundleNumber, serialNumber, certificateNumber
  dates:        productionDate, packingDate, deliveryDate
  commercial:   customerPurchaseOrder, productionOrder, customerReference,
                deliveryNoteNumber, positionNumber, customerName, deliveryAddress

additionalFields[] entries are { "key", "label", "value", "confidence", "sourceText",
"group" } where "label" is the caption as printed on the label (keep the original
language) and "group" is one of product | quantity | traceability | dates | commercial |
additional.

Accuracy matters far more than completeness or prose. Work carefully.
`.trim();

/** Compact shape reminder appended to the user turn. */
export const OUTPUT_SHAPE_HINT = `
{
  "documentType": "material_label",
  "detectedLanguage": "en",
  "product": { "alloy": { "value": "6060", "confidence": 0.93, "sourceText": "…/6060/…" }, "material": null },
  "quantity": { "netWeight": { "value": "690", "confidence": 0.95, "sourceText": "Net Wt. 690" } },
  "traceability": { "castNumber": { "value": "11260716EU", "confidence": 0.94, "sourceText": "Cast No. 11260716EU" } },
  "dates": { "packingDate": { "value": "2026-06-05", "confidence": 0.96, "sourceText": "Packing Date 2026-06-05" } },
  "commercial": { "customerPurchaseOrder": { "value": "CC007055", "confidence": 0.96, "sourceText": "Purchase Order No. CC007055" } },
  "additionalFields": [
    { "key": "product_code", "label": "Product code", "value": "500-0830/6060/T6/50/50/2/0/Mill-", "confidence": 0.8, "sourceText": "500-0830/…", "group": "product" }
  ],
  "sensitiveSupplierInformation": [
    { "category": "supplier_logo", "value": "ALCOMET", "sourceText": "logo bottom left", "reason": "Supplier logo identifies the source of the material.", "confidence": 0.97 }
  ],
  "codes": { "barcodes": 0, "qrCodes": 1, "note": "One QR code beside the supplier logo; not decoded." },
  "warnings": [
    { "code": "UNIT_NOT_PRINTED", "severity": "warning", "path": "quantity.netWeight", "message": "Weights are printed without a unit." }
  ],
  "overallConfidence": 0.91
}
`.trim();

export const USER_INSTRUCTION = `
Analyse this photographed supplier material label and return the JSON object described in
your instructions. Read the entire image, including small print, table headers and any
handwriting. Return only JSON, matching this shape:

${OUTPUT_SHAPE_HINT}
`.trim();


// =========================================================================
// _shared/schema.ts
// =========================================================================
/**
 * JSON Schema for the extraction payload.
 * Used as an Anthropic tool `input_schema` (which forces schema-compliant JSON)
 * and, in a trimmed form, by providers that support JSON-schema response modes.
 *
 * Values are objects rather than plain strings on purpose: field-level
 * confidence and source text are what make the review screen useful.
 */

const fieldValue = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: {
    value: { type: ['string', 'null'], description: 'Exactly as printed. Never a JSON number.' },
    confidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
    sourceText: { type: ['string', 'null'] },
  },
  required: ['value'],
} as const;

function group(keys: readonly string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(keys.map((key) => [key, fieldValue])),
  };
}

export const PRODUCT_KEYS = [
  'material', 'productType', 'profileType', 'alloy', 'temper', 'standard', 'finish',
  'surfaceTreatment', 'dimensions', 'thickness', 'width', 'length', 'diameter',
  'wallThickness',
] as const;

export const QUANTITY_KEYS = [
  'pieces', 'quantity', 'unit', 'netWeight', 'grossWeight', 'tareWeight', 'packages',
] as const;

export const TRACEABILITY_KEYS = [
  'lotNumber', 'packageNumber', 'castNumber', 'heatNumber', 'batchNumber', 'coilNumber',
  'palletNumber', 'bundleNumber', 'serialNumber', 'certificateNumber',
] as const;

export const DATE_KEYS = ['productionDate', 'packingDate', 'deliveryDate'] as const;

export const COMMERCIAL_KEYS = [
  'customerPurchaseOrder', 'productionOrder', 'customerReference', 'deliveryNoteNumber',
  'positionNumber', 'customerName', 'deliveryAddress',
] as const;

export const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    documentType: {
      type: 'string',
      enum: ['material_label', 'packing_list', 'delivery_note', 'certificate', 'other', 'unreadable'],
    },
    detectedLanguage: { type: ['string', 'null'], description: 'ISO 639-1 code of the label language.' },
    product: group(PRODUCT_KEYS),
    quantity: group(QUANTITY_KEYS),
    traceability: group(TRACEABILITY_KEYS),
    dates: group(DATE_KEYS),
    commercial: group(COMMERCIAL_KEYS),
    additionalFields: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string' },
          label: { type: 'string', description: 'Caption as printed, in the original language.' },
          value: { type: 'string' },
          confidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
          sourceText: { type: ['string', 'null'] },
          group: {
            type: 'string',
            enum: ['product', 'quantity', 'traceability', 'dates', 'commercial', 'additional'],
          },
        },
        required: ['label', 'value'],
      },
    },
    sensitiveSupplierInformation: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: {
            type: 'string',
            enum: [
              'supplier_name', 'supplier_logo', 'supplier_address', 'supplier_contact',
              'supplier_website', 'supplier_email', 'supplier_phone', 'supplier_branding',
              'supplier_reference', 'supplier_marketing', 'other',
            ],
          },
          value: { type: 'string' },
          sourceText: { type: ['string', 'null'] },
          reason: { type: 'string' },
          confidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
        },
        required: ['category', 'value', 'reason'],
      },
    },
    codes: {
      type: 'object',
      additionalProperties: false,
      properties: {
        barcodes: { type: 'integer', minimum: 0 },
        qrCodes: { type: 'integer', minimum: 0 },
        note: { type: ['string', 'null'] },
      },
    },
    warnings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          code: { type: 'string' },
          severity: { type: 'string', enum: ['info', 'warning', 'error'] },
          message: { type: 'string' },
          path: { type: ['string', 'null'] },
        },
        required: ['code', 'severity', 'message'],
      },
    },
    overallConfidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
  },
  required: ['documentType', 'product', 'quantity', 'traceability', 'dates', 'commercial'],
} as const;

export const EXTRACTION_TOOL_NAME = 'emit_label_extraction';


// =========================================================================
// _shared/validation.ts
// =========================================================================
/**
 * Request and response validation for the extraction endpoint.
 *
 * Server-side responsibilities (the browser does the deep normalisation):
 *   • accept only well-formed requests and plausible image bytes
 *   • verify the image really is an image, by magic bytes, not by claim
 *   • parse whatever the model returned, repairing the usual code-fence wrapper
 *   • bound the payload so a hallucinating model cannot store megabytes of JSON
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // keep in sync with env.image.hardMaxBytes
export const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface ExtractRequest {
  imagePath?: string;
  imageBase64?: string;
  mimeType?: string;
  bucket?: string;
  hints?: string[];
  appVersion?: string;
}

export class RequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function parseRequest(body: unknown): ExtractRequest {
  if (typeof body !== 'object' || body === null) {
    throw new RequestError('BAD_REQUEST', 'The request body must be a JSON object.');
  }
  const input = body as Record<string, unknown>;

  const imagePath = typeof input.imagePath === 'string' ? input.imagePath.trim() : undefined;
  const imageBase64 = typeof input.imageBase64 === 'string' ? input.imageBase64 : undefined;

  if (!imagePath && !imageBase64) {
    throw new RequestError('BAD_REQUEST', 'Provide either imagePath or imageBase64.');
  }
  if (imagePath && !/^[A-Za-z0-9][A-Za-z0-9/_.-]{0,255}$/.test(imagePath)) {
    throw new RequestError('BAD_REQUEST', 'imagePath contains unexpected characters.');
  }
  if (imagePath && imagePath.includes('..')) {
    throw new RequestError('BAD_REQUEST', 'imagePath must not traverse directories.');
  }
  if (imageBase64 && imageBase64.length > MAX_IMAGE_BYTES * 1.4) {
    throw new RequestError('IMAGE_TOO_LARGE', 'The image exceeds the size limit.', 413);
  }

  const bucket = typeof input.bucket === 'string' ? input.bucket.trim() : undefined;
  if (bucket && !/^[a-z0-9][a-z0-9-]{1,62}$/.test(bucket)) {
    throw new RequestError('BAD_REQUEST', 'Invalid bucket name.');
  }

  const hints = Array.isArray(input.hints)
    ? input.hints.filter((hint): hint is string => typeof hint === 'string').slice(0, 5)
    : undefined;

  const result: ExtractRequest = {};
  if (imagePath) result.imagePath = imagePath;
  if (imageBase64) result.imageBase64 = imageBase64;
  if (typeof input.mimeType === 'string') result.mimeType = input.mimeType.toLowerCase().trim();
  if (bucket) result.bucket = bucket;
  if (hints?.length) result.hints = hints;
  if (typeof input.appVersion === 'string') result.appVersion = input.appVersion.slice(0, 64);
  return result;
}

/** Identify the image format from its magic bytes rather than trusting the caller. */
export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  const riff = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  const webp = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
  if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';
  return null;
}

export function assertImage(bytes: Uint8Array): string {
  if (bytes.byteLength === 0) {
    throw new RequestError('BAD_REQUEST', 'The image is empty.');
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new RequestError('IMAGE_TOO_LARGE', 'The image exceeds the size limit.', 413);
  }
  const mime = sniffImageMime(bytes);
  if (!mime || !ACCEPTED_MIME.includes(mime as (typeof ACCEPTED_MIME)[number])) {
    throw new RequestError(
      'UNSUPPORTED_MEDIA_TYPE',
      'Only JPEG, PNG and WebP images are accepted.',
      415,
    );
  }
  return mime;
}

/**
 * Parse the model's text answer into JSON, tolerating the two things models
 * actually do wrong: wrapping the object in a ```json fence, and adding a
 * sentence before or after it.
 */
export function parseModelJson(text: string): unknown {
  const trimmed = text.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    /* fall through to brace scanning */
  }

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      /* give up */
    }
  }
  throw new RequestError('AI_INVALID_JSON', 'The model did not return valid JSON.', 502);
}

const MAX_STRING = 600;
const MAX_ARRAY = 80;
const MAX_DEPTH = 8;

/**
 * Bound the payload before it is stored or returned: cap string lengths, array
 * lengths and nesting depth. Protects the database and the review UI from a
 * runaway response.
 */
export function boundPayload(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return null;
  if (typeof value === 'string') return value.length > MAX_STRING ? value.slice(0, MAX_STRING) : value;
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((item) => boundPayload(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (count >= 120) break;
      out[key.slice(0, 64)] = boundPayload(item, depth + 1);
      count += 1;
    }
    return out;
  }
  return null;
}

/** Minimal shape check: is this plausibly an extraction result at all? */
export function looksLikeExtraction(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = new Set(Object.keys(value));
  return (
    keys.has('product') ||
    keys.has('quantity') ||
    keys.has('traceability') ||
    keys.has('documentType') ||
    keys.has('additionalFields')
  );
}

/** Uint8Array -> base64 without blowing the call stack on large images. */
export function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const clean = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  const binary = atob(clean.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}


// =========================================================================
// _shared/providers/types.ts
// =========================================================================
/**
 * LabelExtractionProvider — the server-side vendor abstraction.
 *
 * Everything vendor-specific lives behind this interface. Adding a provider
 * means writing one file and registering it in ./index.ts; nothing else in the
 * function, and nothing at all in the frontend, changes.
 */

export interface ExtractionInput {
  imageBase64: string;
  mimeType: string;
  systemPrompt: string;
  userInstruction: string;
  /** Optional supplier-specific hints (reserved for a future feature). */
  hints?: string[];
  signal?: AbortSignal;
}

export interface ExtractionOutput {
  /** Parsed JSON exactly as the model produced it. */
  data: unknown;
  /** Diagnostics kept for troubleshooting (token counts, stop reason, ...). */
  raw: unknown;
  model: string;
}

export interface LabelExtractionProvider {
  readonly id: string;
  readonly model: string;
  extract(input: ExtractionInput): Promise<ExtractionOutput>;
}

export class ProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}


// =========================================================================
// _shared/providers/anthropic.ts
// =========================================================================
/**
 * Anthropic Claude — the default provider.
 *
 * Why: photographed technical documents with small multilingual print are the
 * case it is strongest at, and forced tool use gives schema-shaped JSON without
 * post-hoc repair. Temperature is 0 because this is extraction, not writing.
 */


const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-4-5';

export class AnthropicProvider implements LabelExtractionProvider {
  readonly id = 'anthropic';
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    model?: string,
  ) {
    this.model = model || ANTHROPIC_DEFAULT_MODEL;
  }

  async extract(input: ExtractionInput): Promise<ExtractionOutput> {
    const body = {
      model: this.model,
      max_tokens: 4096,
      temperature: 0,
      system: input.systemPrompt,
      tools: [
        {
          name: EXTRACTION_TOOL_NAME,
          description:
            'Return the structured data read from the photographed supplier material label.',
          input_schema: EXTRACTION_JSON_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: EXTRACTION_TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: input.mimeType, data: input.imageBase64 },
            },
            {
              type: 'text',
              text: [input.userInstruction, ...(input.hints ?? [])].join('\n\n'),
            },
          ],
        },
      ],
    };

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify(body),
      signal: input.signal ?? null,
    });

    if (!response.ok) {
      throw await toProviderError(response);
    }

    const payload = (await response.json()) as {
      content?: Array<{ type: string; input?: unknown; text?: string }>;
      stop_reason?: string;
      usage?: unknown;
      model?: string;
    };

    const toolUse = payload.content?.find((block) => block.type === 'tool_use');
    if (toolUse?.input && typeof toolUse.input === 'object') {
      return {
        data: toolUse.input,
        raw: { stop_reason: payload.stop_reason, usage: payload.usage, model: payload.model },
        model: payload.model ?? this.model,
      };
    }

    // The model answered in prose despite forced tool use — recover if we can.
    const text = payload.content?.find((block) => block.type === 'text')?.text;
    if (text) {
      return {
        data: parseModelJson(text),
        raw: { stop_reason: payload.stop_reason, usage: payload.usage, recovered: true },
        model: payload.model ?? this.model,
      };
    }

    throw new ProviderError('AI_INVALID_JSON', 'The model returned no usable content.');
  }
}

async function toProviderError(response: Response): Promise<ProviderError> {
  const text = await response.text().catch(() => '');
  const message = text.slice(0, 400) || response.statusText;

  if (response.status === 429) {
    return new ProviderError('RATE_LIMITED', 'The AI provider is rate limiting requests.', 429);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderError('PROVIDER_NOT_CONFIGURED', 'The AI provider rejected the API key.', 502);
  }
  if (response.status === 400 && /image/i.test(message)) {
    return new ProviderError('UNSUPPORTED_MEDIA_TYPE', 'The provider rejected the image.', 415);
  }
  return new ProviderError('AI_PROVIDER_ERROR', `Provider error ${response.status}: ${message}`);
}


// =========================================================================
// _shared/providers/google.ts
// =========================================================================
/**
 * Google Gemini — the no-cost provider.
 *
 * Why it exists: the Gemini API has a genuinely free tier on the Flash models,
 * with image input and no credit card. For a company inside the EEA that also
 * comes with Google's paid-tier data terms (see README §5.4), which is what
 * makes it acceptable for supplier documents at all.
 *
 * Enable with:
 *   AI_PROVIDER=google
 *   GOOGLE_API_KEY=...          (GEMINI_API_KEY is accepted too)
 *   AI_MODEL=gemini-3.5-flash   (optional override)
 *
 * Shape strategy: this provider asks for `application/json` and lets the system
 * prompt carry the contract, exactly like the OpenAI provider. The prompt is
 * generated from the same field catalogue as everything else and already spells
 * out the object shape, so there is no second schema to keep in sync — and no
 * hard failure if Google tightens what its schema dialect accepts.
 */


const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GOOGLE_DEFAULT_MODEL = 'gemini-3.5-flash';

/**
 * Tried in order when the operator did NOT pin a model with AI_MODEL. Model IDs
 * are retired and renamed on Google's schedule, not ours; a warehouse employee
 * cannot act on "model not found", so falling back to an older free-tier model
 * beats going dark. An explicitly configured AI_MODEL is never second-guessed.
 */
const FALLBACK_MODELS = ['gemini-2.5-flash'];

export class GoogleProvider implements LabelExtractionProvider {
  readonly id = 'google';
  readonly model: string;
  private readonly candidates: string[];

  constructor(
    private readonly apiKey: string,
    model?: string,
  ) {
    this.model = model || GOOGLE_DEFAULT_MODEL;
    this.candidates = model ? [model] : [GOOGLE_DEFAULT_MODEL, ...FALLBACK_MODELS];
  }

  async extract(input: ExtractionInput): Promise<ExtractionOutput> {
    let lastError: ProviderError | undefined;

    for (const model of this.candidates) {
      try {
        return await this.extractWith(model, input);
      } catch (error) {
        if (!(error instanceof ProviderError) || error.code !== 'MODEL_NOT_FOUND') throw error;
        lastError = error;
      }
    }

    throw new ProviderError(
      'PROVIDER_NOT_CONFIGURED',
      lastError?.message ?? 'No usable model was found for this API key.',
      502,
    );
  }

  private async extractWith(model: string, input: ExtractionInput): Promise<ExtractionOutput> {
    // First attempt asks for JSON mime type. If a model rejects that field we
    // retry once in plain-text mode; parseModelJson strips code fences anyway.
    let response = await this.call(model, input, true);

    if (response.status === 400) {
      const peek = await response.clone().text().catch(() => '');
      if (/response_?mime_?type|generation_?config/i.test(peek) && !isKeyRejection(peek)) {
        response = await this.call(model, input, false);
      }
    }

    if (!response.ok) {
      throw await toGoogleError(response);
    }

    const payload = (await response.json()) as GeminiResponse;

    if (payload.promptFeedback?.blockReason) {
      throw new ProviderError(
        'AI_PROVIDER_ERROR',
        `The provider refused the image (${payload.promptFeedback.blockReason}).`,
      );
    }

    const candidate = payload.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('')
      .trim();

    if (!text) {
      // An empty answer with MAX_TOKENS means the model spent its budget before
      // emitting the object; anything else is a refusal or an empty candidate.
      if (candidate?.finishReason === 'MAX_TOKENS') {
        throw new ProviderError(
          'AI_INVALID_JSON',
          'The model ran out of output budget before returning the label data.',
        );
      }
      throw new ProviderError('AI_INVALID_JSON', 'The model returned no usable content.');
    }

    return {
      data: parseModelJson(text),
      raw: {
        finishReason: candidate?.finishReason,
        usage: payload.usageMetadata,
        requestedModel: model,
      },
      model: payload.modelVersion ?? model,
    };
  }

  private call(model: string, input: ExtractionInput, jsonMime: boolean): Promise<Response> {
    const body = {
      systemInstruction: { parts: [{ text: input.systemPrompt }] },
      contents: [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: input.mimeType, data: input.imageBase64 } },
            { text: [input.userInstruction, ...(input.hints ?? [])].join('\n\n') },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 8192,
        ...(jsonMime ? { responseMimeType: 'application/json' } : {}),
      },
    };

    return fetch(`${GOOGLE_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Header, not ?key= — the key must never end up in a URL or a log line.
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
      signal: input.signal ?? null,
    });
  }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: unknown;
  modelVersion?: string;
}

/**
 * Gemini answers a bad API key with HTTP 400 INVALID_ARGUMENT, not 401/403.
 * Without this check the single most likely setup mistake — a mistyped or
 * half-pasted key — would surface as a generic "provider error" and send
 * someone hunting through logs instead of re-pasting the key.
 */
function isKeyRejection(body: string): boolean {
  return /API_?KEY_?INVALID|API key not valid|API key expired|PERMISSION_DENIED/i.test(body);
}

function isModelMissing(body: string): boolean {
  return /NOT_FOUND|is not found|not supported for generateContent|does not exist/i.test(body);
}

async function toGoogleError(response: Response): Promise<ProviderError> {
  const text = await response.text().catch(() => '');
  const message = text.slice(0, 400) || response.statusText;

  if (response.status === 429) {
    // The free tier has a per-minute AND a per-day allowance. Telling someone to
    // "wait a minute" when the day's quota is gone would waste their afternoon.
    if (/per\s*day|daily|PerDay|RequestsPerDay/i.test(text)) {
      return new ProviderError(
        'DAILY_QUOTA_EXCEEDED',
        "The provider's free daily allowance is used up.",
        429,
      );
    }
    return new ProviderError('RATE_LIMITED', 'The AI provider is rate limiting requests.', 429);
  }

  if (isKeyRejection(text) || response.status === 401 || response.status === 403) {
    return new ProviderError('PROVIDER_NOT_CONFIGURED', 'The AI provider rejected the API key.', 502);
  }

  // Internal code — caught by extract(), never returned to the browser.
  if (response.status === 404 || isModelMissing(text)) {
    return new ProviderError('MODEL_NOT_FOUND', `The model is unavailable for this key: ${message}`);
  }

  if (response.status === 400 && /image|inline_?data|mime/i.test(message)) {
    return new ProviderError('UNSUPPORTED_MEDIA_TYPE', 'The provider rejected the image.', 415);
  }

  return new ProviderError('AI_PROVIDER_ERROR', `Provider error ${response.status}: ${message}`);
}


// =========================================================================
// _shared/providers/openai.ts
// =========================================================================
/**
 * OpenAI — the drop-in alternative.
 * Enable with:  supabase secrets set AI_PROVIDER=openai OPENAI_API_KEY=sk-...
 */


const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_DEFAULT_MODEL = 'gpt-4.1';

export class OpenAIProvider implements LabelExtractionProvider {
  readonly id = 'openai';
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    model?: string,
  ) {
    this.model = model || OPENAI_DEFAULT_MODEL;
  }

  async extract(input: ExtractionInput): Promise<ExtractionOutput> {
    const body = {
      model: this.model,
      temperature: 0,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: input.systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: [input.userInstruction, ...(input.hints ?? [])].join('\n\n') },
            {
              type: 'image_url',
              image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}`, detail: 'high' },
            },
          ],
        },
      ],
    };

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: input.signal ?? null,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      if (response.status === 429) {
        return Promise.reject(
          new ProviderError('RATE_LIMITED', 'The AI provider is rate limiting requests.', 429),
        );
      }
      if (response.status === 401 || response.status === 403) {
        return Promise.reject(
          new ProviderError('PROVIDER_NOT_CONFIGURED', 'The AI provider rejected the API key.'),
        );
      }
      return Promise.reject(
        new ProviderError('AI_PROVIDER_ERROR', `Provider error ${response.status}: ${text.slice(0, 400)}`),
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: unknown;
      model?: string;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new ProviderError('AI_INVALID_JSON', 'The model returned no content.');

    return {
      data: parseModelJson(content),
      raw: { usage: payload.usage, finish_reason: payload.choices?.[0]?.finish_reason },
      model: payload.model ?? this.model,
    };
  }
}


// =========================================================================
// _shared/providers/index.ts
// =========================================================================
/**
 * Provider registry.
 *
 * Selection is a secret, not code:
 *   supabase secrets set AI_PROVIDER=google    GOOGLE_API_KEY=...
 *   supabase secrets set AI_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-ant-...
 *   supabase secrets set AI_PROVIDER=openai    OPENAI_API_KEY=sk-...
 * `AI_MODEL` overrides the provider's default model.
 *
 * With no AI_PROVIDER set, whichever key is present wins. Google is checked
 * first because it is the only one with a free tier: an operator who pastes a
 * Gemini key and nothing else should get a working app, not a configuration
 * error about a provider they never chose.
 *
 * To add a vendor: implement LabelExtractionProvider in a new file and add one
 * case below.
 */


export function resolveProvider(): LabelExtractionProvider {
  const requested = (Deno.env.get('AI_PROVIDER') ?? '').toLowerCase().trim();
  const model = Deno.env.get('AI_MODEL')?.trim();

  const googleKey = (Deno.env.get('GOOGLE_API_KEY') ?? Deno.env.get('GEMINI_API_KEY'))?.trim();
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim();
  const openaiKey = Deno.env.get('OPENAI_API_KEY')?.trim();

  const detected = googleKey ? 'google' : anthropicKey ? 'anthropic' : openaiKey ? 'openai' : '';
  // 'gemini' is what the key is called in Google's console; accept both spellings.
  const provider = (requested === 'gemini' ? 'google' : requested) || detected;

  switch (provider) {
    case 'google':
      if (!googleKey) {
        throw new ProviderError('PROVIDER_NOT_CONFIGURED', 'GOOGLE_API_KEY is not set.');
      }
      return new GoogleProvider(googleKey, model);
    case 'anthropic':
      if (!anthropicKey) {
        throw new ProviderError('PROVIDER_NOT_CONFIGURED', 'ANTHROPIC_API_KEY is not set.');
      }
      return new AnthropicProvider(anthropicKey, model);
    case 'openai':
      if (!openaiKey) {
        throw new ProviderError('PROVIDER_NOT_CONFIGURED', 'OPENAI_API_KEY is not set.');
      }
      return new OpenAIProvider(openaiKey, model);
    default:
      throw new ProviderError(
        'PROVIDER_NOT_CONFIGURED',
        'No AI provider configured. Set GOOGLE_API_KEY (or ANTHROPIC_API_KEY / OPENAI_API_KEY) as an Edge Function secret.',
      );
  }
}



// =========================================================================
// _shared/rateLimit.ts
// =========================================================================
/**
 * Sliding-window rate limiting.
 *
 * Backed by public.extraction_rate_events, written with the service role, so it
 * works across the many isolates an Edge Function runs in. Fails OPEN: if the
 * database is unreachable the scan still goes through — a warehouse employee
 * must never be blocked by our own bookkeeping.
 */


const TABLE = 'extraction_rate_events';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  windowSeconds: number;
}

function intEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(Deno.env.get(name) ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** A stable-enough caller identity: the forwarded client IP. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const first = forwarded.split(',')[0]?.trim();
  return (first || request.headers.get('cf-connecting-ip') || 'unknown').slice(0, 64);
}

export async function checkRateLimit(
  admin: SupabaseClient,
  key: string,
): Promise<RateLimitResult> {
  const limit = intEnv('RATE_LIMIT_MAX', 40);
  const windowSeconds = intEnv('RATE_LIMIT_WINDOW_SECONDS', 300);
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

  try {
    const { count, error } = await admin
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('client_key', key)
      .gte('created_at', since);

    if (error) return { allowed: true, remaining: limit, limit, windowSeconds };

    const used = count ?? 0;
    if (used >= limit) {
      return { allowed: false, remaining: 0, limit, windowSeconds };
    }

    await admin.from(TABLE).insert({ client_key: key });

    // Opportunistic cleanup so the table cannot grow without bound.
    if (Math.random() < 0.05) {
      const cutoff = new Date(Date.now() - 3600 * 1000).toISOString();
      await admin.from(TABLE).delete().lt('created_at', cutoff);
    }

    return { allowed: true, remaining: Math.max(0, limit - used - 1), limit, windowSeconds };
  } catch {
    return { allowed: true, remaining: limit, limit, windowSeconds };
  }
}


// =========================================================================
// extract-label/index.ts
// =========================================================================
/**
 * POST /functions/v1/extract-label
 * ---------------------------------------------------------------------------
 * The only server-side component. It exists so the AI provider key never leaves
 * the server.
 *
 * Request  { imagePath, bucket }            preferred — reads the photo from the
 *                                           private bucket with the service role
 *          { imageBase64, mimeType }        inline fallback when retention is off
 *
 * Response { ok: true,  data, raw, provider, model, durationMs }
 *          { ok: false, code, message }
 *
 * Codes the client maps to actionable messages: RATE_LIMITED, AI_TIMEOUT,
 * AI_INVALID_JSON, IMAGE_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE, NO_LABEL_DETECTED,
 * PROVIDER_NOT_CONFIGURED, AI_PROVIDER_ERROR.
 */


const AI_TIMEOUT_MS = Number.parseInt(Deno.env.get('AI_TIMEOUT_MS') ?? '', 10) || 75_000;
const DEFAULT_BUCKET = Deno.env.get('SOURCE_IMAGE_BUCKET') ?? 'label-sources';

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== 'POST') {
    return errorResponse(request, 'METHOD_NOT_ALLOWED', 'Use POST.', 405);
  }

  const started = Date.now();

  try {
    const body = await request.json().catch(() => {
      throw new RequestError('BAD_REQUEST', 'The request body must be JSON.');
    });
    const input = parseRequest(body);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const admin =
      supabaseUrl && serviceRoleKey
        ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
        : null;

    // --- rate limiting ------------------------------------------------------
    if (admin) {
      const verdict = await checkRateLimit(admin, clientKey(request));
      if (!verdict.allowed) {
        return errorResponse(
          request,
          'RATE_LIMITED',
          `Too many scans. Try again in a minute (limit ${verdict.limit} per ${Math.round(verdict.windowSeconds / 60)} minutes).`,
          429,
        );
      }
    }

    // --- obtain the image ---------------------------------------------------
    let bytes: Uint8Array;
    if (input.imagePath) {
      if (!admin) {
        throw new RequestError(
          'BAD_REQUEST',
          'imagePath requires the function to have SUPABASE_SERVICE_ROLE_KEY configured.',
          500,
        );
      }
      const bucket = input.bucket ?? DEFAULT_BUCKET;
      const { data, error } = await admin.storage.from(bucket).download(input.imagePath);
      if (error || !data) {
        throw new RequestError('BAD_REQUEST', 'The stored image could not be read.', 404);
      }
      bytes = new Uint8Array(await data.arrayBuffer());
    } else {
      bytes = fromBase64(input.imageBase64 ?? '');
    }

    const mimeType = assertImage(bytes);
    const imageBase64 = toBase64(bytes);

    // --- provider call ------------------------------------------------------
    const provider = resolveProvider();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    let output;
    try {
      output = await provider.extract({
        imageBase64,
        mimeType,
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        userInstruction: USER_INSTRUCTION,
        ...(input.hints ? { hints: input.hints } : {}),
        signal: controller.signal,
      });
    } catch (cause) {
      if (controller.signal.aborted) {
        return errorResponse(request, 'AI_TIMEOUT', 'The analysis service did not answer in time.', 504);
      }
      throw cause;
    } finally {
      clearTimeout(timeout);
    }

    // --- validate + bound ---------------------------------------------------
    if (!looksLikeExtraction(output.data)) {
      return errorResponse(
        request,
        'AI_INVALID_JSON',
        'The analysis service returned data in an unexpected format.',
        502,
      );
    }

    const data = boundPayload(output.data) as Record<string, unknown>;

    if (data.documentType === 'unreadable') {
      return errorResponse(
        request,
        'NO_LABEL_DETECTED',
        'No readable material label was found in the photo.',
        422,
      );
    }

    return jsonResponse(request, {
      ok: true,
      data,
      raw: boundPayload(output.raw),
      provider: provider.id,
      model: output.model,
      durationMs: Date.now() - started,
    });
  } catch (cause) {
    if (cause instanceof RequestError) {
      return errorResponse(request, cause.code, cause.message, cause.status);
    }
    if (cause instanceof ProviderError) {
      return errorResponse(request, cause.code, cause.message, cause.status);
    }
    console.error('extract-label failed', cause);
    return errorResponse(
      request,
      'AI_PROVIDER_ERROR',
      'The document analysis service failed unexpectedly.',
      502,
    );
  }
});
