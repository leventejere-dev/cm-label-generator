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
import { LabelSheet } from '../features/label/LabelSheet';
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
        <AppBar title="Eticheta Color Metal" back="/" />
        <main className="app-main">
          <Card padded>
            <span className="spinner" /> Se pregătește eticheta…
          </Card>
        </main>
      </div>
    );
  }

  if (!record || !doc) {
    return (
      <div className="app-shell">
        <AppBar title="Eticheta Color Metal" back="/" />
        <main className="app-main stack">
          <Banner tone="danger" title={loaded.error?.title ?? 'Eticheta nu este disponibilă'}>
            {loaded.error?.detail ?? 'Această etichetă nu a putut fi deschisă.'}
          </Banner>
          <Button variant="primary" onClick={() => navigate('/')}>
            Înapoi la început
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppBar title="Eticheta Color Metal" back={`/review/${record.id}`} />
      <main className="app-main stack print-reset">
        <div className="no-print" style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--cm-space-4)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 className="page-title">Eticheta Color Metal</h1>
            <p className="page-subtitle">A5 · 148 × 210 mm · {record.cmId}</p>
          </div>
          <div role="group" aria-label="Limba etichetei" style={{ display: 'flex', gap: 4 }}>
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
          <Banner tone="warn" title="Eticheta este aproape goală">
            Nu a fost confirmată nicio informație despre produs. Întoarce-te și completează cel
            puțin tipul produsului și dimensiunile înainte de tipărire.
          </Banner>
        ) : null}

        {overflowing ? (
          <Banner tone="warn" title="O parte din informații nu încap pe o pagină">
            Elimină câmpurile suplimentare mai puțin importante din ecranul de verificare, ca să se
            tipărească tot.
          </Banner>
        ) : null}

        {pdfError ? (
          <Banner tone="danger" title={pdfError.title}>
            {pdfError.detail}
          </Banner>
        ) : null}

        {doc.internalNotes.length > 0 ? (
          <div className="no-print">
            <Banner tone="info" title="Pentru informarea ta — nu se tipărește pe etichetă">
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {doc.internalNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </Banner>
          </div>
        ) : null}

        <div className="print-reset">
          <LabelSheet doc={doc} onOverflowChange={setOverflowing} />
        </div>

        <Card padded className="no-print">
          <p style={{ fontSize: 'var(--cm-text-sm)' }}>
            <strong>Tipărire:</strong> folosește <em>Tipărește eticheta</em> și alege{' '}
            <strong>A5</strong>, scară 100 % (nu „potrivire în pagină”). Dacă imprimanta ta are doar
            A4, tipărește două etichete pe o coală sau alege A5 și lasă imprimanta să o centreze. Ca
            să păstrezi un PDF, fie alegi „Salvează ca PDF” în fereastra de tipărire — care
            păstrează exact fiecare caracter — fie folosești <em>Exportă PDF</em> pentru un fișier
            vectorial descărcabil.
          </p>
        </Card>

        <div className="btn-row no-print">
          <Button
            variant="secondary"
            icon={<IconEdit size={18} />}
            onClick={() => navigate(`/review/${record.id}`)}
          >
            Modifică datele
          </Button>
          <Button
            variant="secondary"
            icon={<IconCamera size={18} />}
            onClick={() => {
              reset();
              navigate('/scan');
            }}
          >
            Scanare nouă
          </Button>
        </div>

        <div className="action-bar no-print">
          <Button variant="primary" icon={<IconPrint size={18} />} onClick={handlePrint}>
            Tipărește eticheta
          </Button>
          <Button
            variant="secondary"
            icon={<IconDownload size={18} />}
            loading={pdfBusy}
            onClick={() => void handlePdf()}
          >
            Exportă PDF
          </Button>
        </div>

        <p className="app-footer no-print">Generator Etichete CM {env.appVersion}</p>
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
