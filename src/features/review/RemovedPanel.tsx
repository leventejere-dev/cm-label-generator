/**
 * "Removed supplier information" — internal verification only.
 * Read-only by design: this panel proves what was excluded; it never offers a
 * way to put any of it back onto the customer-facing label.
 */

import { Disclosure } from '../../components/ui/Disclosure';
import { Badge } from '../../components/ui/Badge';
import { IconShield } from '../../components/ui/Icons';
import { groupRemoved, type RemovedItem } from '../../domain/sanitize';

export function RemovedPanel({ removed }: { removed: RemovedItem[] }) {
  if (removed.length === 0) {
    return (
      <div className="disclosure">
        <div className="disclosure__summary" style={{ cursor: 'default' }}>
          <IconShield size={18} />
          No supplier information was detected on this label
        </div>
      </div>
    );
  }

  const groups = groupRemoved(removed);

  return (
    <Disclosure
      summary={
        <>
          <IconShield size={18} />
          Removed supplier information
          <Badge tone="neutral">{removed.length}</Badge>
        </>
      }
    >
      <p className="muted" style={{ fontSize: 'var(--cm-text-xs)', marginBottom: 'var(--cm-space-3)' }}>
        Internal verification only. None of this appears on the Color Metal label.
      </p>

      {groups.map((group) => (
        <div key={group.category} style={{ marginBottom: 'var(--cm-space-4)' }}>
          <div className="field__label" style={{ marginBottom: 4 }}>
            {group.label}
          </div>
          {group.items.map((item, index) => (
            <div className="removed-item" key={`${item.path}-${index}`}>
              <div style={{ flex: 1 }}>
                <div className="removed-item__value">{item.value}</div>
                <div className="removed-item__meta">
                  {item.reason}
                  {item.path !== '-' ? ` · from ${item.path}` : ''}
                </div>
              </div>
              <Badge tone="danger">Excluded</Badge>
            </div>
          ))}
        </div>
      ))}
    </Disclosure>
  );
}
