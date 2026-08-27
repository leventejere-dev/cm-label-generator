/**
 * Captured-photo confirmation step.
 * A bad photograph is never sent for analysis without the employee seeing it
 * first — quality advice is shown here, but never blocks.
 */

import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { IconCamera, IconCheck } from '../../components/ui/Icons';
import type { ProcessedImage } from '../../lib/image/preprocess';
import type { QualityReport } from '../../lib/image/quality';

export interface PhotoPreviewProps {
  processed: ProcessedImage;
  quality: QualityReport | null;
  onRetake: () => void;
  onAnalyze: () => void;
  busy?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PhotoPreview({ processed, quality, onRetake, onAnalyze, busy }: PhotoPreviewProps) {
  const hasAdvice = Boolean(quality && quality.advice.length > 0);

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Verifică fotografia</h1>
        <p className="page-subtitle">
          Toate cele patru margini ale etichetei trebuie să se vadă, iar textul mic să fie lizibil.
        </p>
      </div>

      {hasAdvice ? (
        <Banner tone="warn" title="Fotografia poate fi greu de citit">
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {quality?.advice.map((line) => (
              <li key={line.code}>{line.message}</li>
            ))}
          </ul>
        </Banner>
      ) : null}

      <figure className="photo-preview">
        <img src={processed.previewUrl} alt="Eticheta pe care tocmai ai fotografiat-o" />
      </figure>

      <p className="muted cm-tabular" style={{ fontSize: 'var(--cm-text-xs)' }}>
        {processed.width} × {processed.height} px · {formatBytes(processed.bytes)} · optimizată de la{' '}
        {processed.sourceWidth} × {processed.sourceHeight} px
      </p>

      <div className="action-bar">
        <Button variant="secondary" icon={<IconCamera size={18} />} onClick={onRetake} disabled={busy}>
          Refă fotografia
        </Button>
        <Button variant="primary" icon={<IconCheck size={18} />} onClick={onAnalyze} loading={busy}>
          Analizează eticheta
        </Button>
      </div>
    </div>
  );
}
