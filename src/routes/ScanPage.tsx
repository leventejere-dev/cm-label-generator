/**
 * SCAN: camera → photo check → analysis.
 * All three steps live on one route so the captured photo never leaves memory
 * between navigations.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppBar } from '../components/ui/AppBar';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { env } from '../config/env';
import { CameraScanner } from '../features/camera/CameraScanner';
import { PhotoPreview } from '../features/camera/PhotoPreview';
import { ProcessingView } from '../features/extraction/ProcessingView';
import { runScan, type StageSnapshot } from '../features/extraction/pipeline';
import { decodeImage, preprocessImage, validateImageFile } from '../lib/image/preprocess';
import { assessImageQuality } from '../lib/image/quality';
import { toAppError, type AppError } from '../lib/errors';
import { useScanSession } from '../state/scanSession';

type Step = 'camera' | 'preview' | 'processing' | 'error';

export function ScanPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('camera');
  const [error, setError] = useState<AppError | null>(null);
  const [stages, setStages] = useState<StageSnapshot[]>([]);
  const [optimising, setOptimising] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const processed = useScanSession((state) => state.processed);
  const quality = useScanSession((state) => state.quality);
  const setCapture = useScanSession((state) => state.setCapture);
  const clearCapture = useScanSession((state) => state.clearCapture);
  const setScanResult = useScanSession((state) => state.setScanResult);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleCapture = useCallback(
    async (blob: Blob) => {
      setOptimising(true);
      setError(null);
      try {
        validateImageFile(blob, env.image.acceptedMimeTypes, env.image.hardMaxBytes);
        const optimised = await preprocessImage(blob, {
          maxEdge: env.image.maxEdge,
          targetBytes: env.image.targetBytes,
          hardMaxBytes: env.image.hardMaxBytes,
        });
        const report = await assessImageQuality(await decodeImage(optimised.blob));
        setCapture(optimised, report);
        setStep('preview');
      } catch (cause) {
        setError(toAppError(cause));
        setStep('error');
      } finally {
        setOptimising(false);
      }
    },
    [setCapture],
  );

  const handleAnalyze = useCallback(async () => {
    if (!processed) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStep('processing');
    setError(null);

    try {
      const outcome = await runScan({
        image: processed.blob,
        processed,
        onStages: setStages,
        signal: controller.signal,
      });
      setScanResult({
        record: outcome.record,
        reviewed: outcome.sanitized.safe,
        removed: outcome.sanitized.removed,
        warnings: outcome.record.warnings,
        sourceImageUrl: processed.previewUrl,
        sourceImageUrlOwned: false,
      });
      navigate(`/review/${outcome.record.id}`, { replace: true });
    } catch (cause) {
      setError(toAppError(cause));
      setStep('error');
    } finally {
      abortRef.current = null;
    }
  }, [processed, navigate, setScanResult]);

  const retake = useCallback(() => {
    clearCapture();
    setError(null);
    setStep('camera');
  }, [clearCapture]);

  if (step === 'camera') {
    return (
      <>
        <CameraScanner onCapture={(blob) => void handleCapture(blob)} onCancel={() => navigate('/')} />
        {optimising ? (
          <div
            className="camera__fallback"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 45,
              background: 'rgba(0,0,0,0.7)',
              display: 'grid',
              placeContent: 'center',
            }}
          >
            <span className="spinner" style={{ margin: '0 auto 12px', width: 24, height: 24 }} />
            Se optimizează fotografia…
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="app-shell">
      <AppBar title="Scanare etichetă" back="/" />
      <main className="app-main">
        {step === 'preview' && processed ? (
          <PhotoPreview
            processed={processed}
            quality={quality}
            onRetake={retake}
            onAnalyze={() => void handleAnalyze()}
          />
        ) : null}

        {step === 'processing' ? <ProcessingView stages={stages} /> : null}

        {step === 'error' && error ? (
          <div className="stack">
            <Banner tone="danger" title={error.title}>
              {error.detail}
            </Banner>
            <div className="btn-row">
              {error.retryable && processed ? (
                <Button variant="primary" onClick={() => void handleAnalyze()}>
                  Reîncearcă analiza
                </Button>
              ) : null}
              <Button variant={error.retakeAdvised ? 'primary' : 'secondary'} onClick={retake}>
                Refă fotografia
              </Button>
              <Button variant="ghost" onClick={() => navigate('/')}>
                Înapoi la început
              </Button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
