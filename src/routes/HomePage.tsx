import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppBar } from '../components/ui/AppBar';
import { Button } from '../components/ui/Button';
import { Card, SectionHeading } from '../components/ui/Card';
import { IconCamera, IconClock, IconShield } from '../components/ui/Icons';
import { env } from '../config/env';
import type { LabelRecord } from '../domain/labelRecord';
import { getRepository } from '../lib/data/repository';
import { RecentLabels } from '../features/history/RecentLabels';
import { useScanSession } from '../state/scanSession';

export function HomePage() {
  const navigate = useNavigate();
  const reset = useScanSession((state) => state.reset);
  const [records, setRecords] = useState<LabelRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const repository = await getRepository();
        const list = await repository.list(6);
        if (!cancelled) setRecords(list);
      } catch {
        if (!cancelled) setRecords([]);
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
      <AppBar title="Generator etichete" />
      <main className="app-main stack">
        <section>
          <h1 className="page-title">Scanează eticheta furnizorului</h1>
          <p className="page-subtitle">
            Fotografiază eticheta de pe materialul livrat. Color Metal păstrează datele produsului
            și elimină tot ce identifică furnizorul.
          </p>
        </section>

        <div className="hero-actions">
          <Button
            variant="primary"
            size="lg"
            block
            icon={<IconCamera size={22} />}
            onClick={() => {
              reset();
              navigate('/scan');
            }}
          >
            Scanează eticheta
          </Button>
          <Button variant="secondary" size="lg" block onClick={() => navigate('/labels')}>
            Toate etichetele
          </Button>
        </div>

        <Card padded>
          <div style={{ display: 'flex', gap: 'var(--cm-space-3)', alignItems: 'flex-start' }}>
            <IconShield size={20} />
            <div style={{ fontSize: 'var(--cm-text-sm)' }}>
              <strong>Identitatea furnizorului nu se tipărește niciodată.</strong>
              <p className="muted" style={{ marginTop: 2 }}>
                Numele furnizorilor, logourile, adresele, datele de contact și codurile de bare
                originale sunt excluse din eticheta generată. Poți verifica exact ce a fost eliminat
                înainte de tipărire.
              </p>
            </div>
          </div>
        </Card>

        <section>
          <SectionHeading
            title="Etichete recente"
            aside={
              <Link to="/labels" className="muted" style={{ fontSize: 'var(--cm-text-sm)' }}>
                Vezi toate
              </Link>
            }
          />
          <RecentLabels records={records} loading={loading} />
        </section>
      </main>

      <footer className="app-footer no-print">
        <IconClock size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> Generator
        Etichete CM {env.appVersion}
      </footer>
    </div>
  );
}
