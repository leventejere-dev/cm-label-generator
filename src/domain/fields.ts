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
 * The app interface is Romanian. The PRINTED label is bilingual: `printLabelRo`
 * is the default, `printLabel` is the English variant kept for export customers.
 * Do not translate `printLabel` — it is the only English caption source left.
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
  /** Caption shown in the review form (app interface — Romanian). */
  label: string;
  /** Caption printed on the A4 label: English variant, for export customers. */
  printLabel: string;
  /** Caption printed on the A4 label: Romanian variant, the default. */
  printLabelRo: string;
  /** Short hint shown to the reviewer as the input placeholder (Romanian). */
  hint?: string;
  /**
   * Filled in by the Color Metal employee, never by the extraction model —
   * these describe OUR delivery, not the supplier's label.
   */
  humanOnly?: boolean;
  /**
   * Kept and shown internally, but never printed on the customer-facing label.
   *
   * The whole `commercial` group is marked this way: a purchase order, a
   * supplier production order or a goods-receipt address are artefacts of how
   * Color Metal BOUGHT the material. They are not supplier-identifying by
   * themselves, but they make it obvious that the sheet was derived from a
   * purchase document — so they stay off the label the customer sees.
   *
   * To print one of them anyway, delete `omitFromLabel: true` from that line.
   */
  omitFromLabel?: boolean;
}

/**
 * Group headings shown in the REVIEW FORM (app interface — Romanian).
 *
 * These used to double as the English printed-label headings. They no longer
 * do: the printed label reads GROUP_TITLES_PRINT_EN / GROUP_TITLES_RO through
 * groupTitle(), so translating the app never changes what gets printed.
 */
export const GROUP_TITLES: Record<FieldGroupId, string> = {
  delivery: 'Livrare',
  product: 'Informații produs',
  quantity: 'Cantitate / greutate',
  traceability: 'Trasabilitate',
  dates: 'Date',
  commercial: 'Referințe comandă',
};

/** Printed-label group headings, English variant (export customers). */
export const GROUP_TITLES_PRINT_EN: Record<FieldGroupId, string> = {
  delivery: 'Delivery',
  product: 'Product information',
  quantity: 'Quantity / weight',
  traceability: 'Traceability',
  dates: 'Dates',
  commercial: 'Order references',
};

/** Printed-label group headings, Romanian variant (the default). */
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
  'Datele tale de livrare. Nu sunt citite de pe eticheta furnizorului — completează-le pentru clientul care primește acest material.';

