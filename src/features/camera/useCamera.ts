/**
 * CAMERA CONTROL HOOK
 * ---------------------------------------------------------------------------
 * Wraps getUserMedia for the scanner screen. Targets iPhone Safari and Android
 * Chrome specifically:
 *
 *   • rear camera requested with facingMode "environment" as an *ideal*
 *     constraint, so desktops with only a front camera still work
 *   • a high ideal resolution (2560×1440) because label text is small; the
 *     browser silently gives us the closest supported mode
 *   • the <video> element must be muted + playsInline or iOS refuses to play
 *     inline and hijacks the screen with the native player
 *   • torch is exposed only when the active track actually reports the
 *     capability (Android Chrome does; iOS Safari does not)
 *   • capture reads the video's intrinsic size, not the CSS size, so we keep
 *     full sensor resolution
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppError, appError, toAppError } from '../../lib/errors';

export type CameraStatus = 'idle' | 'starting' | 'ready' | 'error' | 'unsupported';

/**
 * `torch` is not in the standard MediaTrackCapabilities typings — it is a
 * Chrome/Android extension. Modelled as a structural type rather than an
 * interface extension so it does not conflict with lib.dom.
 */
type TorchCapableTrack = {
  getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean };
};

export interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  status: CameraStatus;
  error: AppError | null;
  torchAvailable: boolean;
  torchOn: boolean;
  start: () => Promise<void>;
  stop: () => void;
  toggleTorch: () => Promise<void>;
  capture: () => Promise<Blob>;
  /** Intrinsic size of the live stream, once known. */
  dimensions: { width: number; height: number } | null;
}

export function cameraSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

export function secureContextOk(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelledRef = useRef(false);

  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<AppError | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  const stop = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setTorchOn(false);
    setTorchAvailable(false);
    setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    setError(null);

    if (!secureContextOk()) {
      setStatus('unsupported');
      setError(appError('CAMERA_INSECURE_CONTEXT'));
      return;
    }
    if (!cameraSupported()) {
      setStatus('unsupported');
      setError(appError('CAMERA_UNAVAILABLE'));
      return;
    }

    setStatus('starting');
    cancelledRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // "ideal", not "exact": a laptop with only a front camera still works.
          facingMode: { ideal: 'environment' },
          width: { ideal: 2560 },
          height: { ideal: 1440 },
        },
      });

      if (cancelledRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        for (const track of stream.getTracks()) track.stop();
        streamRef.current = null;
        setStatus('idle');
        return;
      }

      video.srcObject = stream;
      video.muted = true;
      video.setAttribute('playsinline', 'true');
      try {
        await video.play();
      } catch {
        // Autoplay rejection is not fatal: the frame is still available once
        // metadata loads, and the user gesture that opened the scanner usually
        // satisfies the policy on the next tick.
      }

      const [track] = stream.getVideoTracks();
      if (track) {
        const capabilities = (track as unknown as TorchCapableTrack).getCapabilities?.();
        setTorchAvailable(Boolean(capabilities && 'torch' in capabilities && capabilities.torch));
        const settings = track.getSettings();
        if (settings.width && settings.height) {
          setDimensions({ width: settings.width, height: settings.height });
        }
      }
      setStatus('ready');
    } catch (cause) {
      if (cancelledRef.current) return;
      const appErr = toAppError(cause);
      setError(appErr);
      setStatus('error');
    }
  }, []);

  const toggleTorch = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;
    const [track] = stream.getVideoTracks();
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }, [torchOn]);

  const capture = useCallback(async (): Promise<Blob> => {
    const video = videoRef.current;
    if (!video || !streamRef.current) throw appError('CAPTURE_FAILED');

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) throw appError('CAPTURE_FAILED');

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw appError('CAPTURE_FAILED');
    ctx.drawImage(video, 0, 0, width, height);

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(appError('CAPTURE_FAILED'))),
        'image/jpeg',
        0.95, // near-lossless here; preprocessImage does the real compression
      );
    });
  }, []);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      const stream = streamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
        streamRef.current = null;
      }
    };
  }, []);

  return {
    videoRef,
    status,
    error,
    torchAvailable,
    torchOn,
    start,
    stop,
    toggleTorch,
    capture,
    dimensions,
  };
}
