import { useEffect, useState } from 'react';
import { AppBar } from '../components/ui/AppBar';
import { Banner } from '../components/ui/Banner';
import type { LabelRecord } from '../domain/labelRecord';
import { getRepository } from '../lib/data/repository';
import { toAppError, type AppError } from '../lib/errors';
import { RecentLabels } from '../features/history/RecentLabels';

export function HistoryPage() {
  const [records, setRecords] = useState<LabelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const repository = await getRepository();
        const list = await repository.list(50);
        if (!cancelled) setRecords(list);
      } catch (cause) {
        if (!cancelled) setError(toAppError(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="app-shell">
      <AppBar title="Recent labels" back="/" />
      <main className="app-main stack">
        <div>
          <h1 className="page-title">Recent labels</h1>
          <p className="page-subtitle">Open a previous label to view its data or reprint it.</p>
        </div>
        {error ? (
          <Banner tone="danger" title={error.title}>
            {error.detail}
          </Banner>
        ) : null}
        <RecentLabels records={records} loading={loading} />
      </main>
    </div>
  );
}
