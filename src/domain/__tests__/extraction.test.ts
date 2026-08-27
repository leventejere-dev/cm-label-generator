import { describe, expect, it } from 'vitest';
import {
  confidenceBand,
  countPopulatedFields,
  emptyExtractionResult,
  needsReview,
  parseExtraction,
  slugifyKey,
} from '../extraction';
import {
  alcometAngleProfile,
  germanCoil,
  italianSheet,
} from '../../features/extraction/fixtures';

describe('extraction schema', () => {
  it('parses the photographed ALCOMET label fixture', () => {
    const { ok, result } = parseExtraction(alcometAngleProfile.raw);
    expect(ok).toBe(true);
    expect(result.documentType).toBe('material_label');
    expect(result.product.alloy?.value).toBe('6060');
    expect(result.product.temper?.value).toBe('T6');
    expect(result.quantity.netWeight?.value).toBe('690');
    expect(result.quantity.grossWeight?.value).toBe('700');
    expect(result.traceability.castNumber?.value).toBe('11260716EU');
    expect(result.traceability.palletNumber?.value).toBe('PA02633809');
    expect(result.commercial.customerPurchaseOrder?.value).toBe('CC007055');
    expect(result.codes.qrCodes).toBe(1);
    expect(result.sensitiveSupplierInformation).toHaveLength(2);
  });

  it('does not add units the label never printed', () => {
    const { result } = parseExtraction(alcometAngleProfile.raw);
    expect(result.quantity.netWeight?.value).not.toMatch(/kg/i);
    expect(result.product.length?.value).toBe('6000');
    expect(result.warnings.some((w) => w.code === 'UNIT_NOT_PRINTED')).toBe(true);
  });

  it('preserves decimal commas and thousands separators exactly', () => {
    const { result } = parseExtraction(germanCoil.raw);
    expect(result.product.thickness?.value).toBe('0,80 mm');
    expect(result.quantity.netWeight?.value).toBe('2.418 kg');
  });

  it('accepts bare strings and numbers instead of field objects', () => {
    const { ok, result } = parseExtraction(italianSheet.raw);
    expect(ok).toBe(true);
    expect(result.product.material?.value).toBe('Acciaio inox AISI 304');
    expect(result.quantity.pieces?.value).toBe('12');
    expect(result.product.thickness?.confidence).toBeNull();
  });

  it('warns when a numeric value arrives as a JSON number', () => {
    const { result } = parseExtraction({
      product: { thickness: 0.8 },
    });
    expect(result.product.thickness?.value).toBe('0.8');
    expect(result.warnings.some((w) => w.code === 'NUMERIC_VALUE_COERCED')).toBe(true);
  });

  it('keeps unknown keys instead of dropping data', () => {
    const { result } = parseExtraction({
      product: { alloy: 'EN AW-6060', mysteryProperty: { value: 'X-42', confidence: 0.5 } },
    });
    expect(result.product.alloy?.value).toBe('EN AW-6060');
    const harvested = result.additionalFields.find((f) => f.key === 'mysteryproperty');
    expect(harvested?.value).toBe('X-42');
    expect(harvested?.group).toBe('product');
  });

  it('treats placeholder strings as absent values', () => {
    const { result } = parseExtraction({
      product: { alloy: 'n/a', temper: '-', finish: 'null', width: '' },
    });
    expect(result.product.alloy).toBeNull();
    expect(result.product.temper).toBeNull();
    expect(result.product.finish).toBeNull();
    expect(result.product.width).toBeNull();
  });

  it('rescales 0-100 confidences into 0-1', () => {
    const { result } = parseExtraction({
      product: { alloy: { value: '6060', confidence: 94 } },
    });
    expect(result.product.alloy?.confidence).toBeCloseTo(0.94, 2);
  });

  it('accepts snake_case aliases some providers emit', () => {
    const { result } = parseExtraction({
      document_type: 'material_label',
      detected_language: 'de',
      additional_fields: [{ label: 'Innendurchmesser', value: '505 mm' }],
      overall_confidence: 0.8,
    });
    expect(result.detectedLanguage).toBe('de');
    expect(result.additionalFields[0]?.value).toBe('505 mm');
    expect(result.overallConfidence).toBe(0.8);
  });

  it('degrades gracefully instead of throwing on garbage', () => {
    for (const bad of [null, 'not json', 42, [], { product: 'string-not-object' }]) {
      const outcome = parseExtraction(bad);
      expect(outcome.result).toBeDefined();
      expect(() => countPopulatedFields(outcome.result)).not.toThrow();
    }
    const outcome = parseExtraction('not json');
    expect(outcome.ok).toBe(false);
    expect(outcome.result.warnings[0]?.severity).toBe('error');
  });

  it('tolerates nulls where objects are expected', () => {
    const outcome = parseExtraction({
      product: null,
      quantity: null,
      additionalFields: null,
      warnings: null,
      sensitiveSupplierInformation: null,
    });
    expect(outcome.ok).toBe(true);
    expect(countPopulatedFields(outcome.result)).toBe(0);
  });

  it('starts from a fully-formed empty result', () => {
    const empty = emptyExtractionResult();
    expect(countPopulatedFields(empty)).toBe(0);
    expect(empty.delivery).toBeDefined();
    expect(empty.product.alloy).toBeNull();
  });
});

describe('confidence banding', () => {
  it('bands values the way the review UI colours them', () => {
    expect(confidenceBand(0.98)).toBe('high');
    expect(confidenceBand(0.9)).toBe('high');
    expect(confidenceBand(0.75)).toBe('medium');
    expect(confidenceBand(0.4)).toBe('low');
    expect(confidenceBand(null)).toBe('unknown');
  });

  it('flags anything below high confidence for review', () => {
    expect(needsReview(0.95)).toBe(false);
    expect(needsReview(0.8)).toBe(true);
    expect(needsReview(0.2)).toBe(true);
    expect(needsReview(null)).toBe(false);
  });
});

describe('slugifyKey', () => {
  it('produces stable machine keys', () => {
    expect(slugifyKey('Număr pachet')).toBe('numar_pachet');
    expect(slugifyKey('Net Wt.')).toBe('net_wt');
    expect(slugifyKey('  ')).toBe('field');
  });
});
