import type { ReactNode } from 'react';
import { IconAlert, IconCheck, IconInfo } from './Icons';

export type BannerTone = 'info' | 'warn' | 'danger' | 'ok';

export interface BannerProps {
  tone?: BannerTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}

const ICONS: Record<BannerTone, typeof IconInfo> = {
  info: IconInfo,
  warn: IconAlert,
  danger: IconAlert,
  ok: IconCheck,
};

export function Banner({ tone = 'info', title, children, action }: BannerProps) {
  const Icon = ICONS[tone];
  return (
    <div className={`banner banner--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon className="banner__icon" size={20} />
      <div className="banner__body">
        {title ? <div className="banner__title">{title}</div> : null}
        {children}
        {action ? <div style={{ marginTop: 'var(--cm-space-3)' }}>{action}</div> : null}
      </div>
    </div>
  );
}
