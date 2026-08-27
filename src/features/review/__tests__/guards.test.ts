import { describe, expect, it } from 'vitest';
import type { RemovedItem } from '../../../domain/sanitize';
import { checkCaption, checkValue } from '../guards';

const REMOVED: RemovedItem[] = [
  {
    source: 'model',
    category: 'supplier_logo',
    path: '-',
    label: 'Supplier logo',
    value: 'ALCOMET',
    reason: 'Supplier logo',
  },
];

describe('review form guards', () => {
  it('accepts ordinary product field names', () => {
    for (const caption of ['Product code', 'Innendurchmesser', 'Număr pachet', 'Imballo']) {
      expect(checkCaption(caption).ok).toBe(true);
    }
  });

  it('refuses a field name that would re-introduce supplier branding', () => {
    for (const caption of ['Supplier', 'Manufacturer', 'Hersteller', 'Furnizor', 'Website']) {
      const verdict = checkCaption(caption);
      expect(verdict.ok).toBe(false);
      expect(verdict.message).toMatch(/furnizor/i);
    }
  });

  it('requires a non-empty, reasonably short field name', () => {
    expect(checkCaption('   ').ok).toBe(false);
    expect(checkCaption('x'.repeat(80)).ok).toBe(false);
  });

  it('refuses values that repeat removed supplier information', () => {
    expect(checkValue('ALCOMET', REMOVED).ok).toBe(false);
    expect(checkValue('Made by ALCOMET', REMOVED).ok).toBe(false);
  });

  it('refuses contact details whatever the field is called', () => {
    expect(checkValue('sales@supplier.de', REMOVED).ok).toBe(false);
    expect(checkValue('www.supplier.de', REMOVED).ok).toBe(false);
    expect(checkValue('+40 21 555 1234', REMOVED).ok).toBe(false);
  });

  it('accepts real technical values', () => {
    for (const value of ['690', '0,80 mm', 'EN AW-5754', '11260716EU', 'PA02633809', 'Mill']) {
      expect(checkValue(value, REMOVED).ok).toBe(true);
    }
  });

  it('always allows Color Metal itself', () => {
    expect(checkValue('SC COLOR-METAL SRL', REMOVED).ok).toBe(true);
  });

  it('accepts an empty value — clearing a field is normal', () => {
    expect(checkValue('', REMOVED).ok).toBe(true);
  });
});
