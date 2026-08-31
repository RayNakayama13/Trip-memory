import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Edit, Photo, Place, Settings } from './types';
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
  /** ユーザーが手で編集したタイトル・メモ */
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
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<TripMemoryDB>> | null = null;

function db(): Promise<IDBPDatabase<TripMemoryDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TripMemoryDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        const photos = database.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('takenAt', 'takenAt');
        database.createObjectStore('places', { keyPath: 'key' });
        database.createObjectStore('edits', { keyPath: 'key' });
        database.createObjectStore('meta');
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
  await (await db()).clear('photos');
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

/** 保存容量の目安（ブラウザが対応している場合のみ） */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}
