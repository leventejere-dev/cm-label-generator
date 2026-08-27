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