export const FIELD_CATALOGUE: readonly FieldDescriptor[] = [
  // --- delivery (entered by Color Metal, never extracted) -------------------
  { group: 'delivery', key: 'clientName', label: 'Client', printLabel: 'Client', printLabelRo: 'Client', hint: 'Clientul Color Metal care primește acest material', humanOnly: true },
  { group: 'delivery', key: 'clientAddress', label: 'Adresă livrare', printLabel: 'Delivery address', printLabelRo: 'Adresă livrare', hint: 'Unde merge acest palet sau această legătură', humanOnly: true },
  { group: 'delivery', key: 'clientOrder', label: 'Comandă client', printLabel: 'Customer order', printLabelRo: 'Comandă client', hint: 'Numărul de comandă sau de contract al clientului tău', humanOnly: true },

  // --- product --------------------------------------------------------------
  { group: 'product', key: 'material', label: 'Material', printLabel: 'Material', printLabelRo: 'Material', hint: 'ex.: aluminiu, cupru, oțel inox' },
  { group: 'product', key: 'productType', label: 'Tip produs', printLabel: 'Product', printLabelRo: 'Produs', hint: 'ex.: tablă, rulou, bară, cornier / profil L' },
  { group: 'product', key: 'profileType', label: 'Tip profil', printLabel: 'Profile', printLabelRo: 'Profil', hint: 'Denumirea profilului, dacă produsul este extrudat' },
  { group: 'product', key: 'alloy', label: 'Aliaj', printLabel: 'Alloy', printLabelRo: 'Aliaj', hint: 'ex.: EN AW-5754, EN AW-2024, 6060, CuZn37' },
  { group: 'product', key: 'temper', label: 'Stare', printLabel: 'Temper', printLabelRo: 'Stare', hint: 'ex.: T6, T651, H111, O/H111' },
  { group: 'product', key: 'standard', label: 'Standard / normă', printLabel: 'Standard', printLabelRo: 'Standard', hint: 'ex.: EN 573-3, EN 755-2' },
  { group: 'product', key: 'finish', label: 'Finisaj', printLabel: 'Finish', printLabelRo: 'Finisaj', hint: 'ex.: Mill, eloxat, 2B' },
  { group: 'product', key: 'surfaceTreatment', label: 'Suprafață / acoperire', printLabel: 'Surface', printLabelRo: 'Suprafață', hint: 'Acoperire, vopsea, folie, cod RAL' },
  { group: 'product', key: 'dimensions', label: 'Dimensiuni', printLabel: 'Dimensions', printLabelRo: 'Dimensiuni', hint: 'Șirul complet de dimensiuni, exact ca pe etichetă' },
  { group: 'product', key: 'thickness', label: 'Grosime', printLabel: 'Thickness', printLabelRo: 'Grosime', hint: 'Păstrează unitatea de măsură și zecimalele exacte' },
  { group: 'product', key: 'width', label: 'Lățime', printLabel: 'Width', printLabelRo: 'Lățime' },
  { group: 'product', key: 'length', label: 'Lungime', printLabel: 'Length', printLabelRo: 'Lungime' },
  { group: 'product', key: 'diameter', label: 'Diametru', printLabel: 'Diameter', printLabelRo: 'Diametru' },
  { group: 'product', key: 'wallThickness', label: 'Grosime perete', printLabel: 'Wall thk.', printLabelRo: 'Grosime perete' },

  // --- quantity -------------------------------------------------------------
  { group: 'quantity', key: 'pieces', label: 'Bucăți', printLabel: 'Pieces', printLabelRo: 'Număr bucăți', hint: 'Număr de bucăți / bare / table' },
  { group: 'quantity', key: 'quantity', label: 'Cantitate', printLabel: 'Quantity', printLabelRo: 'Cantitate', hint: 'Cantitatea, când nu se numără în bucăți' },
  { group: 'quantity', key: 'unit', label: 'Unitate de măsură', printLabel: 'Unit', printLabelRo: 'UM', hint: 'ex.: buc, kg, m, m²' },
  { group: 'quantity', key: 'netWeight', label: 'Greutate netă', printLabel: 'Net weight', printLabelRo: 'Cantitate netă', hint: 'Nu o confunda cu greutatea brută' },
  { group: 'quantity', key: 'grossWeight', label: 'Greutate brută', printLabel: 'Gross weight', printLabelRo: 'Cantitate brută' },
  { group: 'quantity', key: 'tareWeight', label: 'Tara', printLabel: 'Tare weight', printLabelRo: 'Tara' },
  { group: 'quantity', key: 'packages', label: 'Colete / legături', printLabel: 'Packages', printLabelRo: 'Colete' },

  // --- traceability ---------------------------------------------------------
  { group: 'traceability', key: 'lotNumber', label: 'Nr. lot', printLabel: 'Lot', printLabelRo: 'Lot' },
  { group: 'traceability', key: 'packageNumber', label: 'Nr. pachet', printLabel: 'Package no.', printLabelRo: 'Număr pachet', hint: 'Numărul legăturii sau al pachetului de pe această unitate' },
  { group: 'traceability', key: 'castNumber', label: 'Nr. șarjă', printLabel: 'Cast no.', printLabelRo: 'Șarjă' },
  { group: 'traceability', key: 'heatNumber', label: 'Nr. șarjă (heat)', printLabel: 'Heat no.', printLabelRo: 'Șarjă (heat)' },
  { group: 'traceability', key: 'batchNumber', label: 'Nr. lot fabricație', printLabel: 'Batch no.', printLabelRo: 'Lot fabricație' },
  { group: 'traceability', key: 'coilNumber', label: 'Nr. rulou', printLabel: 'Coil no.', printLabelRo: 'Număr rulou' },
  { group: 'traceability', key: 'palletNumber', label: 'Nr. palet', printLabel: 'Pallet no.', printLabelRo: 'Număr palet' },
  { group: 'traceability', key: 'bundleNumber', label: 'Nr. legătură', printLabel: 'Bundle no.', printLabelRo: 'Număr legătură' },
  { group: 'traceability', key: 'serialNumber', label: 'Nr. serie', printLabel: 'Serial no.', printLabelRo: 'Număr serie' },
  { group: 'traceability', key: 'certificateNumber', label: 'Nr. certificat', printLabel: 'Certificate no.', printLabelRo: 'Număr certificat' },

  // --- dates ----------------------------------------------------------------
  { group: 'dates', key: 'productionDate', label: 'Data producției', printLabel: 'Production date', printLabelRo: 'Data producției' },
  { group: 'dates', key: 'packingDate', label: 'Data împachetării', printLabel: 'Packing date', printLabelRo: 'Data împachetării' },
  { group: 'dates', key: 'deliveryDate', label: 'Data livrării', printLabel: 'Delivery date', printLabelRo: 'Data livrării' },

  // --- commercial -----------------------------------------------------------
  { group: 'commercial', key: 'customerPurchaseOrder', label: 'Comandă achiziție', printLabel: 'Purchase order', printLabelRo: 'Comandă achiziție', hint: 'Numărul comenzii de achiziție Color Metal, tipărit de furnizor', omitFromLabel: true },
  { group: 'commercial', key: 'productionOrder', label: 'Comandă producție / contract', printLabel: 'Production order', printLabelRo: 'Comandă producție', omitFromLabel: true },
  { group: 'commercial', key: 'customerReference', label: 'Referință client', printLabel: 'Customer ref.', printLabelRo: 'Referință client', omitFromLabel: true },
  { group: 'commercial', key: 'deliveryNoteNumber', label: 'Nr. aviz de însoțire', printLabel: 'Delivery note', printLabelRo: 'Aviz de însoțire', omitFromLabel: true },
  { group: 'commercial', key: 'positionNumber', label: 'Poziție / nr. articol', printLabel: 'Position', printLabelRo: 'Poziție', omitFromLabel: true },
  { group: 'commercial', key: 'customerName', label: 'Client pe eticheta furnizorului', printLabel: 'Ordered by', printLabelRo: 'Comandat de', hint: 'De obicei chiar Color Metal — NU este furnizorul', omitFromLabel: true },
  { group: 'commercial', key: 'deliveryAddress', label: 'Adresă livrare pe eticheta furnizorului', printLabel: 'Received at', printLabelRo: 'Recepționat la', hint: 'De obicei un punct de lucru Color Metal', omitFromLabel: true },
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

/**
 * Ad-hoc field captions that name an identifier in the SUPPLIER's own numbering
 * scheme rather than a physical property of the material: article numbers,
 * product/material codes, ERP references, order references.
 *
 * These are kept in the record and shown on the review screen, but not printed:
 * a string like "500-0830/6060/T6/50/50/2/0/Mill-" is instantly recognisable as
 * one supplier's article code, and everything it encodes (alloy, temper,
 * dimensions, finish) is already printed as its own field.
 *
 * Physical properties with unusual captions — "Innendurchmesser", "Imballo" —
 * are NOT matched and still print.
 */
const SUPPLIER_CODE_CAPTIONS: RegExp[] = [
  /\bproduct\s*(code|no\.?|number)\b/i,
  /\bitem\s*(code|no\.?|number)\b/i,
  /\bmaterial\s*(code|no\.?|number)\b/i,
  /\barticle\b/i,
  /\bart\.?\s*(no\.?|nr\.?|code)\b/i,
  /\bsku\b/i,
  /\bsap\b/i,
  /\berp\b/i,
  /\border\b/i,
  /\bartikel/i,
  /\bcodice\b/i,
  /\bcod\.?\s*(produs|articol|material)\b/i,
  /\bcikksz[aá]m/i,
  /\breferen[cz]/i,
];

/** Should this ad-hoc field stay off the customer-facing label? */
export function isSupplierCodeCaption(caption: string): boolean {
  const text = caption.trim();
  if (!text) return false;
  return SUPPLIER_CODE_CAPTIONS.some((re) => re.test(text));
}

/** Groups where every field is withheld from the printed label. */
export function isGroupOmittedFromLabel(group: FieldGroupId): boolean {
  const fields = fieldsInGroup(group);
  return fields.length > 0 && fields.every((field) => field.omitFromLabel === true);
}

export function groupTitle(group: FieldGroupId, language: LabelLanguage): string {
  return language === 'ro' ? GROUP_TITLES_RO[group] : GROUP_TITLES_PRINT_EN[group];
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
