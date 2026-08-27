/**
 * THE COLOR METAL A4 LABEL
 * ---------------------------------------------------------------------------
 * Rendered at true physical size (210 × 297 mm) and scaled down for the
 * on-screen preview with a CSS transform. Printing removes the transform, so
 * what you see is exactly what the printer produces.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CmLogo } from '../../branding/CmLogo';
import { company } from '../../branding/brand';
import type { LabelDocument, LabelSection } from '../../domain/labelDocument';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MM_PER_INCH = 25.4;
const CSS_DPI = 96;

const A4_WIDTH_PX = (A4_WIDTH_MM / MM_PER_INCH) * CSS_DPI;
const A4_HEIGHT_PX = (A4_HEIGHT_MM / MM_PER_INCH) * CSS_DPI;

export interface A4LabelProps {
  doc: LabelDocument;
  /** Called with true when the content does not fit on one sheet. */
  onOverflowChange?: (overflowing: boolean) => void;
}

export function A4Label({ doc, onOverflowChange }: A4LabelProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const available = viewport.clientWidth;
    if (available <= 0) return;
    setScale(Math.min(1, available / A4_WIDTH_PX));
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
      className="a4-viewport"
      style={{ height: `${A4_HEIGHT_PX * scale}px` }}
    >
      <div className="a4-scaler" style={{ ['--a4-scale' as string]: scale }}>
        <div className="a4-sheet" ref={sheetRef} id="cm-a4-sheet">
          <header className="a4__header">
            <div className="a4__brand">
              <CmLogo className="a4__logo" height="11mm" variant="print" />
              <div className="a4__productline">{company.productLine}</div>
            </div>
            <div className="a4__docmeta">
              <div className="a4__doctitle">{doc.strings.documentTitle}</div>
              <div className="a4__cmid-label">{doc.strings.cmIdLabel}</div>
              <div className="a4__cmid">{doc.cmId}</div>
            </div>
          </header>

          <div className="a4__rule">
            <span className="a4__rule-main" />
            <span className="a4__rule-accent" />
          </div>

          {doc.delivery.length > 0 ? (
            <section className="a4__delivery">
              {doc.delivery.map((row) => (
                <div className="a4__delivery-item" key={row.key}>
                  <div className="a4__delivery-label">{row.label}</div>
                  <div className="a4__delivery-value">{row.value}</div>
                </div>
              ))}
            </section>
          ) : null}

          {doc.headline || doc.subheadline || doc.descriptors.length > 0 ? (
            <section className="a4__hero">
              {doc.headline ? <div className="a4__headline">{doc.headline}</div> : null}
              {doc.subheadline ? <div className="a4__subheadline">{doc.subheadline}</div> : null}
              {doc.descriptors.length > 0 ? (
                <div className="a4__descriptors">
                  {doc.descriptors.map((chip) => (
                    <span className="a4__chip" key={chip.key}>
                      <span className="a4__chip-label">{chip.label}</span>
                      <span className="a4__chip-value">{chip.value}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {doc.metrics.length > 0 ? (
            <section className="a4__metrics">
              {doc.metrics.map((metric) => (
                <div className="a4__metric" key={metric.label}>
                  <div className="a4__metric-label">{metric.label}</div>
                  <div className="a4__metric-value">{metric.value}</div>
                </div>
              ))}
            </section>
          ) : null}

          <div className="a4__sections" ref={sectionsRef}>
            {doc.sections.map((section) => (
              <SectionBlock key={section.id} section={section} />
            ))}
          </div>

          {doc.notes.length > 0 ? (
            <div className="a4__notes">
              <ul style={{ margin: 0, padding: 0, listStyle: 'disc' }}>
                {doc.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <footer className="a4__footer">
            <div>
              <div className="a4__footer-strong">{doc.cmId}</div>
              <div>{doc.footer.companyLine}</div>
            </div>
            {/* Reserved for a future Color Metal QR code — see README §15. */}
            <div className="a4__code-slot" aria-hidden="true" />
            <div className="a4__footer-right">
              <div>
                {doc.strings.generatedBy} {doc.footer.generator} · {doc.footer.generatedAtLabel}
              </div>
              <div>
                {doc.strings.template} {doc.footer.version}
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

function SectionBlock({ section }: { section: LabelSection }) {
  return (
    <section className="a4__section">
      <div className="a4__section-title">{section.title}</div>
      <table className="a4__rows">
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

