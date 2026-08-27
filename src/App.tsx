import { Suspense, lazy } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from './routes/HomePage';

// The home screen loads eagerly — it is what the operator sees first. The rest
// of the flow is split so the initial download on a warehouse phone stays small.
const ScanPage = lazy(() => import('./routes/ScanPage').then((m) => ({ default: m.ScanPage })));
const ReviewPage = lazy(() => import('./routes/ReviewPage').then((m) => ({ default: m.ReviewPage })));
const LabelPage = lazy(() => import('./routes/LabelPage').then((m) => ({ default: m.LabelPage })));
const HistoryPage = lazy(() => import('./routes/HistoryPage').then((m) => ({ default: m.HistoryPage })));

function RouteFallback() {
  return (
    <div className="app-shell">
      <main className="app-main">
        <div className="card card--padded" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="spinner" />
          <span className="muted">Se încarcă…</span>
        </div>
      </main>
    </div>
  );
}

/**
 * HashRouter, deliberately.
 * GitHub Pages serves static files only and cannot rewrite unknown paths to
 * index.html, so a BrowserRouter deep link (/review/abc) would 404 on reload.
 * Hash routing works on Pages, on any static host and from a file:// preview,
 * with no server configuration at all.
 */
export default function App() {
  return (
    <HashRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/review/:id" element={<ReviewPage />} />
          <Route path="/label/:id" element={<LabelPage />} />
          <Route path="/labels" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
