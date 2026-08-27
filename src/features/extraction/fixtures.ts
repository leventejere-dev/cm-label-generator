/**
 * SAMPLE SUPPLIER LABELS
 * ---------------------------------------------------------------------------
 * These are RAW provider payloads — exactly the shape a multimodal model
 * returns, before validation. They are used for two things:
 *
 *   1. mock mode, so the whole workflow is demonstrable without AI credentials
 *   2. the unit tests, which run them through parseExtraction() + colorMetalize()
 *
 * Three deliberately different layouts are included so nothing in the pipeline
 * can quietly become specific to one supplier:
 *
 *   alcometAngleProfile  Bulgarian extruder, English captions, ALCOMET logo,
 *                        supplier QR code, units NOT printed next to weights
 *   germanCoil           German captions, decimal COMMA thickness (0,80 mm),
 *                        supplier website + phone printed on the label
 *   italianSheet         Italian captions, supplier named in a "Fornitore"
 *                        field the model did NOT flag — the rule layer must
 *                        catch it — plus free text naming the manufacturer
 */

export interface LabelFixture {
  id: string;
  title: string;
  description: string;
  /** Raw, unvalidated provider output. */
  raw: unknown;
  /** Nominal processing time so mock mode feels like the real thing. */
  simulatedDurationMs: number;
}

/** The photographed sample: ALCOMET aluminium angle profile for Color Metal. */
export const alcometAngleProfile: LabelFixture = {
  id: 'alcomet-angle-profile',
  title: 'Aluminium angle profile',
  description: 'English captions, supplier logo and QR code, weights printed without units.',
  simulatedDurationMs: 2600,
  raw: {
    documentType: 'material_label',
    detectedLanguage: 'en',
    product: {
      material: null,
      productType: {
        value: 'Angle / L-profile',
        confidence: 0.96,
        sourceText: 'Type of Production  Angle/L-profile',
      },
      profileType: {
        value: 'Angle / L-profile',
        confidence: 0.92,
        sourceText: 'Angle/L-profile',
      },
      alloy: {
        value: '6060',
        confidence: 0.93,
        sourceText: '500-0830/6060/T6/50/50/2/0/Mill-',
      },
      temper: {
        value: 'T6',
        confidence: 0.93,
        sourceText: '500-0830/6060/T6/50/50/2/0/Mill-',
      },
      finish: {
        value: 'Mill',
        confidence: 0.84,
        sourceText: '.../Mill-',
      },
      dimensions: {
        value: '50 / 50 / 2 / 0',
        confidence: 0.62,
        sourceText: '500-0830/6060/T6/50/50/2/0/Mill-',
      },
      thickness: null,
      width: null,
      length: {
        value: '6000',
        confidence: 0.95,
        sourceText: 'Length  6000',
      },
    },
    quantity: {
      pieces: { value: '206', confidence: 0.96, sourceText: 'Pieces  206' },
      netWeight: { value: '690', confidence: 0.95, sourceText: 'Net Wt.  690' },
      grossWeight: { value: '700', confidence: 0.95, sourceText: 'Gross Wt.  700' },
    },
    traceability: {
      castNumber: { value: '11260716EU', confidence: 0.94, sourceText: 'Cast No.  11260716EU' },
      palletNumber: { value: 'PA02633809', confidence: 0.95, sourceText: 'Pallet No.  PA02633809' },
    },
    dates: {
      packingDate: { value: '2026-06-05', confidence: 0.96, sourceText: 'Packing Date  2026-06-05' },
    },
    commercial: {
      customerPurchaseOrder: {
        value: 'CC007055',
        confidence: 0.96,
        sourceText: 'Purchase Order No.  CC007055',
      },
      productionOrder: {
        value: 'DP0061760_60000',
        confidence: 0.9,
        sourceText: 'Production Order/Contract  DP0061760_60000',
      },
      customerName: {
        value: 'SC COLOR-METAL SRL',
        confidence: 0.97,
        sourceText: 'Customer:  SC COLOR-METAL SRL',
      },
      deliveryAddress: {
        value: 'Sos. Buc-Targoviste nr.12/A, Mogosoaia, ROMANIA',
        confidence: 0.9,
        sourceText: 'Delivery Address  Sos.Buc-Targoviste nr.12/A  Mogosoaia  ROMANIA',
      },
    },
    additionalFields: [
      {
        key: 'product_code',
        label: 'Product code',
        value: '500-0830/6060/T6/50/50/2/0/Mill-',
        confidence: 0.78,
        sourceText: '500-0830/6060/T6/50/50/2/0/Mill-',
        group: 'product',
      },
    ],
    sensitiveSupplierInformation: [
      {
        category: 'supplier_logo',
        value: 'ALCOMET',
        sourceText: 'ALCOMET logo, bottom left of the label',
        reason: 'Supplier logo and company name identify where the material was purchased.',
        confidence: 0.97,
      },
      {
        category: 'supplier_contact',
        value: 'Packed by: Сеэай Рамадан',
        sourceText: 'Packed by: Сеэай Рамадан',
        reason: 'Name of the supplier employee who packed the goods.',
        confidence: 0.86,
      },
    ],
    codes: {
      barcodes: 0,
      qrCodes: 1,
      note: 'One QR code next to the supplier logo. Content deliberately not decoded or reproduced.',
    },
    warnings: [
      {
        code: 'UNIT_NOT_PRINTED',
        severity: 'warning',
        path: 'quantity.netWeight',
        message:
          'The weights are printed as bare numbers ("Gross Wt. 700", "Net Wt. 690") with no unit visible. No unit has been added. Confirm whether these are kilograms.',
      },
      {
        code: 'AMBIGUOUS_VALUE',
        severity: 'warning',
        path: 'product.dimensions',
        message:
          'The product code reads "50/50/2/0". This most likely means 50 × 50 × 2.0 mm, but the separator is ambiguous — verify the thickness against the profile drawing before printing.',
      },
      {
        code: 'UNIT_NOT_PRINTED',
        severity: 'info',
        path: 'product.length',
        message: 'Length is printed as "6000" with no unit. Confirm whether this is millimetres.',
      },
    ],
    overallConfidence: 0.91,
  },
};

