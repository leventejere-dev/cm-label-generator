import { describe, expect, it } from 'vitest';
import { parseExtraction, type ExtractionResult } from '../extraction';
import { colorMetalize } from '../sanitize';
import { buildLabelDocument, labelHasContent, summarise } from '../labelDocument';
import { alcometAngleProfile, germanCoil } from '../../features/extraction/fixtures';

const OPTIONS = {
  cmId: 'CM-20260826-0007',
  generatedAt: new Date(2026, 7, 26, 9, 15),
  companyLine: 'SC COLOR-METAL SRL',
  generator: 'CM Label Generator',
  version: 'cm-a4-v1',
};

function prepared(raw: unknown) {
  const parsed = parseExtraction(raw).result;
  return colorMetalize(parsed);
}

function allValues(doc: ReturnType<typeof buildLabelDocument>): string {
  return JSON.stringify([doc.delivery, doc.descriptors, doc.metrics, doc.sections]);
}

describe('label document', () => {
  it('builds a printable document from the photographed sample', () => {
    const { safe, removed } = prepared(alcometAngleProfile.raw);
    const doc = buildLabelDocument(safe, { ...OPTIONS, removed });

    expect(doc.cmId).toBe('CM-20260826-0007');
    expect(doc.headline).toBe('ANGLE / L-PROFILE');
    expect(doc.metrics.map((m) => m.value)).toEqual(['206', '690', '700', '6000']);
    expect(labelHasContent(doc)).toBe(true);
  });

  it('never emits an empty field or an empty section', () => {
    const { safe, removed } = prepared(alcometAngleProfile.raw);
    const doc = buildLabelDocument(safe, { ...OPTIONS, removed });

    for (const section of doc.sections) {
      expect(section.rows.length).toBeGreaterThan(0);
      for (const row of section.rows) {
        expect(row.value.trim().length).toBeGreaterThan(0);
      }
    }
    // Nothing was extracted for these, so they must not appear at all.
    const keys = doc.sections.flatMap((s) => s.rows.map((r) => r.key));
    expect(keys).not.toContain('product.width');
    expect(keys).not.toContain('traceability.coilNumber');
  });

  it('excludes the delivery group from the detail sections — it has its own block', () => {
    const { safe, removed } = prepared(alcometAngleProfile.raw);
    safe.delivery.clientName = { value: 'C.N. ROMARM S.A.', confidence: null, sourceText: null };
    const doc = buildLabelDocument(safe, { ...OPTIONS, removed });

    expect(doc.sections.some((section) => section.id === 'delivery')).toBe(false);
    expect(doc.delivery.map((row) => row.value)).toContain('C.N. ROMARM S.A.');
  });

  it('prints Romanian captions by default and English on request', () => {
    const { safe, removed } = prepared(alcometAngleProfile.raw);

    const ro = buildLabelDocument(safe, { ...OPTIONS, removed });
    expect(ro.strings.documentTitle).toBe('ETICHETĂ MATERIAL');
    expect(ro.metrics.map((m) => m.label)).toContain('Număr bucăți');
    expect(ro.metrics.map((m) => m.label)).toContain('Cantitate netă');

    const en = buildLabelDocument(safe, { ...OPTIONS, removed, language: 'en' });
    expect(en.strings.documentTitle).toBe('MATERIAL LABEL');
    expect(en.metrics.map((m) => m.label)).toContain('Pieces');
  });

  it('never prints supplier information, even if it survived earlier layers', () => {
    const { safe, removed } = prepared(alcometAngleProfile.raw);
    // Simulate a leak: something re-introduced the supplier name into the data.
    safe.additionalFields.push({
      key: 'note',
      label: 'Note',
      group: 'additional',
      value: 'Produced at ALCOMET works',
      confidence: 0.9,
      sourceText: null,
    });

    const doc = buildLabelDocument(safe, { ...OPTIONS, removed });
    expect(allValues(doc)).not.toMatch(/ALCOMET/i);
    expect(doc.notes.some((note) => /withheld/i.test(note) || /reținute/i.test(note))).toBe(true);
  });

  it('composes a dimension line when the label had no single dimensions field', () => {
    const { safe, removed } = prepared(germanCoil.raw);
    delete (safe.product as Record<string, unknown>).dimensions;
    safe.product.dimensions = null;
    const doc = buildLabelDocument(safe, { ...OPTIONS, removed });
    expect(doc.subheadline).toBe('0,80 mm × 1250 mm');
  });

  it('notes that supplier codes were not reproduced', () => {
    const { safe, removed } = prepared(germanCoil.raw);
    const doc = buildLabelDocument(safe, { ...OPTIONS, removed });
    expect(doc.notes.some((note) => /cod|code/i.test(note))).toBe(true);
  });

  it('reports no content for an empty extraction', () => {
    const empty = parseExtraction({}).result as ExtractionResult;
    const doc = buildLabelDocument(empty, OPTIONS);
    expect(labelHasContent(doc)).toBe(false);
    expect(doc.sections).toHaveLength(0);
  });
});

describe('history summary', () => {
  it('derives the columns shown in Recent Labels', () => {
    const { safe } = prepared(alcometAngleProfile.raw);
    expect(summarise(safe)).toEqual({
      product: 'Angle / L-profile',
      dimensions: '50 / 50 / 2 / 0',
      weight: '690',
    });
  });

  it('falls back to gross weight when there is no net weight', () => {
    const { safe } = prepared({ quantity: { grossWeight: '700 kg' } });
    expect(summarise(safe).weight).toBe('700 kg');
  });
});
