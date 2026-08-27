/**
 * Color Metal logo.
 *
 * Loads public/branding/cm-logo.png (or VITE_CM_LOGO_URL). If that file is
 * missing or fails to load it degrades to an inline typographic wordmark in the
 * brand colours, so the header and the printed label are never blank.
 *
 * To swap the logo: replace public/branding/cm-logo.png. Nothing else changes —
 * the app header, the A4 preview, the print output and the PDF export all read
 * from here.
 */

import { useState } from 'react';
import { company, logoUrl } from './brand';

export interface CmLogoProps {
  className?: string;
  /** CSS height, e.g. "26px" or "13mm". */
  height?: string;
  /** Rendering context: the A4 sheet uses larger fallback type. */
  variant?: 'app' | 'print';
}

export function CmLogo({ className = '', height = '26px', variant = 'app' }: CmLogoProps) {
  const [failed, setFailed] = useState(false);
  const src = logoUrl();

  if (!failed) {
    return (
      <img
        src={src}
        alt={company.name}
        className={className}
        style={{ height, width: 'auto' }}
        onError={() => setFailed(true)}
      />
    );
  }

  return <CmWordmark className={className} variant={variant} />;
}

export function CmWordmark({
  className = '',
  variant = 'app',
}: {
  className?: string;
  variant?: 'app' | 'print';
}) {
  const [colorWord, metalWord] = company.name.split(' ');

  if (variant === 'print') {
    return (
      <div className={className}>
        <div className="a4__wordmark">
          <span style={{ color: 'var(--cm-brand-gold, #BFA060)' }}>{colorWord}</span>{' '}
          <span style={{ color: 'var(--cm-brand-grey, #939393)' }}>{metalWord}</span>
        </div>
        <div className="a4__wordmark-sub">{company.tagline}</div>
      </div>
    );
  }

  return (
    <span
      className={className}
      style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '0.07em' }}
    >
      <span style={{ color: 'var(--cm-brand-gold, #BFA060)' }}>{colorWord}</span>{' '}
      <span style={{ color: 'var(--cm-brand-grey, #939393)' }}>{metalWord}</span>
    </span>
  );
}
