/**
 * VECTOR PDF EXPORT — A5 (148 × 210 mm)
 * ---------------------------------------------------------------------------
 * Builds a real PDF with pdf-lib: selectable, searchable, crisp text — not a
 * screenshot of the DOM. It consumes the same LabelDocument as the HTML
 * renderer, so the two can never describe different labels.
 *
 * Point sizes mirror src/styles/label.css. If you change one, change both.
 *
 * Known limitation: the standard PDF fonts use WinAnsi encoding, which has no
 * ă/ș/ț/ő/ű or Cyrillic. Those characters are transliterated. For a
 * byte-perfect Unicode PDF use Print → "Save as PDF", which goes through the
 * browser's own renderer.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { company, hexToRgb01, logoUrl, palette } from '../../branding/brand';
import type { LabelDocument, LabelSection } from '../../domain/labelDocument';

/** A5 in PostScript points. */
const PAGE = { width: 419.53, height: 595.28 };
const MARGIN = 22.7; // 8 mm
const GUTTER = 12.8; // 4.5 mm

const INK = hexToRgb01(palette.ink);
const MUTED = hexToRgb01(palette.inkMuted);
const BORDER = hexToRgb01(palette.border);
const BORDER_STRONG = hexToRgb01(palette.borderStrong);
const GOLD = hexToRgb01(palette.brandGold);
const GREY = hexToRgb01(palette.brandGrey);
const TINT = hexToRgb01('#F1EFEA');
const DELIVERY_BG = hexToRgb01('#FAFAF9');

const color = (c: { r: number; g: number; b: number }) => rgb(c.r, c.g, c.b);

/** Characters outside WinAnsi that turn up on European material labels. */
const TRANSLITERATION: Record<string, string> = {
  ă: 'a', Ă: 'A', â: 'a', Â: 'A', î: 'i', Î: 'I',
  ș: 's', Ș: 'S', ş: 's', Ş: 'S', ț: 't', Ț: 'T', ţ: 't', Ţ: 'T',
  ő: 'o', Ő: 'O', ű: 'u', Ű: 'U',
  č: 'c', Č: 'C', ć: 'c', Ć: 'C', š: 's', Š: 'S', ž: 'z', Ž: 'Z',
  ł: 'l', Ł: 'L', ą: 'a', Ą: 'A', ę: 'e', Ę: 'E', ń: 'n', Ń: 'N',
  ź: 'z', Ź: 'Z', ż: 'z', Ż: 'Z', ě: 'e', Ě: 'E', ř: 'r', Ř: 'R',
  ů: 'u', Ů: 'U', ť: 't', Ť: 'T', ď: 'd', Ď: 'D', ň: 'n', Ň: 'N',
  '–': '-', '—': '-', '×': 'x', '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...',
  ' ': ' ',
};

export function toWinAnsi(input: string): string {
  let out = '';
  for (const char of input) {
    const mapped = TRANSLITERATION[char];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const code = char.codePointAt(0) ?? 63;
    out += code <= 0xff ? char : '?';
  }
  return out;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const safe = toWinAnsi(text);
  const words = safe.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      let chunk = '';
      for (const char of word) {
        if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk += char;
        }
      }
      current = chunk;
    } else {
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  monoBold: PDFFont;
}

