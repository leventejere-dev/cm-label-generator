/**
 * COLOR METAL LABEL — preview, print and PDF export.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppBar } from '../components/ui/AppBar';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { IconCamera, IconDownload, IconEdit, IconPrint } from '../components/ui/Icons';
import { company } from '../branding/brand';
import { env } from '../config/env';
import { CURRENT_LABEL_TEMPLATE, type LabelRecord } from '../domain/labelRecord';
import type { LabelLanguage } from '../domain/fields';
import { buildLabelDocument, labelHasContent } from '../domain/labelDocument';
import { A4Label } from '../features/label/A4Label';
import { getRepository } from '../lib/data/repository';
import { useLabelRecord } from '../lib/data/useLabelRecord';
import { toAppError, type AppError } from '../lib/errors';
import { useScanSession } from '../state/scanSession';

export function LabelPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const sessionRecord = useScanSession((state) => state.record);
  const sessionReviewed = useScanSession((state) => state.reviewed);
  const sessionRemoved = useScanSession((state) => state.removed);
  const reset = useScanSession((state) => state.reset);

  const fromSession = Boolean(sessionRecord && sessionRecord.id === id && sessionReviewed);
  const loaded = useLabelRecord(id, fromSession);

  const [language, setLanguage] = useState<LabelLanguage>(() => readLabelLanguage());
  // A record loaded from history is kept in local state. Writing it into the
  // shared scan session would make `fromSession` true while `reviewed` still
  // held the PREVIOUS label's data — which would render label A's values under
  // label B's identifier.
  const [loadedRecord, setLoadedRecord] = useState<LabelRecord | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<AppError | null>(null);

  const record = fromSession ? sessionRecord : (loadedRecord ?? loaded.record);
  const data = fromSession
    ? sessionReviewed
    : (record?.reviewedData ?? record?.structuredExtractedData ?? null);
  const removed = fromSession ? sessionRemoved : (record?.removedSensitiveData ?? []);

  const doc = useMemo(() => {
    if (!record || !data) return null;
    return buildLabelDocument(data, {
      cmId: record.cmId,
      generatedAt: new Date(record.updatedAt ?? record.createdAt),
      companyLine: company.legalLine,
      generator: company.generator,
      version: record.generatedLabelVersion || CURRENT_LABEL_TEMPLATE,
      language,
      removed,
    });
  }, [record, data, removed, language]);

  // Mark the label as generated the first time it is previewed.
  useEffect(() => {
    if (!record || record.status === 'generated') return;
    let cancelled = false;
    (async () => {
      try {
        const repository = await getRepository();
        const updated = await repository.update(record.id, {
          status: 'generated',
          generatedLabelVersion: CURRENT_LABEL_TEMPLATE,
        });
        if (cancelled) return;
        if (fromSession) useScanSession.getState().setRecord(updated);
        else setLoadedRecord(updated);
      } catch {
        /* status is cosmetic — never block printing */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [record, fromSession]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handlePdf = useCallback(async () => {
    if (!doc) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      // pdf-lib is ~180 kB gzipped: load it only when the operator asks for a
      // PDF, so the scan flow stays fast on a phone.
      const { downloadBlob, renderLabelPdf } = await import('../features/label/pdfExport');
      const blob = await renderLabelPdf(doc);
      downloadBlob(blob, `${doc.cmId}.pdf`);
    } catch (cause) {
      setPdfError(toAppError(cause));
    } finally {
      setPdfBusy(false);
    }
  }, [doc]);

  if (loaded.loading && !fromSession) {
    return (
      <div className="app-shell">
        <AppBar title="Color Metal label" back="/" />
        <main className="app-main">
          <Card padded>
            <span className="spinner" /> Preparing label…
          </Card>
        </main>
      </div>
    );
  }

  if (!record || !doc) {
    return (
      <div className="app-shell">
        <AppBar title="Color Metal label" back="/" />
        <main className="app-main stack">
          <Banner tone="danger" title={loaded.error?.title ?? 'Label not available'}>
            {loaded.error?.detail ?? 'This label could not be opened.'}
          </Banner>
          <Button variant="primary" onClick={() => navigate('/')}>
            Back to start
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppBar title="Color Metal label" back={`/review/${record.id}`} />
      <main className="app-main stack print-reset">
        <div className="no-print" style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--cm-space-4)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 className="page-title">Color Metal label</h1>
            <p className="page-subtitle">A4 · 210 × 297 mm · {record.cmId}</p>
          </div>
          <div role="group" aria-label="Label language" style={{ display: 'flex', gap: 4 }}>
            {(['ro', 'en'] as const).map((code) => (
              <button
                key={code}
                type="button"
                className={`btn ${language === code ? 'btn--primary' : 'btn--secondary'}`}
                style={{ minHeight: 38, padding: '0 14px' }}
                aria-pressed={language === code}
                onClick={() => {
                  setLanguage(code);
                  writeLabelLanguage(code);
                }}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {!labelHasContent(doc) ? (
          <Banner tone="warn" title="This label is almost empty">
            No product information was confirmed. Go back and fill in at least the product type and
            dimensions before printing.
          </Banner>
        ) : null}

        {overflowing ? (
          <Banner tone="warn" title="Some information does not fit on one page">
            Remove less important additional fields on the review screen so everything prints.
          </Banner>
        ) : null}

        {pdfError ? (
          <Banner tone="danger" title={pdfError.title}>
            {pdfError.detail}
          </Banner>
        ) : null}

        <div className="print-reset">
          <A4Label doc={doc} onOverflowChange={setOverflowing} />
        </div>

        <Card padded className="no-print">
          <p style={{ fontSize: 'var(--cm-text-sm)' }}>
            <strong>Printing:</strong> use <em>Print label</em> and choose A4, scale 100 % (not “fit
            to page”). To keep a PDF, either pick “Save as PDF” in the print dialog — which keeps
            every character exactly — or use <em>Export PDF</em> for a downloadable vector file.
          </p>
        </Card>

        <div className="btn-row no-print">
          <Button
            variant="secondary"
            icon={<IconEdit size={18} />}
            onClick={() => navigate(`/review/${record.id}`)}
          >
            Edit data
          </Button>
          <Button
            variant="secondary"
            icon={<IconCamera size={18} />}
            onClick={() => {
              reset();
              navigate('/scan');
            }}
          >
            New scan
          </Button>
        </div>

        <div className="action-bar no-print">
          <Button variant="primary" icon={<IconPrint size={18} />} onClick={handlePrint}>
            Print label
          </Button>
          <Button
            variant="secondary"
            icon={<IconDownload size={18} />}
            loading={pdfBusy}
            onClick={() => void handlePdf()}
          >
            Export PDF
          </Button>
        </div>

        <p className="app-footer no-print">CM Label Generator {env.appVersion}</p>
      </main>
    </div>
  );
}


const LANGUAGE_KEY = 'cm-label-generator/label-language';

function readLabelLanguage(): LabelLanguage {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (stored === 'ro' || stored === 'en') return stored;
  } catch {
    /* private mode */
  }
  return 'ro';
}

function writeLabelLanguage(language: LabelLanguage): void {
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    /* private mode */
  }
}
