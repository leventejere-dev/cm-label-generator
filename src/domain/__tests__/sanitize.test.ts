import { describe, expect, it } from 'vitest';
import { parseExtraction, type ExtractionResult } from '../extraction';
import {
  buildSupplierBlocklist,
  colorMetalize,
  isColorMetal,
  isSupplierIdentifyingCaption,
  looksLikeContactDetail,
  matchesBlocklist,
} from '../sanitize';
import {
  alcometAngleProfile,
  germanCoil,
  italianSheet,
} from '../../features/extraction/fixtures';

function parse(raw: unknown): ExtractionResult {
  return parseExtraction(raw).result;
}

describe('supplier-identifying captions', () => {
  it('recognises the supplier role in many languages', () => {
    for (const caption of [
      'Supplier', 'Vendor', 'Manufacturer', 'Manufactured by', 'Produced by',
      'Hersteller', 'Lieferant', 'Produttore', 'Fornitore', 'Fabricant',
      'Fournisseur', 'Fabricante', 'Proveedor', 'Furnizor', 'Producător',
      'Gyártó', 'Szállító', 'Leverancier', 'Dostawca', 'Producent', 'Výrobce',
      'производител', 'доставчик', 'Mill name', 'Plant code', 'Works no.',
    ]) {
      expect(isSupplierIdentifyingCaption(caption)).toBe(true);
    }
  });

  it('recognises contact and branding captions', () => {
    for (const caption of ['Website', 'E-mail', 'Telephone', 'Fax', 'Logo', 'Packed by']) {
      expect(isSupplierIdentifyingCaption(caption)).toBe(true);
    }
  });

  it('does NOT flag legitimate product captions', () => {
    for (const caption of [
      'Finish', 'Mill', 'Alloy', 'Temper', 'Net weight', 'Cast no.', 'Pallet no.',
      'Coil no.', 'Thickness', 'Length', 'Dimensions', 'Standard', 'Certificate no.',
    ]) {
      expect(isSupplierIdentifyingCaption(caption)).toBe(false);
    }
  });

  it('does NOT flag customer-role captions — Color Metal is the buyer', () => {
    for (const caption of [
      'Customer', 'Client', 'Ship to', 'Delivery address', 'Consignee', 'Buyer',
      'Sold to', 'Kunde', 'Destinatar',
    ]) {
      expect(isSupplierIdentifyingCaption(caption)).toBe(false);
    }
  });
});

describe('Color Metal recognition', () => {
  it('matches the spellings that appear on real labels', () => {
    expect(isColorMetal('SC COLOR-METAL SRL')).toBe(true);
    expect(isColorMetal('Color Metal')).toBe(true);
    expect(isColorMetal('COLORMETAL')).toBe(true);
    expect(isColorMetal('Colour Metal Ltd')).toBe(true);
    expect(isColorMetal('ALCOMET')).toBe(false);
  });
});

describe('blocklist matching', () => {
  const blocklist = buildSupplierBlocklist([
    {
      category: 'supplier_name',
      value: 'Acciai Speciali Lombardi S.p.A.',
      sourceText: null,
      reason: '',
      confidence: null,
    },
    { category: 'supplier_logo', value: 'ALCOMET', sourceText: null, reason: '', confidence: null },
  ]);

  it('catches the supplier name in free text', () => {
    expect(matchesBlocklist('Prodotto da Acciai Speciali Lombardi - Brescia', blocklist)).toBeTruthy();
    expect(matchesBlocklist('ALCOMET AD', blocklist)).toBeTruthy();
  });

  it('does not delete legitimate material descriptions that merely look similar', () => {
    // "Acciai" must not eat "Acciaio" — this is the false positive that would
    // silently destroy product data.
    expect(matchesBlocklist('Acciaio inox AISI 304', blocklist)).toBeNull();
    expect(matchesBlocklist('Mill finish', blocklist)).toBeNull();
    expect(matchesBlocklist('EN AW-5754', blocklist)).toBeNull();
  });

  it('drops generic industry words from the vocabulary', () => {
    const generic = buildSupplierBlocklist([
      { category: 'supplier_name', value: 'Nordic Aluminium Group Ltd', sourceText: null, reason: '', confidence: null },
    ]);
    expect(generic.tokens).not.toContain('aluminium');
    expect(generic.tokens).not.toContain('group');
    expect(generic.tokens).toContain('nordic');
  });
});

