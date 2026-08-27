/**
 * Analysis progress.
 * Each line corresponds to real work; the bar is indeterminate on purpose —
 * we never invent a percentage we cannot measure.
 */

import { useEffect, useState } from 'react';
import { IconCheck } from '../../components/ui/Icons';
import type { StageSnapshot } from './pipeline';

export function ProcessingView({ stages }: { stages: StageSnapshot[] }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Se analizează eticheta</h1>
        <p className="page-subtitle">
          De obicei durează câteva secunde. Ține aplicația deschisă.
        </p>
      </div>

      <div className="progress-track" role="progressbar" aria-label="Analiza este în curs">
        <div className="progress-track__bar" />
      </div>

      <ul className="stages">
        {stages.map((stage) => (
          <li key={stage.id} className="stage" data-state={stage.state}>
            <span className="stage__marker">
              {stage.state === 'done' ? (
                <IconCheck size={13} />
              ) : stage.state === 'active' ? (
                <span className="spinner" style={{ width: 12, height: 12 }} />
              ) : null}
            </span>
            <span>{stage.label}</span>
          </li>
        ))}
      </ul>

      <p className="muted" style={{ fontSize: 'var(--cm-text-xs)' }} aria-live="polite">
        Timp scurs: {seconds} s
      </p>
    </div>
  );
}
