/**
 * THE FIELD CATALOGUE
 * ---------------------------------------------------------------------------
 * One declarative list drives:
 *   • the Zod schema used to validate AI output   (domain/extraction.ts)
 *   • the AI system prompt's field description    (supabase/functions/_shared/prompt.ts)
 *   • the review form                             (features/review/*)
 *   • the A4 label layout                         (domain/labelDocument.ts)
 *
 * Adding a standard field = adding one line here.
 *
 * The set is intentionally small. Anything a supplier prints that is not in
 * this list is preserved in `additionalFields[]` rather than discarded —
 * supplier labels are not standardized and useful data must not be lost just
 * because it has an unusual caption.
 *
 * Romanian print captions are included because the finished label goes to
 * Color Metal's own customers in Romania; the app interface stays in English.
 */

export const FIELD_GROUPS = [
  'delivery',
  'product',
  'quantity',
  'traceability',
  'dates',
  'commercial',
] as const;

export type FieldGroupId = (typeof FIELD_GROUPS)[number];

export type LabelLanguage = 'ro' | 'en';

export interface FieldDescriptor {
  group: FieldGroupId;
  /** Stable machine key. Never translated, never renamed. */
  key: string;
  /** Label shown in the review form (English). */
  label: string;
  /** Caption printed on the A4 label. */
  printLabel: string;
  printLabelRo: string;
  /** Short hint for the reviewer and for the AI prompt. */
  hint?: string;
  /**
   * Filled in by the Color Metal employee, never by the extraction model —
   * these describe OUR delivery, not the supplier's label.
   */
  humanOnly?: boolean;
}

export const GROUP_TITLES: Record<FieldGroupId, string> = {
  delivery: 'Delivery',
  product: 'Product information',
  quantity: 'Quantity / weight',
  traceability: 'Traceability',
  dates: 'Dates',
  commercial: 'Order references',
};

export const GROUP_TITLES_RO: Record<FieldGroupId, string> = {
  delivery: 'Livrare',
  product: 'Informații produs',
  quantity: 'Cantitate / greutate',
  traceability: 'Trasabilitate',
  dates: 'Date',
  commercial: 'Referințe comandă',
};

/** Explanatory subtitle for the delivery group in the review form. */
export const DELIVERY_GROUP_NOTE =
  'Your own delivery details. These are not read from the supplier label — fill them in for the customer receiving this material.';

