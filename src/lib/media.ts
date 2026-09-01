import type { Photo, PhotoMeta } from './types';

/** 写真から表示用の URL を求める関数。手元の画像でも共有リンク越しでも使えるようにする。 */
export type UrlResolver = (photo: PhotoMeta, size: 'thumb' | 'full') => string;

/** Blob URL は作りっぱなしにするとメモリを圧迫するので、写真 ID ごとに使い回す。 */
const cache = new Map<string, string>();

export function photoUrl(photo: Photo, size: 'thumb' | 'full'): string {
  const key = `${photo.id}:${size}`;
  let url = cache.get(key);
  if (!url) {
    url = URL.createObjectURL(size === 'thumb' ? photo.thumb : photo.full);
    cache.set(key, url);
  }
  return url;
}

export function releasePhotoUrls(photoId?: string): void {
  for (const [key, url] of cache) {
    if (photoId && !key.startsWith(`${photoId}:`)) continue;
    URL.revokeObjectURL(url);
    cache.delete(key);
  }
}
