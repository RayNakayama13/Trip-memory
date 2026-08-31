import type { Photo, Place, Settings, Spot, Trip } from './types';
import { centroid, distanceMeters, type LatLon } from './geo';
import { guessActivity } from './activity';

/** 位置情報を持つ写真だけを LatLon にして返す。 */
function coordsOf(photos: Photo[]): LatLon[] {
  return photos
    .filter((p): p is Photo & { lat: number; lon: number } => p.lat !== null && p.lon !== null)
    .map((p) => ({ lat: p.lat, lon: p.lon }));
}

/** 撮影日時が近い写真を「ひとつの旅」に切り分ける。 */
function splitTrips(sorted: Photo[], gapHours: number): Photo[][] {
  const gapMs = gapHours * 3600_000;
  const groups: Photo[][] = [];
  let current: Photo[] = [];

  for (const photo of sorted) {
    const previous = current[current.length - 1];
    if (previous && photo.takenAt !== null && previous.takenAt !== null) {
      if (photo.takenAt - previous.takenAt > gapMs) {
        groups.push(current);
        current = [];
      }
    }
    current.push(photo);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/** 旅の中を、時間の空きと移動距離で「立ち寄りスポット」に切り分ける。 */
function splitSpots(tripPhotos: Photo[], settings: Settings): Photo[][] {
  const gapMs = settings.spotGapMinutes * 60_000;
  const groups: Photo[][] = [];
  let current: Photo[] = [];
  let anchor: LatLon | null = null;

  for (const photo of tripPhotos) {
    const previous = current[current.length - 1];
    let startNew = false;

    if (previous && photo.takenAt !== null && previous.takenAt !== null) {
      startNew = photo.takenAt - previous.takenAt > gapMs;
    }
    if (!startNew && anchor && photo.lat !== null && photo.lon !== null) {
      startNew = distanceMeters(anchor, { lat: photo.lat, lon: photo.lon }) > settings.spotRadiusMeters;
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

/** 旅・スポットの ID は先頭写真の内容ハッシュから作る（写真を追加しても変わりにくい）。 */
function idOf(prefix: string, photos: Photo[]): string {
  return `${prefix}_${photos[0].id}`;
}

function timeRange(photos: Photo[]): { startAt: number; endAt: number } {
  const times = photos.map((p) => p.takenAt).filter((t): t is number => t !== null);
  if (times.length === 0) return { startAt: 0, endAt: 0 };
  return { startAt: Math.min(...times), endAt: Math.max(...times) };
}

/** 写真の中から表紙にふさわしい 1 枚（横長で、なるべく旅の中盤のもの）を選ぶ。 */
function pickCover(photos: Photo[]): string | null {
  if (photos.length === 0) return null;
  const landscape = photos.filter((p) => p.width >= p.height);
  const pool = landscape.length > 0 ? landscape : photos;
  return pool[Math.floor(pool.length / 2)].id;
}

/**
 * 写真の一覧から旅とスポットを組み立てる。
 * この時点では地名が未取得なので place は null で、あとから attachPlaces で埋める。
 */
export function buildTrips(photos: Photo[], settings: Settings): Trip[] {
  const dated = photos
    .filter((p) => p.takenAt !== null)
    .sort((a, b) => (a.takenAt as number) - (b.takenAt as number));
  const undated = photos.filter((p) => p.takenAt === null);

  const trips: Trip[] = splitTrips(dated, settings.tripGapHours).map((tripPhotos) => {
    const tripId = idOf('t', tripPhotos);
    const spots: Spot[] = splitSpots(tripPhotos, settings).map((spotPhotos) => {
      const center = centroid(coordsOf(spotPhotos));
      const range = timeRange(spotPhotos);
      return {
        id: idOf('s', spotPhotos),
        tripId,
        photoIds: spotPhotos.map((p) => p.id),
        startAt: range.startAt,
        endAt: range.endAt,
        lat: center?.lat ?? null,
        lon: center?.lon ?? null,
        place: null,
        activity: guessActivity(null, range.startAt),
      };
    });

    const range = timeRange(tripPhotos);
    return {
      id: tripId,
      photoIds: tripPhotos.map((p) => p.id),
      spots,
      startAt: range.startAt,
      endAt: range.endAt,
      autoTitle: '',
      coverPhotoId: pickCover(tripPhotos),
    };
  });

  if (undated.length > 0) {
    const tripId = idOf('t', undated);
    trips.push({
      id: tripId,
      photoIds: undated.map((p) => p.id),
      spots: [
        {
          id: idOf('s', undated),
          tripId,
          photoIds: undated.map((p) => p.id),
          startAt: 0,
          endAt: 0,
          lat: centroid(coordsOf(undated))?.lat ?? null,
          lon: centroid(coordsOf(undated))?.lon ?? null,
          place: null,
          activity: '撮影日時が読み取れなかった写真',
        },
      ],
      startAt: 0,
      endAt: 0,
      autoTitle: '日時のわからない写真',
      coverPhotoId: pickCover(undated),
    });
  }

  // 新しい旅を先に表示する
  return trips.sort((a, b) => b.startAt - a.startAt);
}

/** 旅の中で訪れた地域名を、写真の多い順に取り出す。 */
export function regionsOf(trip: Trip): string[] {
  const counts = new Map<string, number>();
  for (const spot of trip.spots) {
    const region = spot.place?.city ?? spot.place?.state ?? spot.place?.country;
    if (!region) continue;
    counts.set(region, (counts.get(region) ?? 0) + spot.photoIds.length);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

/** 日数（暦日ベース）。 */
export function dayCount(trip: Trip): number {
  if (!trip.startAt) return 0;
  const start = new Date(trip.startAt);
  const end = new Date(trip.endAt);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

/** 地名が入ったあとの旅のタイトルを組み立てる。 */
export function makeTitle(trip: Trip): string {
  if (!trip.startAt) return '日時のわからない写真';
  const regions = regionsOf(trip).slice(0, 3);
  const days = dayCount(trip);
  const date = new Date(trip.startAt);
  const when = `${date.getFullYear()}年${date.getMonth() + 1}月`;

  if (regions.length === 0) return `${when}の思い出`;
  const where = regions.join('・');
  if (days >= 2) return `${where}の旅`;
  return `${where}おでかけ`;
}

/**
 * 逆ジオコーディングの結果をスポットに反映し、行動の推測とタイトルを更新する。
 * lookup は座標 → 場所（未取得なら null）を返す関数。
 */
export function attachPlaces(
  trips: Trip[],
  lookup: (lat: number, lon: number) => Place | null,
): Trip[] {
  return trips.map((trip) => {
    const spots = trip.spots.map((spot) => {
      const place = spot.lat !== null && spot.lon !== null ? lookup(spot.lat, spot.lon) : null;
      return { ...spot, place, activity: place ? guessActivity(place, spot.startAt) : spot.activity };
    });
    const withPlaces = { ...trip, spots };
    return { ...withPlaces, autoTitle: makeTitle(withPlaces) };
  });
}
