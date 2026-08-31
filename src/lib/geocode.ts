import type { Place } from './types';
import { getCachedPlace, putCachedPlace } from './db';

const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
/** Nominatim の利用ポリシー（1 秒あたり 1 リクエストまで）に合わせた間隔 */
const MIN_INTERVAL_MS = 1100;

interface NominatimAddress {
  tourism?: string;
  attraction?: string;
  amenity?: string;
  leisure?: string;
  historic?: string;
  building?: string;
  shop?: string;
  railway?: string;
  aeroway?: string;
  road?: string;
  neighbourhood?: string;
  quarter?: string;
  suburb?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  province?: string;
  state?: string;
  country?: string;
  country_code?: string;
}

interface NominatimResult {
  name?: string;
  display_name?: string;
  category?: string;
  type?: string;
  address?: NominatimAddress;
  error?: string;
}

/** 座標を約 11m 四方に丸めてキャッシュキーにする。 */
export function placeKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

function pickName(result: NominatimResult): string {
  const a = result.address ?? {};
  const candidates = [
    result.name,
    a.tourism,
    a.attraction,
    a.historic,
    a.leisure,
    a.amenity,
    a.shop,
    a.railway,
    a.aeroway,
    a.building,
    a.neighbourhood,
    a.quarter,
    a.suburb,
    a.city_district,
    a.road,
    a.city,
    a.town,
    a.village,
    a.municipality,
    a.county,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return result.display_name?.split(',')[0]?.trim() || '名称不明の場所';
}

function toPlace(result: NominatimResult): Place {
  const a = result.address ?? {};
  return {
    name: pickName(result),
    city: a.city || a.town || a.village || a.municipality || a.city_district || a.county,
    state: a.state || a.province,
    country: a.country,
    countryCode: a.country_code?.toUpperCase(),
    category: result.category,
    type: result.type,
  };
}

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** リクエストを直列化し、最短でも MIN_INTERVAL_MS の間隔を空けて実行する。 */
function schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return task();
  });
  // 失敗しても後続のリクエストが止まらないようにする
  queue = run.catch(() => undefined);
  return run;
}

/**
 * 座標から地名を取得する。確定した結果は IndexedDB にキャッシュし、同じ場所を二度問い合わせない。
 * 取得できなかった場合は null を返し、呼び出し側は座標のみで表示する。
 */
export async function reverseGeocode(lat: number, lon: number): Promise<Place | null> {
  const key = placeKey(lat, lon);
  const cached = await getCachedPlace(key);
  if (cached !== undefined) return cached;

  try {
    const place = await schedule(async () => {
      const url = new URL(ENDPOINT);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lon));
      url.searchParams.set('zoom', '17');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('accept-language', navigator.language || 'ja');

      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`地名の取得に失敗しました (${res.status})`);
      const json = (await res.json()) as NominatimResult;
      return json.error ? null : toPlace(json);
    });
    // 「該当なし」も確定した結果なのでキャッシュする
    await putCachedPlace(key, place);
    return place;
  } catch {
    // 通信エラーは一時的なものとみなし、キャッシュせずに次回再試行させる
    return null;
  }
}
