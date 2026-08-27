import type { ReactNode } from 'react';
import { type ConfidenceBand, confidenceBand } from '../../domain/extraction';

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'accent';

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

const BAND_TONE: Record<ConfidenceBand, BadgeTone> = {
  high: 'ok',
  medium: 'warn',
  low: 'danger',
  unknown: 'neutral',
};

const BAND_LABEL: Record<ConfidenceBand, string> = {
  high: 'High confidence',
  medium: 'Check this',
  low: 'Verify',
  unknown: 'Not scored',
};

export function ConfidenceBadge({ confidence }: { confidence: number | null | undefined }) {
  const band = confidenceBand(confidence);
  const percent = confidence === null || confidence === undefined ? null : Math.round(confidence * 100);
  return (
    <span className={`badge badge--${BAND_TONE[band]}`} title={percent === null ? 'No confidence reported' : `Model confidence ${percent}%`}>
      <span className="badge__dot" />
      {BAND_LABEL[band]}
      {percent !== null ? ` ${percent}%` : ''}
    </span>
  );
}