/** German aluminium coil — decimal comma, supplier contact details on the label. */
export const germanCoil: LabelFixture = {
  id: 'german-coil',
  title: 'Aluminium coil (German label)',
  description: 'German captions, decimal comma thickness, supplier website and telephone printed.',
  simulatedDurationMs: 2400,
  raw: {
    documentType: 'material_label',
    detectedLanguage: 'de',
    product: {
      material: { value: 'Aluminium', confidence: 0.95, sourceText: 'Werkstoff: Aluminium' },
      productType: { value: 'Coil', confidence: 0.94, sourceText: 'Bandcoil' },
      alloy: { value: 'EN AW-5754', confidence: 0.97, sourceText: 'Legierung EN AW-5754' },
      temper: { value: 'H111', confidence: 0.93, sourceText: 'Zustand H111' },
      standard: { value: 'EN 485-2', confidence: 0.88, sourceText: 'Norm EN 485-2' },
      finish: { value: 'walzblank', confidence: 0.8, sourceText: 'Oberfläche walzblank' },
      thickness: { value: '0,80 mm', confidence: 0.96, sourceText: 'Dicke 0,80 mm' },
      width: { value: '1250 mm', confidence: 0.96, sourceText: 'Breite 1250 mm' },
      dimensions: { value: '0,80 × 1250 mm', confidence: 0.9, sourceText: '0,80 x 1250' },
    },
    quantity: {
      netWeight: { value: '2.418 kg', confidence: 0.94, sourceText: 'Nettogewicht 2.418 kg' },
      grossWeight: { value: '2.463 kg', confidence: 0.93, sourceText: 'Bruttogewicht 2.463 kg' },
      packages: { value: '1', confidence: 0.9, sourceText: '1 Coil' },
    },
    traceability: {
      coilNumber: { value: 'C-884213-07', confidence: 0.95, sourceText: 'Coil-Nr. C-884213-07' },
      batchNumber: { value: 'CH-5754-2026-041', confidence: 0.91, sourceText: 'Charge CH-5754-2026-041' },
      certificateNumber: { value: '3.1 / 2026-11844', confidence: 0.85, sourceText: 'Zeugnis 3.1 Nr. 2026-11844' },
    },
    dates: {
      productionDate: { value: '2026-05-19', confidence: 0.92, sourceText: 'Herstelldatum 19.05.2026' },
    },
    commercial: {
      customerPurchaseOrder: { value: 'CC007311', confidence: 0.94, sourceText: 'Bestell-Nr. CC007311' },
      customerName: { value: 'SC COLOR-METAL SRL', confidence: 0.96, sourceText: 'Kunde: SC COLOR-METAL SRL' },
      deliveryNoteNumber: { value: 'LS-2026-40118', confidence: 0.9, sourceText: 'Lieferschein LS-2026-40118' },
    },
    additionalFields: [
      {
        key: 'innendurchmesser',
        label: 'Innendurchmesser',
        value: '505 mm',
        confidence: 0.89,
        sourceText: 'Innendurchmesser 505 mm',
        group: 'product',
      },
      {
        key: 'lieferant_website',
        label: 'Internet',
        value: 'www.rheinwerk-aluminium.de',
        confidence: 0.93,
        sourceText: 'Internet: www.rheinwerk-aluminium.de',
        group: 'additional',
      },
    ],
    sensitiveSupplierInformation: [
      {
        category: 'supplier_name',
        value: 'Rheinwerk Aluminium GmbH',
        sourceText: 'Rheinwerk Aluminium GmbH · Werk Neuss',
        reason: 'Manufacturer name printed in the label header.',
        confidence: 0.98,
      },
      {
        category: 'supplier_phone',
        value: '+49 2131 4400-0',
        sourceText: 'Tel. +49 2131 4400-0',
        reason: 'Supplier telephone number.',
        confidence: 0.95,
      },
    ],
    codes: { barcodes: 2, qrCodes: 0, note: 'Two Code-128 barcodes under the coil number.' },
    warnings: [
      {
        code: 'DECIMAL_SEPARATOR_PRESERVED',
        severity: 'info',
        path: 'product.thickness',
        message: 'Thickness uses a decimal comma ("0,80 mm") exactly as printed. It has not been converted.',
      },
    ],
    overallConfidence: 0.93,
  },
};

