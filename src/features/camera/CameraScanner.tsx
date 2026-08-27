/**
 * FULL-SCREEN CAMERA SCANNER
 * ---------------------------------------------------------------------------
 * The primary way an employee gets a label into the system. Not a file picker:
 * the camera opens directly, rear-facing, with an A4 framing guide.
 *
 * Fallback ladder, in order:
 *   1. live getUserMedia preview + in-page shutter   (iPhone Safari, Android Chrome)
 *   2. <input capture="environment"> — still the phone camera, but the OS
 *      camera app, used when getUserMedia is blocked or unavailable
 *   3. plain file picker, for a desktop demo
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { IconCamera, IconClose, IconFlash, IconImage } from '../../components/ui/Icons';
import { toAppError, type AppError } from '../../lib/errors';
import { useCamera } from './useCamera';

export interface CameraScannerProps {
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
}

export function CameraScanner({ onCapture, onCancel }: CameraScannerProps) {
  const camera = useCamera();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<AppError | null>(null);

  useEffect(() => {
    void camera.start();
    return () => camera.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleShutter = async () => {
    setCapturing(true);
    setCaptureError(null);
    try {
      const blob = await camera.capture();
      camera.stop();
      onCapture(blob);
    } catch (cause) {
      setCaptureError(toAppError(cause));
    } finally {
      setCapturing(false);
    }
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    camera.stop();
    onCapture(file);
  };

  const blockingError = camera.status === 'error' || camera.status === 'unsupported';
  const error = captureError ?? camera.error;

  return (
    <div className="camera no-print">
      <div className="camera__stage">
        <video
          ref={camera.videoRef}
          className="camera__video"
          playsInline
          muted
          autoPlay
          disablePictureInPicture
        />

        {!blockingError ? (
          <div className="camera__overlay">
            <div className="camera__frame">
              <span className="camera__corner camera__corner--tl" />
              <span className="camera__corner camera__corner--tr" />
              <span className="camera__corner camera__corner--bl" />
              <span className="camera__corner camera__corner--br" />
            </div>
            <p className="camera__hint">
              Încadrează toată eticheta furnizorului.
              <br />
              Umple cadrul, stai nemișcat și lasă camera foto să focalizeze.
            </p>
          </div>
        ) : null}

        <div className="camera__topbar">
          <button type="button" className="camera__chip" onClick={onCancel} aria-label="Anulează scanarea">
            <IconClose size={18} />
            Anulează
          </button>
          {camera.torchAvailable ? (
            <button
              type="button"
              className="camera__chip"
              aria-pressed={camera.torchOn}
              onClick={() => void camera.toggleTorch()}
            >
              <IconFlash size={18} />
              {camera.torchOn ? 'Bliț pornit' : 'Bliț'}
            </button>
          ) : null}
        </div>

        {blockingError && error ? (
          <div className="camera__fallback">
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>{error.title}</h2>
            <p style={{ opacity: 0.85, fontSize: '0.9rem', lineHeight: 1.55 }}>{error.detail}</p>
            <div className="stack" style={{ marginTop: 24, maxWidth: 360, marginInline: 'auto' }}>
              {error.retryable ? (
                <Button variant="secondary" block onClick={() => void camera.start()}>
                  Încearcă din nou camera foto
                </Button>
              ) : null}
              <Button
                variant="primary"
                block
                icon={<IconCamera size={18} />}
                onClick={() => fileInputRef.current?.click()}
              >
                Folosește aplicația foto a telefonului
              </Button>
              <Button variant="ghost" block onClick={onCancel}>
                Înapoi
              </Button>
            </div>
          </div>
        ) : null}

        {camera.status === 'starting' ? (
          <div className="camera__fallback" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center' }}>
            <span className="spinner" style={{ margin: '0 auto 12px', width: 24, height: 24 }} />
            Se pornește camera foto…
          </div>
        ) : null}
      </div>

      {!blockingError ? (
        <div className="camera__bar">
          <div className="camera__side">
            <button
              type="button"
              className="camera__chip"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Alege o fotografie existentă"
            >
              <IconImage size={18} />
            </button>
          </div>

          <button
            type="button"
            className="camera__shutter"
            onClick={() => void handleShutter()}
            disabled={camera.status !== 'ready' || capturing}
            aria-label="Fă fotografia"
          />

          <div className="camera__side" aria-hidden="true" />
        </div>
      ) : null}

      {/*
        capture="environment" makes phones open the rear camera directly rather
        than the gallery. Desktops fall back to a normal file dialog.
      */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="visually-hidden"
        onChange={handleFile}
      />
    </div>
  );
}
