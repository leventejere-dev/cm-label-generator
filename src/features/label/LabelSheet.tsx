/**
 * THE COLOR METAL MATERIAL LABEL — A5 (148 × 210 mm)
 * ---------------------------------------------------------------------------
 * Rendered at true physical size and scaled down for the on-screen preview with
 * a CSS transform. Printing removes the transform, so what you see is exactly
 * what the printer produces.
 *
 * What is deliberately NOT on this sheet: any generator credit, any template
 * version, any note about the supplier's original label, and any procurement
 * reference. See domain/labelDocument.ts and domain/fields.ts.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CmLogo } from '../../branding/CmLogo';
import { company } from '../../branding/brand';
import type { LabelDocument, LabelSection } from '../../domain/labelDocument';

const SHEET_WIDTH_MM = 148;
const SHEET_HEIGHT_MM = 210;
const MM_PER_INCH = 25.4;
const CSS_DPI = 96;

const SHEET_WIDTH_PX = (SHEET_WIDTH_MM / MM_PER_INCH) * CSS_DPI;
const SHEET_HEIGHT_PX = (SHEET_HEIGHT_MM / MM_PER_INCH) * CSS_DPI;

/** Preview never grows past this, so an A5 sheet does not fill a desktop screen. */
const MAX_PREVIEW_WIDTH_PX = 620;

export interface LabelSheetProps {
  doc: LabelDocument;
  /** Called with true when the content does not fit on one sheet. */
  onOverflowChange?: (overflowing: boolean) => void;
}

export function LabelSheet({ doc, onOverflowChange }: LabelSheetProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const available = Math.min(viewport.clientWidth, MAX_PREVIEW_WIDTH_PX);
    if (available <= 0) return;
    setScale(Math.min(1, available / SHEET_WIDTH_PX));
  }, []);

  useEffect(() => {
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    if (viewportRef.current) observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || !onOverflowChange) return;
    // Two ways content can fall off the sheet: past the bottom, or into a third
    // (clipped) column. A 2 px tolerance avoids sub-pixel false positives.
    const sections = sectionsRef.current;
    const verticalOverflow = sheet.scrollHeight > sheet.clientHeight + 2;
    const columnOverflow = sections ? sections.scrollWidth > sections.clientWidth + 2 : false;
    onOverflowChange(verticalOverflow || columnOverflow);
  }, [doc, onOverflowChange, scale]);

  return (
    <div
      ref={viewportRef}
      className="sheet-viewport"
      style={{ height: `${SHEET_HEIGHT_PX * scale}px` }}
    >
      <div className="sheet-scaler" style={{ ['--sheet-scale' as string]: scale }}>
        <div className="sheet" ref={sheetRef} id="cm-label-sheet">
          <header className="sheet__header">
            <div className="sheet__brand">
              <CmLogo className="sheet__logo" height="8mm" variant="print" />
              <div className="sheet__productline">{company.productLine}</div>
            </div>
            <div className="sheet__docmeta">
              <div className="sheet__doctitle">{doc.strings.documentTitle}</div>
              <div className="sheet__cmid-label">{doc.strings.cmIdLabel}</div>
              <div className="sheet__cmid">{doc.cmId}</div>
            </div>
          </header>

          <div className="sheet__rule">
            <span className="sheet__rule-main" />
            <span className="sheet__rule-accent" />
          </div>

          {doc.delivery.length > 0 ? (
            <section className="sheet__delivery">
              {doc.delivery.map((row) => (
                <div className="sheet__delivery-item" key={row.key}>
                  <div className="sheet__delivery-label">{row.label}</div>
                  <div className="sheet__delivery-value">{row.value}</div>
                </div>
              ))}
            </section>
          ) : null}

          {doc.headline || doc.subheadline || doc.descriptors.length > 0 ? (
            <section className="sheet__hero">
              {doc.headline ? <div className="sheet__headline">{doc.headline}</div> : null}
              {doc.subheadline ? <div className="sheet__subheadline">{doc.subheadline}</div> : null}
              {doc.descriptors.length > 0 ? (
                <div className="sheet__descriptors">
                  {doc.descriptors.map((chip) => (
                    <span className="sheet__chip" key={chip.key}>
                      <span className="sheet__chip-label">{chip.label}</span>
                      <span className="sheet__chip-value">{chip.value}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {doc.metrics.length > 0 ? (
            <section className="sheet__metrics">
              {doc.metrics.map((metric) => (
                <div className="sheet__metric" key={metric.label}>
                  <div className="sheet__metric-label">{metric.label}</div>
                  <div className="sheet__metric-value">{metric.value}</div>
                </div>
              ))}
            </section>
          ) : null}

          <div className="sheet__sections" ref={sectionsRef}>
            {doc.sections.map((section) => (
              <SectionBlock key={section.id} section={section} />
            ))}
          </div>

          <footer className="sheet__footer">
            <div>
              <div className="sheet__footer-strong">{doc.cmId}</div>
              <div>{doc.footer.companyLine}</div>
            </div>
            {/* Reserved for a future Color Metal QR code — see README §15. */}
            <div className="sheet__code-slot" aria-hidden="true" />
            <div className="sheet__footer-right">{doc.footer.generatedAtLabel}</div>
          </footer>
        </div>
      </div>
    </div>
  );
}

function SectionBlock({ section }: { section: LabelSection }) {
  return (
    <section className="sheet__section">
      <div className="sheet__section-title">{section.title}</div>
      <table className="sheet__rows">
        <tbody>
          {section.rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
