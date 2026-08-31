import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Photo, Spot } from '../lib/types';
import { photoUrl } from '../lib/media';
import { formatTime } from '../lib/format';

interface Props {
  spots: Spot[];
  photoById: Map<string, Photo>;
  titleOf: (spot: Spot, index: number) => string;
  activeSpotId: string | null;
  /** どこから選ばれたか。時系列側から選ばれたときだけ地図を動かす。 */
  activeSource: 'map' | 'timeline' | null;
  onSelectSpot: (spotId: string) => void;
}

/** 位置情報を持つスポットを地図上に順番付きで並べ、移動の線でつなぐ。 */
export function MapView({
  spots,
  photoById,
  titleOf,
  activeSpotId,
  activeSource,
  onSelectSpot,
}: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const onSelectRef = useRef(onSelectSpot);
  onSelectRef.current = onSelectSpot;

  const located = useMemo(
    () =>
      spots.filter(
        (s): s is Spot & { lat: number; lon: number } => s.lat !== null && s.lon !== null,
      ),
    [spots],
  );
  /** 座標の並びが変わったときだけ地図の表示範囲を合わせ直すための目印 */
  const boundsKey = located.map((s) => `${s.lat.toFixed(4)},${s.lon.toFixed(4)}`).join('|');
  const fittedRef = useRef<string>('');

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: true,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    // 誤操作を防ぐため、地図をクリックしてからホイールズームを有効にする
    map.on('click', () => map.scrollWheelZoom.enable());
    map.on('mouseout', () => map.scrollWheelZoom.disable());
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // スポットが変わるたびにマーカーと経路を作り直す
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const marker of markersRef.current.values()) marker.remove();
    markersRef.current.clear();
    map.eachLayer((layer) => {
      if (layer instanceof L.Polyline && !(layer instanceof L.Rectangle)) layer.remove();
    });

    if (located.length === 0) return;

    const path: L.LatLngExpression[] = located.map((spot) => [spot.lat, spot.lon]);
    if (path.length > 1) {
      L.polyline(path, {
        color: '#ff9d5c',
        weight: 2.5,
        opacity: 0.75,
        dashArray: '6 8',
      }).addTo(map);
    }

    located.forEach((spot, index) => {
      const number = spots.indexOf(spot) + 1;
      const marker = L.marker([spot.lat, spot.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div class="map-pin">${number}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        title: titleOf(spot, index),
        keyboard: true,
      }).addTo(map);

      const cover = spot.photoIds.map((id) => photoById.get(id)).find(Boolean);
      const time = spot.startAt ? formatTime(spot.startAt) : '';
      marker.bindPopup(
        `<div>
          ${cover ? `<img class="map-popup__thumb" src="${photoUrl(cover, 'thumb')}" alt="">` : ''}
          <div><strong>${escapeHtml(titleOf(spot, index))}</strong></div>
          <div style="color:#9aa3b5">${time}${time ? ' ・ ' : ''}${spot.photoIds.length} 枚</div>
        </div>`,
      );
      marker.on('click', () => onSelectRef.current(spot.id));
      markersRef.current.set(spot.id, marker);
    });

    // 地名の取得などで再描画されたときに、見ている位置が勝手に戻らないようにする
    if (fittedRef.current !== boundsKey) {
      map.fitBounds(L.latLngBounds(path), { padding: [40, 40], maxZoom: 15 });
      fittedRef.current = boundsKey;
    }
  }, [located, spots, photoById, titleOf, boundsKey]);

  // 選択中のスポットを強調し、地図の中心へ寄せる
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const [id, marker] of markersRef.current) {
      const element = marker.getElement()?.querySelector('.map-pin');
      element?.classList.toggle('map-pin--active', id === activeSpotId);
    }
    if (activeSpotId && activeSource === 'timeline') {
      const marker = markersRef.current.get(activeSpotId);
      if (marker) {
        map.panTo(marker.getLatLng(), { animate: true });
        marker.openPopup();
      }
    }
  }, [activeSpotId, activeSource]);

  if (located.length === 0) {
    return (
      <div className="map map--empty">
        <div>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🗺️</div>
          位置情報の付いた写真がないため、地図は表示できません。
          <br />
          <span className="faint">
            iPhone の場合は「設定 &gt; プライバシー &gt; 位置情報サービス &gt; カメラ」を確認してください。
          </span>
        </div>
      </div>
    );
  }

  return <div className="map" ref={containerRef} />;
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}
