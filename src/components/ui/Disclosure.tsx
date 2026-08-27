import { useId, useState, type ReactNode } from 'react';
import { IconChevron } from './Icons';

export interface DisclosureProps {
  summary: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export function Disclosure({ summary, defaultOpen = false, children, className = '' }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className={`disclosure ${className}`} data-open={open}>
      <button
        type="button"
        className="disclosure__summary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {summary}
        <IconChevron className="disclosure__chevron" size={18} />
      </button>
      {open ? (
        <div className="disclosure__panel" id={panelId}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