describe('contact detail detection', () => {
  it('spots e-mails, websites and phone numbers', () => {
    expect(looksLikeContactDetail('ordini@acciaispeciali-lombardi.it')).toBe(true);
    expect(looksLikeContactDetail('www.rheinwerk-aluminium.de')).toBe(true);
    expect(looksLikeContactDetail('+49 2131 4400-0')).toBe(true);
  });

  it('leaves technical values alone', () => {
    expect(looksLikeContactDetail('11260716EU')).toBe(false);
    expect(looksLikeContactDetail('PA02633809')).toBe(false);
    expect(looksLikeContactDetail('50 x 50 x 2.0')).toBe(false);
    expect(looksLikeContactDetail('DP0061760_60000')).toBe(false);
  });
});

describe('colorMetalize — the core rule', () => {
  it('removes everything the model flagged', () => {
    const { safe, removed } = colorMetalize(parse(alcometAngleProfile.raw));
    expect(removed.length).toBeGreaterThanOrEqual(2);
    expect(removed.some((item) => item.value === 'ALCOMET')).toBe(true);
    // The sanitised object must not carry supplier identity anywhere at all.
    expect(JSON.stringify(safe)).not.toMatch(/Сеэай/);
    expect(JSON.stringify(safe)).not.toMatch(/ALCOMET/i);
    expect(safe.sensitiveSupplierInformation).toHaveLength(0);
  });

  it('keeps every piece of genuine product data', () => {
    const { safe } = colorMetalize(parse(alcometAngleProfile.raw));
    expect(safe.product.alloy?.value).toBe('6060');
    expect(safe.product.temper?.value).toBe('T6');
    expect(safe.product.finish?.value).toBe('Mill'); // must survive the "mill" trap
    expect(safe.quantity.netWeight?.value).toBe('690');
    expect(safe.quantity.grossWeight?.value).toBe('700');
    expect(safe.traceability.castNumber?.value).toBe('11260716EU');
    expect(safe.traceability.palletNumber?.value).toBe('PA02633809');
    expect(safe.commercial.customerPurchaseOrder?.value).toBe('CC007055');
  });

  it('keeps Color Metal itself — it is the customer, not the supplier', () => {
    const { safe, removed } = colorMetalize(parse(alcometAngleProfile.raw));
    expect(safe.commercial.customerName?.value).toBe('SC COLOR-METAL SRL');
    expect(safe.commercial.deliveryAddress?.value).toContain('Mogosoaia');
    expect(removed.some((item) => /color[- ]?metal/i.test(item.value))).toBe(false);
  });

  it('removes a supplier named in a field the model did not flag', () => {
    const { safe, removed } = colorMetalize(parse(italianSheet.raw));
    const keys = safe.additionalFields.map((field) => field.key);
    expect(keys).not.toContain('fornitore'); // caught by the caption rule
    expect(keys).not.toContain('note'); // caught by the value blocklist
    expect(keys).toContain('imballo'); // unrelated data survives
    expect(removed.some((item) => item.path === 'additionalFields.fornitore')).toBe(true);
  });

  it('removes supplier contact details found in ordinary fields', () => {
    const { safe, removed } = colorMetalize(parse(germanCoil.raw));
    const keys = safe.additionalFields.map((field) => field.key);
    expect(keys).not.toContain('lieferant_website');
    expect(keys).toContain('innendurchmesser');
    expect(removed.some((item) => item.path === 'additionalFields.lieferant_website')).toBe(true);
    expect(removed.some((item) => item.value === '+49 2131 4400-0')).toBe(true);
  });

  it('never mutates its input', () => {
    const input = parse(italianSheet.raw);
    const before = JSON.stringify(input);
    colorMetalize(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('tells the operator that supplier codes were not reproduced', () => {
    const { warnings } = colorMetalize(parse(alcometAngleProfile.raw));
    expect(warnings.some((w) => w.code === 'SOURCE_CODES_NOT_COPIED')).toBe(true);
  });

  it('reports nothing removed for a clean label', () => {
    const { removed } = colorMetalize(
      parse({ product: { alloy: 'EN AW-5754' }, quantity: { netWeight: '100 kg' } }),
    );
    expect(removed).toHaveLength(0);
  });
});
