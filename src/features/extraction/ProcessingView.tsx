/**
 * Analysis progress.
 * Each line corresponds to real work; the bar is indeterminate on purpose —
 * we never invent a percentage we cannot measure.
 *
 * Two things here exist because of what a slow scan feels like on a phone in a
 * warehouse. First, the elapsed counter reads the wall clock rather than adding
 * up ticks: phones throttle timers the moment the screen dims or the app goes to
 * the background, so a tick-counter reported 15 s for a scan that really took
 * 41 s. Second, a scan that goes quiet for half a minute is indistinguishable
 * from a frozen app, so the copy changes as time passes and there is always a
 * way out.
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { IconCheck } from '../../components/ui/Icons';
import type { StageSnapshot } from './pipeline';

/** When the wait stops being "normal" and the screen should say so. */
const SLOW_AFTER_S = 15;
/** When it is long enough that the person deserves an explicit way out. */
const VERY_SLOW_AFTER_S = 40;

export function ProcessingView({ stages, onCancel }: { stages: StageSnapshot[]; onCancel?: () => void }) {
  const startedAt = useRef(Date.now());
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = startedAt.current;
    const tick = () => setSeconds(Math.floor((Date.now() - started) / 1000));
    const timer = setInterval(tick, 1000);
    // A throttled tab wakes up on visibility change; re-read the clock then so
    // the number never lies about how long this has taken.
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const slow = seconds >= SLOW_AFTER_S;
  const verySlow = seconds >= VERY_SLOW_AFTER_S;

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Se analizează eticheta</h1>
        <p className="page-subtitle">
          {verySlow
            ? 'Serviciul gratuit este aglomerat chiar acum. Mai încearcă puțin sau anulează și reia peste un minut.'
            : slow
              ? 'Durează mai mult decât de obicei. Nu închide aplicația — analiza continuă.'
              : 'De obicei durează câteva secunde. Ține aplicația deschisă.'}
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

      {onCancel ? (
        <div className="btn-row">
          <Button variant={verySlow ? 'secondary' : 'ghost'} onClick={onCancel}>
            Anulează analiza
          </Button>
        </div>
      ) : null}
    </div>
  );
}
