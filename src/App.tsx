import { useCallback, useEffect, useState } from 'react';
import { LibraryProvider, useLibrary } from './lib/store';
import { TripList } from './components/TripList';
import { TripDetail } from './components/TripDetail';
import { SettingsPanel } from './components/SettingsPanel';

/** ブラウザの戻る/進むが効くように、画面の状態は URL のハッシュで持つ。 */
function useHashRoute(): [string, (route: string) => void] {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || '/');

  useEffect(() => {
    const onChange = (): void => setRoute(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((next: string) => {
    window.location.hash = next;
    window.scrollTo({ top: 0 });
  }, []);

  return [route, navigate];
}

function Shell(): JSX.Element {
  const { ready, trips, geocodingLeft, photos } = useLibrary();
  const [route, navigate] = useHashRoute();

  const tripId = route.startsWith('/trip/') ? route.slice('/trip/'.length) : null;
  const trip = tripId ? trips.find((t) => t.id === tripId) : null;

  // 写真を削除して旅そのものが消えた場合は一覧に戻す
  useEffect(() => {
    if (ready && tripId && !trip) navigate('/');
  }, [ready, tripId, trip, navigate]);

  return (
    <div className="app">
      <header className="header">
        <div className="header__inner">
          <button type="button" className="header__brand" onClick={() => navigate('/')}>
            <span className="header__logo" aria-hidden="true">
              🧳
            </span>
            Trip Memory
          </button>
          <span className="header__spacer" />
          {geocodingLeft > 0 && (
            <span className="header__status">
              <span className="spinner" aria-hidden="true" />
              地名を取得中 {geocodingLeft}
            </span>
          )}
          {photos.length > 0 && (
            <button type="button" className="btn btn--ghost" onClick={() => navigate('/settings')}>
              設定
            </button>
          )}
        </div>
      </header>

      <main style={{ flex: 1 }}>
        {!ready ? (
          <div className="empty">
            <div className="empty__emoji">🧳</div>
            読み込んでいます…
          </div>
        ) : route === '/settings' ? (
          <SettingsPanel onClose={() => navigate('/')} />
        ) : trip ? (
          <TripDetail trip={trip} onBack={() => navigate('/')} />
        ) : (
          <TripList onOpenTrip={(id) => navigate(`/trip/${id}`)} />
        )}
      </main>

      <footer className="footer">
        <div className="container">
          写真とデータはこの端末のブラウザ内（IndexedDB）にのみ保存されます。
          <br />
          地図と地名：
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            © OpenStreetMap contributors
          </a>
        </div>
      </footer>
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <LibraryProvider>
      <Shell />
    </LibraryProvider>
  );
}
