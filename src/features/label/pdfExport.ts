/**
 * VECTOR PDF EXPORT
 * ---------------------------------------------------------------------------
 * Builds a real A4 PDF with pdf-lib: selectable, searchable, crisp text — not a
 * screenshot of the DOM. It consumes the same LabelDocument as the HTML
 * renderer, so the two can never describe different labels.
 *
 * Known limitation: the standard PDF fonts use WinAnsi encoding, which has no
 * ă/ș/ț/ő/ű or Cyrillic. Those characters are transliterated (and noted in the
 * README). For a byte-perfect Unicode PDF use Print → "Save as PDF", which goes
 * through the browser's own renderer.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib';
import { company, hexToRgb01, logoUrl, palette } from '../../branding/brand';
import type { LabelDocument, LabelSection } from '../../domain/labelDocument';

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 34; // 12 mm
const GUTTER = 17;

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
  ' ': ' ',
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
    // A single word longer than the column: hard-break it.
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
  mono: PDFFont;
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
  pdf.setTitle(`${company.name} label ${doc.cmId}`);
  pdf.setSubject(doc.strings.documentTitle);
  pdf.setProducer(company.generator);
  pdf.setCreator(company.generator);

  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
    monoBold: await pdf.embedFont(StandardFonts.CourierBold),
  };

  const page = pdf.addPage([A4.width, A4.height]);
  const logo = await loadLogo(pdf);
  const contentWidth = A4.width - MARGIN * 2;

  let cursorY = A4.height - MARGIN;

  // --- header ---------------------------------------------------------------
  const headerTop = cursorY;
  if (logo) {
    const targetHeight = 31; // 11 mm
    const ratio = logo.width / logo.height;
    page.drawImage(logo, {
      x: MARGIN,
      y: headerTop - targetHeight,
      width: Math.min(targetHeight * ratio, 238),
      height: targetHeight,
    });
    page.drawText(toWinAnsi(company.productLine), {
      x: MARGIN,
      y: headerTop - targetHeight - 10,
      size: 6,
      font: fonts.regular,
      color: color(GREY),
    });
  } else {
    const colorWord = company.name.split(' ')[0] ?? 'COLOR';
    const metalWord = company.name.split(' ')[1] ?? 'METAL';
    page.drawText(toWinAnsi(colorWord), {
      x: MARGIN,
      y: headerTop - 22,
      size: 22,
      font: fonts.bold,
      color: color(GOLD),
    });
    page.drawText(toWinAnsi(metalWord), {
      x: MARGIN + fonts.bold.widthOfTextAtSize(toWinAnsi(colorWord), 22) + 7,
      y: headerTop - 22,
      size: 22,
      font: fonts.bold,
      color: color(GREY),
    });
    page.drawText(toWinAnsi(company.tagline), {
      x: MARGIN,
      y: headerTop - 33,
      size: 6.5,
      font: fonts.regular,
      color: color(GREY),
    });
    page.drawText(toWinAnsi(company.productLine), {
      x: MARGIN,
      y: headerTop - 43,
      size: 6,
      font: fonts.regular,
      color: color(GREY),
    });
  }

  drawRight(page, doc.strings.documentTitle.toUpperCase(), fonts.bold, 11, headerTop - 11, MARGIN, contentWidth, INK);
  drawRight(page, doc.strings.cmIdLabel.toUpperCase(), fonts.regular, 6.5, headerTop - 24, MARGIN, contentWidth, MUTED);
  drawRight(page, doc.cmId, fonts.monoBold, 14, headerTop - 39, MARGIN, contentWidth, INK);

  cursorY = headerTop - 52;

  // Header rule with a gold accent segment.
  page.drawRectangle({ x: MARGIN, y: cursorY, width: contentWidth - 96, height: 3.4, color: color(INK) });
  page.drawRectangle({ x: MARGIN + contentWidth - 96, y: cursorY, width: 96, height: 3.4, color: color(GOLD) });
  cursorY -= 16;

  // --- delivery block -------------------------------------------------------
  if (doc.delivery.length > 0) {
    const rowsPerLine = Math.min(3, doc.delivery.length);
    const lines = Math.ceil(doc.delivery.length / rowsPerLine);
    const blockHeight = 12 + lines * 22;
    const blockY = cursorY - blockHeight;
    page.drawRectangle({
      x: MARGIN,
      y: blockY,
      width: contentWidth,
      height: blockHeight,
      color: color(DELIVERY_BG),
      borderColor: color(BORDER_STRONG),
      borderWidth: 0.8,
    });
    page.drawRectangle({ x: MARGIN, y: blockY, width: 3.4, height: blockHeight, color: color(GOLD) });

    const cellWidth = (contentWidth - 24) / rowsPerLine;
    doc.delivery.forEach((row, index) => {
      const col = index % rowsPerLine;
      const line = Math.floor(index / rowsPerLine);
      const x = MARGIN + 12 + col * cellWidth;
      const y = blockY + blockHeight - 12 - line * 22;
      page.drawText(toWinAnsi(row.label.toUpperCase()), {
        x,
        y,
        size: 6.5,
        font: fonts.bold,
        color: color(MUTED),
      });
      const valueLines = wrapText(row.value, fonts.bold, 11, cellWidth - 8);
      page.drawText(valueLines[0] ?? '', {
        x,
        y: y - 11,
        size: 11,
        font: fonts.bold,
        color: color(INK),
      });
    });
    cursorY = blockY - 16;
  }

  // --- hero -----------------------------------------------------------------
  if (doc.headline) {
    page.drawText(toWinAnsi(doc.headline), {
      x: MARGIN,
      y: cursorY - 20,
      size: 20,
      font: fonts.bold,
      color: color(INK),
    });
    cursorY -= 26;
  }
  if (doc.subheadline) {
    const lines = wrapText(doc.subheadline, fonts.bold, 30, contentWidth);
    for (const line of lines) {
      page.drawText(line, { x: MARGIN, y: cursorY - 30, size: 30, font: fonts.bold, color: color(INK) });
      cursorY -= 33;
    }
    cursorY -= 4;
  }

  if (doc.descriptors.length > 0) {
    let chipX = MARGIN;
    const chipY = cursorY - 16;
    for (const chip of doc.descriptors) {
      const labelText = toWinAnsi(chip.label.toUpperCase());
      const valueText = toWinAnsi(chip.value);
      const width =
        fonts.regular.widthOfTextAtSize(labelText, 6.5) +
        fonts.bold.widthOfTextAtSize(valueText, 8.5) +
        18;
      if (chipX + width > MARGIN + contentWidth) break;
      page.drawRectangle({
        x: chipX,
        y: chipY,
        width,
        height: 16,
        borderColor: color(BORDER_STRONG),
        borderWidth: 0.7,
      });
      page.drawText(labelText, { x: chipX + 5, y: chipY + 5, size: 6.5, font: fonts.regular, color: color(MUTED) });
      page.drawText(valueText, {
        x: chipX + 9 + fonts.regular.widthOfTextAtSize(labelText, 6.5),
        y: chipY + 4.5,
        size: 8.5,
        font: fonts.bold,
        color: color(INK),
      });
      chipX += width + 6;
    }
    cursorY = chipY - 14;
  }

  // --- metrics --------------------------------------------------------------
  if (doc.metrics.length > 0) {
    const count = doc.metrics.length;
    const boxGap = 8;
    const boxWidth = (contentWidth - boxGap * (count - 1)) / count;
    const boxHeight = 46;
    const boxY = cursorY - boxHeight;
    doc.metrics.forEach((metric, index) => {
      const x = MARGIN + index * (boxWidth + boxGap);
      page.drawRectangle({
        x,
        y: boxY,
        width: boxWidth,
        height: boxHeight,
        borderColor: color(INK),
        borderWidth: 1,
      });
      page.drawText(toWinAnsi(metric.label.toUpperCase()), {
        x: x + 7,
        y: boxY + boxHeight - 13,
        size: 6.5,
        font: fonts.bold,
        color: color(MUTED),
      });
      const valueLines = wrapText(metric.value, fonts.bold, 19, boxWidth - 14);
      page.drawText(valueLines[0] ?? '', {
        x: x + 7,
        y: boxY + 10,
        size: 19,
        font: fonts.bold,
        color: color(INK),
      });
    });
    cursorY = boxY - 18;
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

  const footerTop = MARGIN + 46;

  for (const entry of measured) {
    // Place into whichever column currently reaches lower down the page.
    const target = (columns[0]?.y ?? 0) >= (columns[1]?.y ?? 0) ? columns[0] : columns[1];
    if (!target) break;
    if (target.y - entry.height < footerTop) {
      const other = target === columns[0] ? columns[1] : columns[0];
      if (!other || other.y - entry.height < footerTop) continue; // will not fit; skip
      drawSection(page, entry.section, fonts, other.x, other.y, columnWidth);
      other.y -= entry.height + 10;
      continue;
    }
    drawSection(page, entry.section, fonts, target.x, target.y, columnWidth);
    target.y -= entry.height + 10;
  }

  // --- notes + footer -------------------------------------------------------
  let noteY = footerTop + 14;
  if (doc.notes.length > 0) {
    for (const note of doc.notes.slice(0, 3)) {
      const lines = wrapText(`• ${note}`, fonts.regular, 7, contentWidth);
      for (const line of lines) {
        page.drawText(line, { x: MARGIN, y: noteY, size: 7, font: fonts.regular, color: color(MUTED) });
        noteY += 9;
      }
    }
  }

  page.drawRectangle({ x: MARGIN, y: MARGIN + 34, width: contentWidth, height: 1.4, color: color(INK) });
  page.drawText(toWinAnsi(doc.cmId), {
    x: MARGIN,
    y: MARGIN + 22,
    size: 8,
    font: fonts.monoBold,
    color: color(INK),
  });
  page.drawText(toWinAnsi(doc.footer.companyLine), {
    x: MARGIN,
    y: MARGIN + 11,
    size: 7,
    font: fonts.regular,
    color: color(MUTED),
  });
  drawRight(
    page,
    `${doc.strings.generatedBy} ${doc.footer.generator} · ${doc.footer.generatedAtLabel}`,
    fonts.regular,
    7,
    MARGIN + 22,
    MARGIN,
    contentWidth,
    MUTED,
  );
  drawRight(
    page,
    `${doc.strings.template} ${doc.footer.version}`,
    fonts.regular,
    7,
    MARGIN + 11,
    MARGIN,
    contentWidth,
    MUTED,
  );

  const bytes = await pdf.save();
  // Copy into a fresh ArrayBuffer so the Blob is not tied to WASM memory.
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

function drawRight(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  y: number,
  margin: number,
  contentWidth: number,
  tone: { r: number; g: number; b: number },
): void {
  const safe = toWinAnsi(text);
  const width = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, { x: margin + contentWidth - width, y, size, font, color: color(tone) });
}

const SECTION_TITLE_HEIGHT = 15;
const ROW_LINE_HEIGHT = 11;

function measureSection(section: LabelSection, fonts: Fonts, width: number): number {
  const valueWidth = width * 0.62 - 8;
  let height = SECTION_TITLE_HEIGHT + 4;
  for (const row of section.rows) {
    const lines = wrapText(row.value, fonts.bold, 9.5, valueWidth);
    height += Math.max(ROW_LINE_HEIGHT, lines.length * ROW_LINE_HEIGHT) + 2;
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
    x,
    y: top - SECTION_TITLE_HEIGHT,
    width,
    height: SECTION_TITLE_HEIGHT,
    color: color(TINT),
  });
  page.drawRectangle({
    x,
    y: top - SECTION_TITLE_HEIGHT,
    width: 2.3,
    height: SECTION_TITLE_HEIGHT,
    color: color(INK),
  });
  page.drawText(toWinAnsi(section.title.toUpperCase()), {
    x: x + 7,
    y: top - 11,
    size: 7,
    font: fonts.bold,
    color: color(INK),
  });

  let y = top - SECTION_TITLE_HEIGHT - 4;
  const labelWidth = width * 0.38;
  const valueX = x + labelWidth + 4;
  const valueWidth = width * 0.62 - 8;

  for (const row of section.rows) {
    const valueLines = wrapText(row.value, fonts.bold, 9.5, valueWidth);
    const rowHeight = Math.max(ROW_LINE_HEIGHT, valueLines.length * ROW_LINE_HEIGHT);

    page.drawText(toWinAnsi(row.label), {
      x: x + 3,
      y: y - 8,
      size: 7.5,
      font: fonts.regular,
      color: color(MUTED),
    });
    valueLines.forEach((line, index) => {
      page.drawText(line, {
        x: valueX,
        y: y - 8 - index * ROW_LINE_HEIGHT,
        size: 9.5,
        font: fonts.bold,
        color: color(INK),
      });
    });

    y -= rowHeight + 2;
    page.drawRectangle({ x, y: y + 1, width, height: 0.4, color: color(BORDER) });
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
