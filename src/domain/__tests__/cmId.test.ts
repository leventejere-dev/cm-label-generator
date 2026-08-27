import { describe, expect, it } from 'vitest';
import {
  CM_ID_PATTERN,
  coerceCmId,
  formatDatePart,
  generateCmId,
  isValidCmId,
  parseCmId,
} from '../cmId';

describe('CM identifier', () => {
  it('produces the documented CM-YYYYMMDD-XXXX shape', () => {
    const id = generateCmId(new Date(2026, 7, 26, 14, 30));
    expect(id).toMatch(CM_ID_PATTERN);
    expect(id.startsWith('CM-20260826-')).toBe(true);
  });

  it('uses local calendar date parts, zero padded', () => {
    expect(formatDatePart(new Date(2026, 0, 5))).toBe('20260105');
    expect(formatDatePart(new Date(2026, 11, 31))).toBe('20261231');
  });

  it('never emits characters that can be misread off a printed label', () => {
    const forbidden = /[ILOU]/;
    for (let i = 0; i < 300; i += 1) {
      const suffix = generateCmId().split('-')[2] ?? '';
      expect(suffix).toHaveLength(4);
      expect(forbidden.test(suffix)).toBe(false);
    }
  });

  it('is effectively unique within a day', () => {
    const ids = new Set(Array.from({ length: 500 }, () => generateCmId()));
    // 32^4 = 1,048,576 possibilities; 500 draws should almost never collide.
    expect(ids.size).toBeGreaterThan(495);
  });

  it('accepts the zero-padded sequence produced by next_cm_id()', () => {
    expect(isValidCmId('CM-20260826-0007')).toBe(true);
    expect(isValidCmId('CM-20260826-A7X2')).toBe(true);
  });

  it('rejects malformed identifiers', () => {
    expect(isValidCmId('CM-2026826-0007')).toBe(false);
    expect(isValidCmId('XX-20260826-0007')).toBe(false);
    expect(isValidCmId('CM-20260826-007')).toBe(false);
    expect(isValidCmId('CM-20260826-00I7')).toBe(false); // I is excluded
    expect(isValidCmId(null)).toBe(false);
  });

  it('parses a valid id back into its parts', () => {
    expect(parseCmId('CM-20260826-0007')).toEqual({ date: '2026-08-26', suffix: '0007' });
    expect(parseCmId('nonsense')).toBeNull();
  });

  it('coerces anything unusable into a fresh valid id', () => {
    expect(coerceCmId('CM-20260826-0007')).toBe('CM-20260826-0007');
    expect(coerceCmId(undefined)).toMatch(CM_ID_PATTERN);
    expect(coerceCmId(42)).toMatch(CM_ID_PATTERN);
  });
});
