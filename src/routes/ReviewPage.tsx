/**
 * REVIEW — the mandatory human step.
 * AI output never reaches the printer without passing through this screen.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppBar } from '../components/ui/AppBar';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Disclosure } from '../components/ui/Disclosure';
import { IconCheck, IconImage } from '../components/ui/Icons';
import { emptyExtractionResult, type ExtractionResult } from '../domain/extraction';
import { deriveSummary } from '../domain/labelRecord';
import type { RemovedItem } from '../domain/sanitize';
import { ReviewForm } from '../features/review/ReviewForm';
import { RemovedPanel } from '../features/review/RemovedPanel';
import { stripEmptyFields } from '../features/review/operations';
import { getRepository } from '../lib/data/repository';
import { useLabelRecord } from '../lib/data/useLabelRecord';
import { toAppError, type AppError } from '../lib/errors';
import { useScanSession } from '../state/scanSession';

export function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const sessionRecord = useScanSession((state) => state.record);
  const sessionReviewed = useScanSession((state) => state.reviewed);
  const sessionRemoved = useScanSession((state) => state.removed);
  const sessionWarnings = useScanSession((state) => state.warnings);
  const sessionImageUrl = useScanSession((state) => state.sourceImageUrl);
  const setReviewed = useScanSession((state) => state.setReviewed);
  const setScanResult = useScanSession((state) => state.setScanResult);

  const fromSession = Boolean(sessionRecord && sessionRecord.id === id && sessionReviewed);
  const loaded = useLabelRecord(id, fromSession);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<AppError | null>(null);

  // Hydrate the session from the database when a past label is reopened.
  useEffect(() => {
    if (fromSession || !loaded.record) return;
    setScanResult({
      record: loaded.record,
      reviewed:
        loaded.record.reviewedData ??
        loaded.record.structuredExtractedData ??
        emptyExtractionResult(),
      removed: loaded.record.removedSensitiveData,
      warnings: loaded.record.warnings,
      sourceImageUrl: loaded.sourceImageUrl,
      sourceImageUrlOwned: false,
    });
  }, [fromSession, loaded.record, loaded.sourceImageUrl, setScanResult]);

  // Until the session has been hydrated for THIS id, read straight from the
  // loaded record. Falling back to `sessionReviewed` here would briefly show —
  // and could save — the previously opened label's data.
  const record = fromSession ? sessionRecord : loaded.record;
  const data: ExtractionResult | null = fromSession
    ? sessionReviewed
    : (loaded.record?.reviewedData ?? loaded.record?.structuredExtractedData ?? null);
  const removed: RemovedItem[] = fromSession
    ? sessionRemoved
    : (loaded.record?.removedSensitiveData ?? []);
  const warnings = fromSession ? sessionWarnings : (loaded.record?.warnings ?? []);
  const imageUrl = sessionImageUrl ?? loaded.sourceImageUrl;

  const blockingWarnings = useMemo(
    () => warnings.filter((warning) => warning.severity !== 'info'),
    [warnings],
  );

  if (loaded.loading && !fromSession) {
    return (
      <div className="app-shell">
        <AppBar title="Verificare" back="/" />
        <main className="app-main">
          <Card padded>
            <span className="spinner" /> Se încarcă eticheta…
          </Card>
        </main>
      </div>
    );
  }

  if ((loaded.error && !fromSession) || !record || !data) {
    const error = loaded.error;
    return (
      <div className="app-shell">
        <AppBar title="Verificare" back="/" />
        <main className="app-main stack">
          <Banner tone="danger" title={error?.title ?? 'Eticheta nu este disponibilă'}>
            {error?.detail ?? 'Această etichetă nu a putut fi deschisă.'}
          </Banner>
          <Button variant="primary" onClick={() => navigate('/')}>
            Înapoi la început
          </Button>
        </main>
      </div>
    );
  }

  const handleGenerate = async () => {
    setSaving(true);
    setSaveError(null);
    const cleaned = stripEmptyFields(data);
    try {
      const repository = await getRepository();
      const summary = deriveSummary({
        reviewedData: cleaned,
        structuredExtractedData: record.structuredExtractedData,
      });
      const updated = await repository.update(record.id, {
        status: 'reviewed',
        reviewedData: cleaned,
        removedSensitiveData: removed,
        ...summary,
      });
      setScanResult({
        record: updated,
        reviewed: cleaned,
        removed,
        warnings,
      });
      navigate(`/label/${record.id}`);
    } catch (cause) {
      // Saving failed, but the reviewed data is valid — let the operator print.
      setSaveError(toAppError(cause));
      setReviewed(cleaned);
      navigate(`/label/${record.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-shell">
      <AppBar title="Verificare informații extrase" back="/" />
      <main className="app-main stack">
        <div>
          <h1 className="page-title">Verifică informațiile extrase</h1>
          <p className="page-subtitle">
            Compară valorile cu fotografia. Poți modifica orice câmp. Nimic nu se tipărește până
            când nu generezi eticheta.
          </p>
        </div>

        {saveError ? (
          <Banner tone="warn" title={saveError.title}>
            {saveError.detail}
          </Banner>
        ) : null}

        {blockingWarnings.length > 0 ? (
          <Banner tone="warn" title="Verifică câmpurile evidențiate înainte de a genera eticheta.">
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {blockingWarnings.slice(0, 5).map((warning, index) => (
                <li key={`${warning.code}-${index}`}>{warning.message}</li>
              ))}
            </ul>
          </Banner>
        ) : null}

        <div className="review-grid">
          <div className="review-source stack-sm">
            <div className="section-heading">
              <h2>Fotografia sursă</h2>
            </div>
            {imageUrl ? (
              <a href={imageUrl} target="_blank" rel="noreferrer">
                <img className="review-source__img" src={imageUrl} alt="Eticheta furnizorului fotografiată" />
              </a>
            ) : (
              <Card padded>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }} className="muted">
                  <IconImage size={18} />
                  Fotografia sursă nu este disponibilă pentru această etichetă.
                </div>
              </Card>
            )}

            <Disclosure summary="Detalii despre extragere">
              <div className="kv">
                <span className="kv__k">ID Color Metal</span>
                <span className="kv__v mono">{record.cmId}</span>
              </div>
              <div className="kv">
                <span className="kv__k">Serviciu AI</span>
                <span className="kv__v">{record.aiProvider ?? '—'}</span>
              </div>
              <div className="kv">
                <span className="kv__k">Model</span>
                <span className="kv__v">{record.aiModel ?? '—'}</span>
              </div>
              <div className="kv">
                <span className="kv__k">Timp de procesare</span>
                <span className="kv__v">
                  {record.processingDurationMs ? `${(record.processingDurationMs / 1000).toFixed(1)} s` : '—'}
                </span>
              </div>
              <div className="kv">
                <span className="kv__k">Încredere generală</span>
                <span className="kv__v">
                  {record.overallConfidence !== null
                    ? `${Math.round(record.overallConfidence * 100)}%`
                    : '—'}
                </span>
              </div>
              <div className="kv">
                <span className="kv__k">Limba detectată</span>
                <span className="kv__v">{data.detectedLanguage ?? '—'}</span>
              </div>
            </Disclosure>
          </div>

          <div className="stack">
            <RemovedPanel removed={removed} />
            <ReviewForm data={data} removed={removed} onChange={setReviewed} />
          </div>
        </div>

        <div className="action-bar">
          <Button variant="ghost" onClick={() => navigate('/')}>
            Anulează
          </Button>
          <Button
            variant="primary"
            icon={<IconCheck size={18} />}
            loading={saving}
            onClick={() => void handleGenerate()}
          >
            Generează eticheta CM
          </Button>
        </div>
      </main>
    </div>
  );
}