export const FIELD_CATALOGUE: readonly FieldDescriptor[] = [
  // --- delivery (entered by Color Metal, never extracted) -------------------
  { group: 'delivery', key: 'clientName', label: 'Client', printLabel: 'Client', printLabelRo: 'Client', hint: 'The Color Metal customer receiving this material', humanOnly: true },
  { group: 'delivery', key: 'clientAddress', label: 'Delivery address', printLabel: 'Delivery address', printLabelRo: 'Adresă livrare', hint: 'Where this pallet or bundle is going', humanOnly: true },
  { group: 'delivery', key: 'clientOrder', label: 'Customer order', printLabel: 'Customer order', printLabelRo: 'Comandă client', hint: 'Your customer’s order or contract number', humanOnly: true },

  // --- product --------------------------------------------------------------
  { group: 'product', key: 'material', label: 'Material', printLabel: 'Material', printLabelRo: 'Material', hint: 'e.g. Aluminium, Copper, Stainless steel' },
  { group: 'product', key: 'productType', label: 'Product type', printLabel: 'Product', printLabelRo: 'Produs', hint: 'e.g. Sheet, Coil, Bar, Angle / L-profile' },
  { group: 'product', key: 'profileType', label: 'Profile type', printLabel: 'Profile', printLabelRo: 'Profil', hint: 'Profile designation if the product is an extrusion' },
  { group: 'product', key: 'alloy', label: 'Alloy', printLabel: 'Alloy', printLabelRo: 'Aliaj', hint: 'e.g. EN AW-5754, EN AW-2024, 6060, CuZn37' },
  { group: 'product', key: 'temper', label: 'Temper', printLabel: 'Temper', printLabelRo: 'Stare', hint: 'e.g. T6, T651, H111, O/H111' },
  { group: 'product', key: 'standard', label: 'Standard / norm', printLabel: 'Standard', printLabelRo: 'Standard', hint: 'e.g. EN 573-3, EN 755-2' },
  { group: 'product', key: 'finish', label: 'Finish', printLabel: 'Finish', printLabelRo: 'Finisaj', hint: 'e.g. Mill, Anodised, 2B' },
  { group: 'product', key: 'surfaceTreatment', label: 'Surface / coating', printLabel: 'Surface', printLabelRo: 'Suprafață', hint: 'Coating, paint, film, RAL code' },
  { group: 'product', key: 'dimensions', label: 'Dimensions', printLabel: 'Dimensions', printLabelRo: 'Dimensiuni', hint: 'Full dimensional string exactly as printed' },
  { group: 'product', key: 'thickness', label: 'Thickness', printLabel: 'Thickness', printLabelRo: 'Grosime', hint: 'Keep the unit and the exact decimals' },
  { group: 'product', key: 'width', label: 'Width', printLabel: 'Width', printLabelRo: 'Lățime' },
  { group: 'product', key: 'length', label: 'Length', printLabel: 'Length', printLabelRo: 'Lungime' },
  { group: 'product', key: 'diameter', label: 'Diameter', printLabel: 'Diameter', printLabelRo: 'Diametru' },
  { group: 'product', key: 'wallThickness', label: 'Wall thickness', printLabel: 'Wall thk.', printLabelRo: 'Grosime perete' },

  // --- quantity -------------------------------------------------------------
  { group: 'quantity', key: 'pieces', label: 'Pieces', printLabel: 'Pieces', printLabelRo: 'Număr bucăți', hint: 'Number of pieces / bars / sheets' },
  { group: 'quantity', key: 'quantity', label: 'Quantity', printLabel: 'Quantity', printLabelRo: 'Cantitate', hint: 'Quantity when it is not a piece count' },
  { group: 'quantity', key: 'unit', label: 'Unit', printLabel: 'Unit', printLabelRo: 'UM', hint: 'e.g. pcs, kg, m, m²' },
  { group: 'quantity', key: 'netWeight', label: 'Net weight', printLabel: 'Net weight', printLabelRo: 'Cantitate netă', hint: 'Never mix up with gross weight' },
  { group: 'quantity', key: 'grossWeight', label: 'Gross weight', printLabel: 'Gross weight', printLabelRo: 'Cantitate brută' },
  { group: 'quantity', key: 'tareWeight', label: 'Tare weight', printLabel: 'Tare weight', printLabelRo: 'Tara' },
  { group: 'quantity', key: 'packages', label: 'Packages / bundles', printLabel: 'Packages', printLabelRo: 'Colete' },

  // --- traceability ---------------------------------------------------------
  { group: 'traceability', key: 'lotNumber', label: 'Lot no.', printLabel: 'Lot', printLabelRo: 'Lot' },
  { group: 'traceability', key: 'packageNumber', label: 'Package no.', printLabel: 'Package no.', printLabelRo: 'Număr pachet', hint: 'Bundle or package number on this unit' },
  { group: 'traceability', key: 'castNumber', label: 'Cast no.', printLabel: 'Cast no.', printLabelRo: 'Șarjă' },
  { group: 'traceability', key: 'heatNumber', label: 'Heat no.', printLabel: 'Heat no.', printLabelRo: 'Șarjă (heat)' },
  { group: 'traceability', key: 'batchNumber', label: 'Batch no.', printLabel: 'Batch no.', printLabelRo: 'Lot fabricație' },
  { group: 'traceability', key: 'coilNumber', label: 'Coil no.', printLabel: 'Coil no.', printLabelRo: 'Număr rulou' },
  { group: 'traceability', key: 'palletNumber', label: 'Pallet no.', printLabel: 'Pallet no.', printLabelRo: 'Număr palet' },
  { group: 'traceability', key: 'bundleNumber', label: 'Bundle no.', printLabel: 'Bundle no.', printLabelRo: 'Număr legătură' },
  { group: 'traceability', key: 'serialNumber', label: 'Serial no.', printLabel: 'Serial no.', printLabelRo: 'Număr serie' },
  { group: 'traceability', key: 'certificateNumber', label: 'Certificate no.', printLabel: 'Certificate no.', printLabelRo: 'Număr certificat' },

  // --- dates ----------------------------------------------------------------
  { group: 'dates', key: 'productionDate', label: 'Production date', printLabel: 'Production date', printLabelRo: 'Data producției' },
  { group: 'dates', key: 'packingDate', label: 'Packing date', printLabel: 'Packing date', printLabelRo: 'Data împachetării' },
  { group: 'dates', key: 'deliveryDate', label: 'Delivery date', printLabel: 'Delivery date', printLabelRo: 'Data livrării' },

  // --- commercial -----------------------------------------------------------
  { group: 'commercial', key: 'customerPurchaseOrder', label: 'Purchase order', printLabel: 'Purchase order', printLabelRo: 'Comandă achiziție', hint: 'Color Metal purchase order number printed by the supplier' },
  { group: 'commercial', key: 'productionOrder', label: 'Production order / contract', printLabel: 'Production order', printLabelRo: 'Comandă producție' },
  { group: 'commercial', key: 'customerReference', label: 'Customer reference', printLabel: 'Customer ref.', printLabelRo: 'Referință client' },
  { group: 'commercial', key: 'deliveryNoteNumber', label: 'Delivery note no.', printLabel: 'Delivery note', printLabelRo: 'Aviz de însoțire' },
  { group: 'commercial', key: 'positionNumber', label: 'Position / item no.', printLabel: 'Position', printLabelRo: 'Poziție' },
  { group: 'commercial', key: 'customerName', label: 'Customer on supplier label', printLabel: 'Ordered by', printLabelRo: 'Comandat de', hint: 'Usually Color Metal itself — this is NOT the supplier' },
  { group: 'commercial', key: 'deliveryAddress', label: 'Ship-to on supplier label', printLabel: 'Received at', printLabelRo: 'Recepționat la', hint: 'Usually a Color Metal site' },
] as const;

