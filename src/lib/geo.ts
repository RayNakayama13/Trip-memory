export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** 2 地点間の距離（メートル）。 */
export function distanceMeters(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 座標群の平均位置。日付変更線をまたぐ場合も破綻しないようベクトル平均で求める。 */
export function centroid(points: LatLon[]): LatLon | null {
  if (points.length === 0) return null;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    const lat = toRad(p.lat);
    const lon = toRad(p.lon);
    x += Math.cos(lat) * Math.cos(lon);
    y += Math.cos(lat) * Math.sin(lon);
    z += Math.sin(lat);
  }
  x /= points.length;
  y /= points.length;
  z /= points.length;
  const lon = Math.atan2(y, x);
  const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
  return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI };
}

/** 距離を「1.2km」「350m」のような表示にする。 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`;
  if (meters < 10_000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.round(meters / 1000)}km`;
}
