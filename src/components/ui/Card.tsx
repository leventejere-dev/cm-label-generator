import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  flush?: boolean;
  children: ReactNode;
}

export function Card({ padded = true, flush = false, className = '', children, ...rest }: CardProps) {
  const classes = ['card', padded ? 'card--padded' : '', flush ? 'card--flush' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

export function SectionHeading({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {aside}
    </div>
  );
}
