import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AlbumView, Album, PhotoMeta, Spot } from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/types';
import { attachPlaces, buildAlbumView, dayCount, regionsOf } from '../lib/cluster';
import { placeKey, reverseGeocode } from '../lib/geocode';
import { loadAlbumForViewing, type ViewedAlbum } from '../lib/sharing';
import { sharingConfigured } from '../lib/supabase';
import type { Place } from '../lib/types';
import type { UrlResolver } from '../lib/media';
import { formatRange } from '../lib/format';
import { MapView } from './MapView';
import { Timeline } from './Timeline';
import { Lightbox } from './Lightbox';

interface Props {
  token: string;
  onExit: () => void;
}

/**
 * 見るだけのリンクで開いたアルバムの画面。
 * 端末には何も保存せず、その場で読み込んで表示する。
 */
export function SharedAlbumView({ token, onExit }: Props): JSX.Element {
  const [album, setAlbum] = useState<ViewedAlbum | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [places, setPlaces] = useState<Map<string, Place | null>>(new Map());
  const [active, setActive] = useState<{ id: string; source: 'map' | 'timeline' } | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!sharingConfigured) {
      setError('このアプリでは共有リンクを開けません。リンクをくれた方に確認してください。');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadAlbumForViewing(token);
        if (!cancelled) setAlbum(loaded);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '読み込めませんでした');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const photoById = useMemo(
    () => new Map((album?.photos ?? []).map((p) => [p.id, p])),
    [album],
  );

  const view: AlbumView | null = useMemo(() => {
    if (!album) return null;
    // 立ち寄り先の切り分けは、手元のアルバムと同じ計算を使う
    const shell: Album = {
      id: 'shared',
      title: album.title,
      note: album.note,
      coverPhotoId: null,
      createdAt: 0,
      updatedAt: 0,
    };
    const built = buildAlbumView(shell, album.photos, DEFAULT_SETTINGS);
    return attachPlaces([built], (lat, lon) => places.get(placeKey(lat, lon)) ?? null)[0];
  }, [album, places]);

  // 地名は見る側でも取得する（座標だけを問い合わせるので写真は送られない）
  useEffect(() => {
    if (!view) return;
    const pending = new Map<string, { lat: number; lon: number }>();
    for (const spot of view.spots) {
      if (spot.lat === null || spot.lon === null) continue;
      const key = placeKey(spot.lat, spot.lon);
      if (places.has(key) || pending.has(key)) continue;
      pending.set(key, { lat: spot.lat, lon: spot.lon });
    }
    if (pending.size === 0) return;

    let cancelled = false;
    void (async () => {
      for (const [key, { lat, lon }] of pending) {
        const place = await reverseGeocode(lat, lon);
        if (cancelled) return;
        setPlaces((prev) => new Map(prev).set(key, place));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, places]);

  const urlOf = useCallback<UrlResolver>(
    (photo, size) => album?.urls.get(photo.id)?.[size] ?? '',
    [album],
  );

  const spotTitle = useCallback(
    (spot: Spot, index: number) => spot.place?.name ?? `${index + 1} 番目の立ち寄り先`,
    [],
  );

  const openPhoto = useCallback(
    (photoId: string) => {
      const index = (album?.photos ?? []).findIndex((p) => p.id === photoId);
      if (index >= 0) setLightboxIndex(index);
    },
    [album],
  );

  if (error) {
    return (
      <div className="container">
        <div className="empty">
          <div className="empty__emoji">🧳</div>
          <h2>アルバムを開けませんでした</h2>
          <p className="faint">{error}</p>
          <div style={{ marginTop: 16 }}>
            <button type="button" className="btn btn--ghost" onClick={onExit}>
              自分の旅の記録へ
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!album || !view) {
    return (
      <div className="container">
        <div className="empty">
          <div className="empty__emoji">🧳</div>
          アルバムを読み込んでいます…
        </div>
      </div>
    );
  }

  const photos: PhotoMeta[] = album.photos;
  const regions = regionsOf(view);
  const title = album.title || view.suggestedTitle;

  return (
    <div className="container">
      <div className="detail-head">
        <span className="tag" style={{ marginBottom: 10, display: 'inline-flex' }}>
          共有されたアルバム
        </span>
        <h1 className="detail-head__title">{title}</h1>
        <div className="detail-head__meta">
          <span>{formatRange(view.startAt, view.endAt)}</span>
          {view.startAt > 0 && <span>{dayCount(view)}日間</span>}
          <span>写真 {photos.length} 枚</span>
          {view.spots.length > 0 && <span>立ち寄り {view.spots.length} か所</span>}
          {regions.length > 0 && <span>{regions.slice(0, 4).join('・')}</span>}
        </div>
        {album.note && <div className="note" style={{ marginTop: 12 }}>{album.note}</div>}
      </div>

      <MapView
        spots={view.spots}
        photoById={photoById}
        urlOf={urlOf}
        titleOf={spotTitle}
        activeSpotId={active?.id ?? null}
        activeSource={active?.source ?? null}
        onSelectSpot={(id) => setActive({ id, source: 'map' })}
      />

      <Timeline
        view={view}
        photoById={photoById}
        urlOf={urlOf}
        spotTitle={spotTitle}
        noteOf={() => ''}
        activeSpotId={active?.id ?? null}
        activeSource={active?.source ?? null}
        onActivateSpot={(id) => setActive({ id, source: 'timeline' })}
        onOpenPhoto={openPhoto}
      />

      <div className="share" style={{ margin: '32px 0 10px' }}>
        <span className="share__title">このアルバムについて</span>
        <p className="faint">
          共有リンクから表示しています。写真の追加や編集はできません。
          自分の旅も同じように記録したい場合は、下から始められます。
        </p>
        <div>
          <button type="button" className="btn" onClick={onExit}>
            自分の旅の記録を作る
          </button>
        </div>
      </div>

      {lightboxIndex !== null && photos.length > 0 && (
        <Lightbox
          photos={photos}
          urlOf={urlOf}
          index={Math.min(lightboxIndex, photos.length - 1)}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          caption={title}
        />
      )}
    </div>
  );
}