const BY_KEY = new Map<string, FieldDescriptor>(FIELD_CATALOGUE.map((f) => [f.key, f]));
const BY_GROUP = new Map<FieldGroupId, FieldDescriptor[]>(
  FIELD_GROUPS.map((g) => [g, FIELD_CATALOGUE.filter((f) => f.group === g)]),
);

export function fieldsInGroup(group: FieldGroupId): FieldDescriptor[] {
  return BY_GROUP.get(group) ?? [];
}

export function describeField(key: string): FieldDescriptor | undefined {
  return BY_KEY.get(key);
}

export function fieldKeysInGroup(group: FieldGroupId): string[] {
  return fieldsInGroup(group).map((f) => f.key);
}

/** Fields the extraction model is asked about (everything except our own data). */
export function extractableFields(): FieldDescriptor[] {
  return FIELD_CATALOGUE.filter((field) => !field.humanOnly);
}

export function groupTitle(group: FieldGroupId, language: LabelLanguage): string {
  return language === 'ro' ? GROUP_TITLES_RO[group] : GROUP_TITLES[group];
}

export function printCaption(field: FieldDescriptor, language: LabelLanguage): string {
  return language === 'ro' ? field.printLabelRo : field.printLabel;
}

/** Human label for any key, standard or ad-hoc. */
export function humanLabel(key: string, fallbackLabel?: string): string {
  const known = BY_KEY.get(key);
  if (known) return known.label;
  if (fallbackLabel && fallbackLabel.trim()) return fallbackLabel.trim();
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}
