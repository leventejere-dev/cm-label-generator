/**
 * Recent Labels.
 * Operational view: date, product, dimensions, weight, status.
 * Supplier identity is never shown here — this is a Color Metal tool.
 */

import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { LABEL_STATUS_LABELS, type LabelRecord, type LabelStatus } from '../../domain/labelRecord';

const STATUS_TONE: Record<LabelStatus, 'neutral' | 'ok' | 'warn' | 'danger' | 'accent'> = {
  draft: 'neutral',
  extracted: 'warn',
  reviewed: 'accent',
  generated: 'ok',
  failed: 'danger',
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ro-RO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function RecentLabels({
  records,
  loading,
  emptyHint,
}: {
  records: LabelRecord[];
  loading: boolean;
  emptyHint?: string;
}) {
  if (loading) {
    return (
      <Card padded>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="spinner" />
          <span className="muted">Se încarcă etichetele…</span>
        </div>
      </Card>
    );
  }

  if (records.length === 0) {
    return (
      <Card padded={false}>
        <EmptyState>{emptyHint ?? 'Nicio etichetă încă. Scanează prima etichetă a furnizorului.'}</EmptyState>
      </Card>
    );
  }

  return (
    <Card padded={false} flush>
      <ul className="list">
        {records.map((record) => {
          const target = record.reviewedData ? `/label/${record.id}` : `/review/${record.id}`;
          const meta = [record.summaryDimensions, record.summaryWeight].filter(Boolean).join(' · ');
          return (
            <li key={record.id}>
              <Link className="list__item" to={target}>
                <div className="list__row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="list__primary">
                      {record.summaryProduct ?? 'Produs neidentificat'}
                    </div>
                    <div className="list__meta">
                      {formatDate(record.createdAt)}
                      {meta ? ` · ${meta}` : ''}
                    </div>
                    <div className="list__meta mono" style={{ fontSize: 'var(--cm-text-xs)' }}>
                      {record.cmId}
                    </div>
                  </div>
                  <Badge tone={STATUS_TONE[record.status]}>
                    {LABEL_STATUS_LABELS[record.status]}
                  </Badge>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
