import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Album, Edit, Photo, Place, Settings } from './types';
import { DEFAULT_SETTINGS } from './types';

interface TripMemoryDB extends DBSchema {
  photos: {
    key: string;
    value: Photo;
    indexes: { takenAt: number };
  };
  /** 逆ジオコーディング結果のキャッシュ。null は「該当なし」を意味する。 */
  places: {
    key: string;
    value: { key: string; place: Place | null; fetchedAt: number };
  };
  albums: {
    key: string;
    value: Album;
  };
  /** スポットの名前・メモ（スポットは計算で作られるため別に持つ） */
  edits: {
    key: string;
    value: Edit;
  };
  meta: {
    key: string;
    value: unknown;
  };
}

const DB_NAME = 'trip-memory';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<TripMemoryDB>> | null = null;

function db(): Promise<IDBPDatabase<TripMemoryDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TripMemoryDB>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          const photos = database.createObjectStore('photos', { keyPath: 'id' });
          photos.createIndex('takenAt', 'takenAt');
          database.createObjectStore('places', { keyPath: 'key' });
          database.createObjectStore('edits', { keyPath: 'key' });
          database.createObjectStore('meta');
        }
        if (oldVersion < 2) {
          // アルバムを実体として持つようにした。既存の写真は albumId を持たないので、
          // 起動後に自動グループ分けでアルバムへ振り分ける（migrateToAlbums）。
          database.createObjectStore('albums', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

/* ---------- photos ---------- */

export async function allPhotos(): Promise<Photo[]> {
  return (await db()).getAll('photos');
}

export async function photoExists(id: string): Promise<boolean> {
  const key = await (await db()).getKey('photos', id);
  return key !== undefined;
}

export async function putPhoto(photo: Photo): Promise<void> {
  await (await db()).put('photos', photo);
}

export async function deletePhoto(id: string): Promise<void> {
  await (await db()).delete('photos', id);
}

export async function deleteAllPhotos(): Promise<void> {
  const database = await db();
  await Promise.all([database.clear('photos'), database.clear('albums')]);
}

export async function deletePhotos(ids: string[]): Promise<void> {
  const database = await db();
  const tx = database.transaction('photos', 'readwrite');
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
}

/** 複数の写真の所属アルバムをまとめて書き換える。 */
export async function setPhotosAlbum(ids: string[], albumId: string | null): Promise<void> {
  const database = await db();
  const tx = database.transaction('photos', 'readwrite');
  await Promise.all(
    ids.map(async (id) => {
      const photo = await tx.store.get(id);
      if (photo) await tx.store.put({ ...photo, albumId });
    }),
  );
  await tx.done;
}

/* ---------- albums ---------- */

export async function allAlbums(): Promise<Album[]> {
  return (await db()).getAll('albums');
}

export async function putAlbum(album: Album): Promise<void> {
  await (await db()).put('albums', album);
}

export async function deleteAlbum(id: string): Promise<void> {
  await (await db()).delete('albums', id);
}

/* ---------- places cache ---------- */

/** 未キャッシュなら undefined、キャッシュ済みなら Place か null（該当なし）を返す。 */
export async function getCachedPlace(key: string): Promise<Place | null | undefined> {
  const row = await (await db()).get('places', key);
  return row ? row.place : undefined;
}

export async function putCachedPlace(key: string, place: Place | null): Promise<void> {
  await (await db()).put('places', { key, place, fetchedAt: Date.now() });
}

/* ---------- user edits ---------- */

export async function allEdits(): Promise<Edit[]> {
  return (await db()).getAll('edits');
}

export async function putEdit(edit: Edit): Promise<void> {
  await (await db()).put('edits', edit);
}

/* ---------- settings ---------- */

export async function loadSettings(): Promise<Settings> {
  const stored = (await (await db()).get('meta', 'settings')) as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await (await db()).put('meta', settings, 'settings');
}

/**
 * 保存領域を「消さないでほしい」ものとしてブラウザに登録する。
 * iOS Safari はしばらく使っていないサイトのデータを消すことがあるため、取り込み時に一度呼ぶ。
 * 許可されるかはブラウザ次第なので、結果は目安として扱う。
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** 一度きりの処理（アルバムへの移行など）が済んだかどうかの記録 */
export async function getFlag(key: string): Promise<boolean> {
  return ((await (await db()).get('meta', key)) as boolean | undefined) ?? false;
}

export async function setFlag(key: string, value: boolean): Promise<void> {
  await (await db()).put('meta', value, key);
}

/** 保存容量の目安（ブラウザが対応している場合のみ） */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}