/** Italian stainless sheet — supplier named in a field the model did not flag. */
export const italianSheet: LabelFixture = {
  id: 'italian-sheet',
  title: 'Stainless sheet (Italian label)',
  description: 'Italian captions; a "Fornitore" field and free text naming the manufacturer.',
  simulatedDurationMs: 2500,
  raw: {
    documentType: 'material_label',
    detectedLanguage: 'it',
    product: {
      material: 'Acciaio inox AISI 304',
      productType: 'Lamiera',
      finish: '2B',
      thickness: '1,5 mm',
      width: '1000 mm',
      length: '2000 mm',
      dimensions: '1,5 x 1000 x 2000 mm',
      standard: 'EN 10088-2',
    },
    quantity: {
      pieces: 12,
      netWeight: '285,6 kg',
      grossWeight: '291,0 kg',
    },
    traceability: {
      heatNumber: 'H-71155',
      lotNumber: 'LOT-2026-3391',
    },
    dates: { packingDate: '2026-04-22' },
    commercial: {
      customerPurchaseOrder: 'CC006988',
      customerName: 'SC COLOR-METAL SRL',
    },
    additionalFields: [
      {
        key: 'fornitore',
        label: 'Fornitore',
        value: 'Acciai Speciali Lombardi S.p.A.',
        confidence: 0.9,
        sourceText: 'Fornitore: Acciai Speciali Lombardi S.p.A.',
        group: 'additional',
      },
      {
        key: 'note',
        label: 'Note',
        value: 'Prodotto da Acciai Speciali Lombardi - Brescia',
        confidence: 0.87,
        sourceText: 'Prodotto da Acciai Speciali Lombardi - Brescia',
        group: 'additional',
      },
      {
        key: 'imballo',
        label: 'Imballo',
        value: 'Pallet in legno',
        confidence: 0.88,
        sourceText: 'Imballo: pallet in legno',
        group: 'additional',
      },
    ],
    sensitiveSupplierInformation: [
      {
        category: 'supplier_email',
        value: 'ordini@acciaispeciali-lombardi.it',
        sourceText: 'ordini@acciaispeciali-lombardi.it',
        reason: 'Supplier e-mail address.',
        confidence: 0.96,
      },
    ],
    codes: { barcodes: 1, qrCodes: 1, note: null },
    warnings: [],
    overallConfidence: 0.88,
  },
};

export const LABEL_FIXTURES: LabelFixture[] = [
  alcometAngleProfile,
  germanCoil,
  italianSheet,
];

export function fixtureById(id: string): LabelFixture | undefined {
  return LABEL_FIXTURES.find((fixture) => fixture.id === id);
}

/** Rotate through the fixtures so repeated mock scans do not look identical. */
export function pickFixture(index: number): LabelFixture {
  const fixture = LABEL_FIXTURES[Math.abs(index) % LABEL_FIXTURES.length];
  return fixture ?? alcometAngleProfile;
}
