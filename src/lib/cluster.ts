import type { Album, AlbumView, Photo, Place, Settings, Spot } from './types';
import { centroid, distanceMeters, type LatLon } from './geo';
import { guessActivity } from './activity';

/** 位置情報を持つ写真だけを LatLon にして返す。 */
function coordsOf(photos: Photo[]): LatLon[] {
  return photos
    .filter((p): p is Photo & { lat: number; lon: number } => p.lat !== null && p.lon !== null)
    .map((p) => ({ lat: p.lat, lon: p.lon }));
}

function byTakenAt(a: Photo, b: Photo): number {
  return (a.takenAt ?? 0) - (b.takenAt ?? 0);
}

function timeRange(photos: Photo[]): { startAt: number; endAt: number } {
  const times = photos.map((p) => p.takenAt).filter((t): t is number => t !== null);
  if (times.length === 0) return { startAt: 0, endAt: 0 };
  return { startAt: Math.min(...times), endAt: Math.max(...times) };
}

/** アルバムの中を、時間の空きと移動距離で「立ち寄りスポット」に切り分ける。 */
function splitSpots(photos: Photo[], settings: Settings): Photo[][] {
  const gapMs = settings.spotGapMinutes * 60_000;
  const groups: Photo[][] = [];
  let current: Photo[] = [];
  let anchor: LatLon | null = null;

  for (const photo of photos) {
    const previous = current[current.length - 1];
    let startNew = false;

    if (previous && photo.takenAt !== null && previous.takenAt !== null) {
      startNew = photo.takenAt - previous.takenAt > gapMs;
    }
    if (!startNew && anchor && photo.lat !== null && photo.lon !== null) {
      startNew =
        distanceMeters(anchor, { lat: photo.lat, lon: photo.lon }) > settings.spotRadiusMeters;
    }

    if (startNew && current.length > 0) {
      groups.push(current);
      current = [];
      anchor = null;
    }

    current.push(photo);
    // 位置情報のない写真は直前のスポットに含め、基準点は動かさない
    anchor = centroid(coordsOf(current)) ?? anchor;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/** 写真の中から表紙にふさわしい 1 枚（横長で、なるべく旅の中盤のもの）を選ぶ。 */
function pickCover(photos: Photo[]): string | null {
  if (photos.length === 0) return null;
  const landscape = photos.filter((p) => p.width >= p.height);
  const pool = landscape.length > 0 ? landscape : photos;
  return pool[Math.floor(pool.length / 2)].id;
}

/**
 * アルバム 1 冊ぶんの表示内容を組み立てる。
 * この時点では地名が未取得なので place は null で、あとから attachPlaces で埋める。
 */
export function buildAlbumView(album: Album, photos: Photo[], settings: Settings): AlbumView {
  const sorted = [...photos].sort(byTakenAt);
  const spots: Spot[] = splitSpots(sorted, settings).map((spotPhotos) => {
    const center = centroid(coordsOf(spotPhotos));
    const range = timeRange(spotPhotos);
    return {
      id: `s_${spotPhotos[0].id}`,
      albumId: album.id,
      photoIds: spotPhotos.map((p) => p.id),
      startAt: range.startAt,
      endAt: range.endAt,
      lat: center?.lat ?? null,
      lon: center?.lon ?? null,
      place: null,
      activity: guessActivity(null, range.startAt),
    };
  });

  const range = timeRange(sorted);
  return {
    album,
    photoIds: sorted.map((p) => p.id),
    spots,
    startAt: range.startAt,
    endAt: range.endAt,
    suggestedTitle: '',
    coverPhotoId: album.coverPhotoId ?? pickCover(sorted),
  };
}

/** アルバムの中で訪れた地域名を、写真の多い順に取り出す。 */
export function regionsOf(view: AlbumView): string[] {
  const counts = new Map<string, number>();
  for (const spot of view.spots) {
    const region = spot.place?.city ?? spot.place?.state ?? spot.place?.country;
    if (!region) continue;
    counts.set(region, (counts.get(region) ?? 0) + spot.photoIds.length);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

/** 日数（暦日ベース）。 */
export function dayCount(view: { startAt: number; endAt: number }): number {
  if (!view.startAt) return 0;
  const start = new Date(view.startAt);
  const end = new Date(view.endAt);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

/** 地名が入ったあとの、アルバムの候補名を組み立てる。 */
export function suggestTitle(view: AlbumView): string {
  if (view.photoIds.length === 0) return '新しいアルバム';
  if (!view.startAt) return '日時のわからない写真';

  const regions = regionsOf(view).slice(0, 3);
  const days = dayCount(view);
  const date = new Date(view.startAt);
  const when = `${date.getFullYear()}年${date.getMonth() + 1}月`;

  if (regions.length === 0) return `${when}の思い出`;
  const where = regions.join('・');
  return days >= 2 ? `${where}の旅` : `${where}おでかけ`;
}

/**
 * 逆ジオコーディングの結果をスポットに反映し、行動の推測と候補名を更新する。
 * lookup は座標 → 場所（未取得なら null）を返す関数。
 */
export function attachPlaces(
  views: AlbumView[],
  lookup: (lat: number, lon: number) => Place | null,
): AlbumView[] {
  return views.map((view) => {
    const spots = view.spots.map((spot) => {
      const place = spot.lat !== null && spot.lon !== null ? lookup(spot.lat, spot.lon) : null;
      return {
        ...spot,
        place,
        activity: place ? guessActivity(place, spot.startAt) : spot.activity,
      };
    });
    const withPlaces = { ...view, spots };
    return { ...withPlaces, suggestedTitle: suggestTitle(withPlaces) };
  });
}

/**
 * 写真を撮影日時の空きで区切ってまとめる。
 *
 * 旅の区切りは利用者がアルバムを作って決めるので、通常の取り込みでは使わない。
 * アルバム機能を入れる前のデータを移すときにだけ呼ぶ。
 */
export function groupByDateGap(photos: Photo[], gapHours: number): string[][] {
  const gapMs = gapHours * 3600_000;
  const dated = photos.filter((p) => p.takenAt !== null).sort(byTakenAt);
  const undated = photos.filter((p) => p.takenAt === null);

  const groups: string[][] = [];
  let current: Photo[] = [];
  for (const photo of dated) {
    const previous = current[current.length - 1];
    if (previous && (photo.takenAt as number) - (previous.takenAt as number) > gapMs) {
      groups.push(current.map((p) => p.id));
      current = [];
    }
    current.push(photo);
  }
  if (current.length > 0) groups.push(current.map((p) => p.id));

  // 撮影日時が読み取れなかった写真は、まとめてひとつの塊にする
  if (undated.length > 0) groups.push(undated.map((p) => p.id));
  return groups;
}