/** Try to embed the configured logo. Only PNG/JPEG can be embedded in a PDF. */
async function loadLogo(pdf: PDFDocument): Promise<PDFImage | null> {
  try {
    const url = logoUrl();
    if (!/\.(png|jpe?g)(\?|$)/i.test(url)) return null;
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return /\.png(\?|$)/i.test(url) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

export async function renderLabelPdf(doc: LabelDocument): Promise<Blob> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${company.name} ${doc.cmId}`);
  pdf.setSubject(doc.strings.documentTitle);
  // No producer/creator credit: the sheet must carry no generator trace.

  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    monoBold: await pdf.embedFont(StandardFonts.CourierBold),
  };

  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const logo = await loadLogo(pdf);
  const contentWidth = PAGE.width - MARGIN * 2;

  let cursorY = PAGE.height - MARGIN;

  // --- header ---------------------------------------------------------------
  const headerTop = cursorY;
  if (logo) {
    const targetHeight = 22.7; // 8 mm
    const ratio = logo.width / logo.height;
    page.drawImage(logo, {
      x: MARGIN,
      y: headerTop - targetHeight,
      width: Math.min(targetHeight * ratio, 176),
      height: targetHeight,
    });
    page.drawText(toWinAnsi(company.productLine), {
      x: MARGIN,
      y: headerTop - targetHeight - 7,
      size: 4.6,
      font: fonts.regular,
      color: color(GREY),
    });
  } else {
    const colorWord = company.name.split(' ')[0] ?? 'COLOR';
    const metalWord = company.name.split(' ')[1] ?? 'METAL';
    page.drawText(toWinAnsi(colorWord), {
      x: MARGIN, y: headerTop - 15, size: 15, font: fonts.bold, color: color(GOLD),
    });
    page.drawText(toWinAnsi(metalWord), {
      x: MARGIN + fonts.bold.widthOfTextAtSize(toWinAnsi(colorWord), 15) + 5,
      y: headerTop - 15, size: 15, font: fonts.bold, color: color(GREY),
    });
    page.drawText(toWinAnsi(company.tagline), {
      x: MARGIN, y: headerTop - 23, size: 5, font: fonts.regular, color: color(GREY),
    });
    page.drawText(toWinAnsi(company.productLine), {
      x: MARGIN, y: headerTop - 30, size: 4.6, font: fonts.regular, color: color(GREY),
    });
  }

  drawRight(page, doc.strings.documentTitle.toUpperCase(), fonts.bold, 8, headerTop - 8, contentWidth, INK);
  drawRight(page, doc.strings.cmIdLabel.toUpperCase(), fonts.regular, 4.8, headerTop - 17, contentWidth, MUTED);
  drawRight(page, doc.cmId, fonts.monoBold, 10.5, headerTop - 29, contentWidth, INK);

  cursorY = headerTop - 38;

  // Header rule with a gold accent segment.
  page.drawRectangle({ x: MARGIN, y: cursorY, width: contentWidth - 68, height: 2.55, color: color(INK) });
  page.drawRectangle({ x: MARGIN + contentWidth - 68, y: cursorY, width: 68, height: 2.55, color: color(GOLD) });
  cursorY -= 12;

  // --- delivery block -------------------------------------------------------
  if (doc.delivery.length > 0) {
    const perLine = Math.min(2, doc.delivery.length);
    const lines = Math.ceil(doc.delivery.length / perLine);
    const blockHeight = 8 + lines * 17;
    const blockY = cursorY - blockHeight;
    page.drawRectangle({
      x: MARGIN, y: blockY, width: contentWidth, height: blockHeight,
      color: color(DELIVERY_BG), borderColor: color(BORDER_STRONG), borderWidth: 0.7,
    });
    page.drawRectangle({ x: MARGIN, y: blockY, width: 2.8, height: blockHeight, color: color(GOLD) });

    const cellWidth = (contentWidth - 18) / perLine;
    doc.delivery.forEach((row, index) => {
      const col = index % perLine;
      const line = Math.floor(index / perLine);
      const x = MARGIN + 9 + col * cellWidth;
      const y = blockY + blockHeight - 9 - line * 17;
      page.drawText(toWinAnsi(row.label.toUpperCase()), {
        x, y, size: 4.8, font: fonts.bold, color: color(MUTED),
      });
      const valueLines = wrapText(row.value, fonts.bold, 8.5, cellWidth - 6);
      page.drawText(valueLines[0] ?? '', {
        x, y: y - 8.5, size: 8.5, font: fonts.bold, color: color(INK),
      });
    });
    cursorY = blockY - 12;
  }

  // --- hero -----------------------------------------------------------------
  if (doc.headline) {
    page.drawText(toWinAnsi(doc.headline), {
      x: MARGIN, y: cursorY - 13, size: 13, font: fonts.bold, color: color(INK),
    });
    cursorY -= 17;
  }
  if (doc.subheadline) {
    const lines = wrapText(doc.subheadline, fonts.bold, 21, contentWidth);
    for (const line of lines) {
      page.drawText(line, { x: MARGIN, y: cursorY - 21, size: 21, font: fonts.bold, color: color(INK) });
      cursorY -= 23;
    }
    cursorY -= 3;
  }

  if (doc.descriptors.length > 0) {
    let chipX = MARGIN;
    const chipY = cursorY - 12;
    for (const chip of doc.descriptors) {
      const labelText = toWinAnsi(chip.label.toUpperCase());
      const valueText = toWinAnsi(chip.value);
      const width =
        fonts.regular.widthOfTextAtSize(labelText, 4.8) +
        fonts.bold.widthOfTextAtSize(valueText, 7) + 13;
      if (chipX + width > MARGIN + contentWidth) break;
      page.drawRectangle({
        x: chipX, y: chipY, width, height: 12,
        borderColor: color(BORDER_STRONG), borderWidth: 0.6,
      });
      page.drawText(labelText, { x: chipX + 4, y: chipY + 4, size: 4.8, font: fonts.regular, color: color(MUTED) });
      page.drawText(valueText, {
        x: chipX + 7 + fonts.regular.widthOfTextAtSize(labelText, 4.8),
        y: chipY + 3.4, size: 7, font: fonts.bold, color: color(INK),
      });
      chipX += width + 4;
    }
    cursorY = chipY - 11;
  }

  // --- metrics --------------------------------------------------------------
  if (doc.metrics.length > 0) {
    const count = doc.metrics.length;
    const boxGap = 5.7;
    const boxWidth = (contentWidth - boxGap * (count - 1)) / count;
    const boxHeight = 32;
    const boxY = cursorY - boxHeight;
    doc.metrics.forEach((metric, index) => {
      const x = MARGIN + index * (boxWidth + boxGap);
      page.drawRectangle({
        x, y: boxY, width: boxWidth, height: boxHeight,
        borderColor: color(INK), borderWidth: 0.85,
      });
      page.drawText(toWinAnsi(metric.label.toUpperCase()), {
        x: x + 5, y: boxY + boxHeight - 9, size: 4.6, font: fonts.bold, color: color(MUTED),
      });
      const valueLines = wrapText(metric.value, fonts.bold, 13, boxWidth - 10);
      page.drawText(valueLines[0] ?? '', {
        x: x + 5, y: boxY + 7, size: 13, font: fonts.bold, color: color(INK),
      });
    });
    cursorY = boxY - 12;
  }

  // --- sections in two balanced columns -------------------------------------
  const columnWidth = (contentWidth - GUTTER) / 2;
  const measured = doc.sections.map((section) => ({
    section,
    height: measureSection(section, fonts, columnWidth),
  }));

  const columns: Array<{ x: number; y: number }> = [
    { x: MARGIN, y: cursorY },
    { x: MARGIN + columnWidth + GUTTER, y: cursorY },
  ];

  const footerTop = MARGIN + 24;

  for (const entry of measured) {
    const target = (columns[0]?.y ?? 0) >= (columns[1]?.y ?? 0) ? columns[0] : columns[1];
    if (!target) break;
    if (target.y - entry.height < footerTop) {
      const other = target === columns[0] ? columns[1] : columns[0];
      if (!other || other.y - entry.height < footerTop) continue;
      drawSection(page, entry.section, fonts, other.x, other.y, columnWidth);
      other.y -= entry.height + 8;
      continue;
    }
    drawSection(page, entry.section, fonts, target.x, target.y, columnWidth);
    target.y -= entry.height + 8;
  }

  // --- footer ---------------------------------------------------------------
  // CM ID, legal entity and the date. Nothing else — no generator, no template.
  page.drawRectangle({ x: MARGIN, y: MARGIN + 20, width: contentWidth, height: 1.1, color: color(INK) });
  page.drawText(toWinAnsi(doc.cmId), {
    x: MARGIN, y: MARGIN + 12, size: 6.4, font: fonts.monoBold, color: color(INK),
  });
  page.drawText(toWinAnsi(doc.footer.companyLine), {
    x: MARGIN, y: MARGIN + 5, size: 5.4, font: fonts.regular, color: color(MUTED),
  });
  drawRight(page, doc.footer.generatedAtLabel, fonts.regular, 5.4, MARGIN + 5, contentWidth, MUTED);

  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

function drawRight(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  y: number,
  contentWidth: number,
  tone: { r: number; g: number; b: number },
): void {
  const safe = toWinAnsi(text);
  const width = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, { x: MARGIN + contentWidth - width, y, size, font, color: color(tone) });
}

const SECTION_TITLE_HEIGHT = 11;
const ROW_LINE_HEIGHT = 8.6;

function measureSection(section: LabelSection, fonts: Fonts, width: number): number {
  const valueWidth = width * 0.6 - 6;
  let height = SECTION_TITLE_HEIGHT + 3;
  for (const row of section.rows) {
    const lines = wrapText(row.value, fonts.bold, 7.4, valueWidth);
    height += Math.max(ROW_LINE_HEIGHT, lines.length * ROW_LINE_HEIGHT) + 1.5;
  }
  return height;
}

function drawSection(
  page: PDFPage,
  section: LabelSection,
  fonts: Fonts,
  x: number,
  top: number,
  width: number,
): void {
  page.drawRectangle({
    x, y: top - SECTION_TITLE_HEIGHT, width, height: SECTION_TITLE_HEIGHT, color: color(TINT),
  });
  page.drawRectangle({
    x, y: top - SECTION_TITLE_HEIGHT, width: 1.7, height: SECTION_TITLE_HEIGHT, color: color(INK),
  });
  page.drawText(toWinAnsi(section.title.toUpperCase()), {
    x: x + 5, y: top - 8, size: 5.4, font: fonts.bold, color: color(INK),
  });

  let y = top - SECTION_TITLE_HEIGHT - 3;
  const labelWidth = width * 0.4;
  const valueX = x + labelWidth + 3;
  const valueWidth = width * 0.6 - 6;

  for (const row of section.rows) {
    const valueLines = wrapText(row.value, fonts.bold, 7.4, valueWidth);
    const rowHeight = Math.max(ROW_LINE_HEIGHT, valueLines.length * ROW_LINE_HEIGHT);

    page.drawText(toWinAnsi(row.label), {
      x: x + 2, y: y - 6.5, size: 5.8, font: fonts.regular, color: color(MUTED),
    });
    valueLines.forEach((line, index) => {
      page.drawText(line, {
        x: valueX, y: y - 6.5 - index * ROW_LINE_HEIGHT, size: 7.4, font: fonts.bold, color: color(INK),
      });
    });

    y -= rowHeight + 1.5;
    page.drawRectangle({ x, y: y + 0.8, width, height: 0.3, color: color(BORDER) });
  }
}

/** Trigger a browser download of the generated PDF. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
