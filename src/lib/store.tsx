import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Album, AlbumView, Edit, Photo, Place, Settings } from './types';
import { DEFAULT_SETTINGS } from './types';
import * as db from './db';
import { assignToAlbums, attachPlaces, buildAlbumView, type AlbumRange } from './cluster';
import { placeKey, reverseGeocode } from './geocode';
import { importFiles, type ImportProgress } from './importer';
import { releasePhotoUrls } from './media';

/** どのアルバムにも入っていない写真をまとめて見せるための、実体のないアルバム */
export const UNSORTED_ID = '__unsorted__';

interface LibraryState {
  ready: boolean;
  photos: Photo[];
  photoById: Map<string, Photo>;
  /** 表示用のアルバム一覧（新しい旅が先頭）。未整理があれば末尾に付く */
  albumViews: AlbumView[];
  settings: Settings;
  importing: ImportProgress | null;
  geocodingLeft: number;
  /** files を取り込む。albumId を渡すとそのアルバムに入れ、省略すると日付で自動振り分けする */
  addFiles: (files: File[], albumId?: string) => Promise<ImportProgress | null>;
  createAlbum: (title?: string) => Promise<string>;
  updateAlbum: (id: string, patch: Partial<Pick<Album, 'title' | 'note' | 'coverPhotoId'>>) => Promise<void>;
  /** アルバムを削除する。withPhotos が true なら中の写真ごと消す */
  removeAlbum: (id: string, withPhotos: boolean) => Promise<void>;
  /** 写真を別のアルバムへ移す（null で未整理に戻す） */
  movePhotos: (photoIds: string[], albumId: string | null) => Promise<void>;
  removePhoto: (id: string) => Promise<void>;
  removeAll: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  saveSpotEdit: (spotId: string, patch: { title?: string; note?: string }) => Promise<void>;
  spotTitleOf: (spotId: string, fallback: string) => string;
  spotNoteOf: (spotId: string) => string;
}

const LibraryContext = createContext<LibraryState | null>(null);

function newId(): string {
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeAlbum(title = ''): Album {
  const now = Date.now();
  return { id: newId(), title, note: '', coverPhotoId: null, createdAt: now, updatedAt: now };
}

export function LibraryProvider({ children }: { children: ReactNode }): JSX.Element {
  const [ready, setReady] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [edits, setEdits] = useState<Map<string, Edit>>(new Map());
  const [places, setPlaces] = useState<Map<string, Place | null>>(new Map());
  const [importing, setImporting] = useState<ImportProgress | null>(null);
  const [geocodingLeft, setGeocodingLeft] = useState(0);
  /** 問い合わせ済み（または問い合わせ中）の座標キー。二重リクエストを防ぐ。 */
  const requested = useRef<Set<string>>(new Set());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const [storedPhotos, storedAlbums, storedSettings, storedEdits] = await Promise.all([
        db.allPhotos(),
        db.allAlbums(),
        db.loadSettings(),
        db.allEdits(),
      ]);
      const editMap = new Map(storedEdits.map((e) => [e.key, e]));

      // アルバム機能を入れる前に取り込んだ写真を、自動グループ分けでアルバムへ移す
      const migrated = await db.getFlag('albumsMigrated');
      if (!migrated) {
        const { photos: nextPhotos, albums: nextAlbums } = await migrateToAlbums(
          storedPhotos,
          editMap,
          storedSettings,
        );
        setPhotos(nextPhotos);
        setAlbums(nextAlbums);
      } else {
        setPhotos(storedPhotos);
        setAlbums(storedAlbums);
      }

      setSettings(storedSettings);
      setEdits(editMap);
      setReady(true);
    })();
  }, []);

  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);

  const albumViews = useMemo(() => {
    const byAlbum = new Map<string, Photo[]>();
    for (const photo of photos) {
      const key = photo.albumId ?? UNSORTED_ID;
      const list = byAlbum.get(key);
      if (list) list.push(photo);
      else byAlbum.set(key, [photo]);
    }

    const views = albums.map((album) =>
      buildAlbumView(album, byAlbum.get(album.id) ?? [], settings),
    );
    // 新しい旅を先に。写真がまだ無いアルバムは作った順で先頭に置く
    views.sort((a, b) => (b.startAt || b.album.createdAt) - (a.startAt || a.album.createdAt));

    const unsorted = byAlbum.get(UNSORTED_ID);
    if (unsorted && unsorted.length > 0) {
      const album: Album = {
        id: UNSORTED_ID,
        title: '未整理の写真',
        note: '',
        coverPhotoId: null,
        createdAt: 0,
        updatedAt: 0,
      };
      views.push(buildAlbumView(album, unsorted, settings));
    }

    return attachPlaces(views, (lat, lon) => places.get(placeKey(lat, lon)) ?? null);
  }, [photos, albums, settings, places]);

  // 地名が未取得のスポットを順番に問い合わせる（Nominatim の利用ポリシーに従い直列・低速）
  useEffect(() => {
    if (!ready || !settings.reverseGeocode) return;

    const pending = new Map<string, { lat: number; lon: number }>();
    for (const view of albumViews) {
      for (const spot of view.spots) {
        if (spot.lat === null || spot.lon === null) continue;
        const key = placeKey(spot.lat, spot.lon);
        if (requested.current.has(key) || pending.has(key)) continue;
        pending.set(key, { lat: spot.lat, lon: spot.lon });
      }
    }
    if (pending.size === 0) return;
    for (const key of pending.keys()) requested.current.add(key);

    // 結果が届くたびに albumViews が作り直されてこの効果も再実行されるため、
    // 問い合わせ自体は効果のライフサイクルから切り離して最後まで走らせる。
    setGeocodingLeft((n) => n + pending.size);
    void (async () => {
      for (const [key, { lat, lon }] of pending) {
        const place = await reverseGeocode(lat, lon);
        if (!mounted.current) return;
        setPlaces((prev) => new Map(prev).set(key, place));
        setGeocodingLeft((n) => Math.max(0, n - 1));
      }
    })();
  }, [ready, settings.reverseGeocode, albumViews]);

  const reloadPhotos = useCallback(async () => {
    setPhotos(await db.allPhotos());
  }, []);

  const createAlbum = useCallback(async (title = '') => {
    const album = makeAlbum(title);
    await db.putAlbum(album);
    setAlbums((prev) => [...prev, album]);
    return album.id;
  }, []);

  const updateAlbum = useCallback(
    async (id: string, patch: Partial<Pick<Album, 'title' | 'note' | 'coverPhotoId'>>) => {
      if (id === UNSORTED_ID) return;
      const current = albums.find((a) => a.id === id);
      if (!current) return;
      const next: Album = { ...current, ...patch, updatedAt: Date.now() };
      await db.putAlbum(next);
      setAlbums((prev) => prev.map((a) => (a.id === id ? next : a)));
    },
    [albums],
  );

  const movePhotos = useCallback(
    async (photoIds: string[], albumId: string | null) => {
      if (photoIds.length === 0) return;
      const target = albumId === UNSORTED_ID ? null : albumId;
      await db.setPhotosAlbum(photoIds, target);
      await reloadPhotos();
    },
    [reloadPhotos],
  );

  const removeAlbum = useCallback(
    async (id: string, withPhotos: boolean) => {
      if (id === UNSORTED_ID) return;
      const ids = photos.filter((p) => p.albumId === id).map((p) => p.id);
      if (withPhotos) {
        await db.deletePhotos(ids);
        for (const photoId of ids) releasePhotoUrls(photoId);
      } else {
        await db.setPhotosAlbum(ids, null);
      }
      await db.deleteAlbum(id);
      setAlbums((prev) => prev.filter((a) => a.id !== id));
      await reloadPhotos();
    },
    [photos, reloadPhotos],
  );

  const addFiles = useCallback(
    async (files: File[], albumId?: string) => {
      if (files.length === 0) return null;
      // 端末に写真を貯めるので、消されにくい保存領域を一度だけ要求しておく
      void db.requestPersistentStorage();
      const result = await importFiles(files, setImporting);
      setImporting(null);

      if (result.addedIds.length > 0) {
        if (albumId && albumId !== UNSORTED_ID) {
          await db.setPhotosAlbum(result.addedIds, albumId);
        } else {
          await autoAssign(result.addedIds, albums, photos, settings, createAlbum);
          setAlbums(await db.allAlbums());
        }
      }
      await reloadPhotos();
      return result;
    },
    [albums, photos, settings, createAlbum, reloadPhotos],
  );

  const removePhoto = useCallback(
    async (id: string) => {
      await db.deletePhoto(id);
      releasePhotoUrls(id);
      await reloadPhotos();
    },
    [reloadPhotos],
  );

  const removeAll = useCallback(async () => {
    await db.deleteAllPhotos();
    releasePhotoUrls();
    setPhotos([]);
    setAlbums([]);
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      await db.saveSettings(next);
    },
    [settings],
  );

  const saveSpotEdit = useCallback(
    async (spotId: string, patch: { title?: string; note?: string }) => {
      const key = `spot:${spotId}`;
      const next: Edit = { ...(edits.get(key) ?? { key }), ...patch, key, updatedAt: Date.now() };
      setEdits((prev) => new Map(prev).set(key, next));
      await db.putEdit(next);
    },
    [edits],
  );

  const spotTitleOf = useCallback(
    (spotId: string, fallback: string) => edits.get(`spot:${spotId}`)?.title?.trim() || fallback,
    [edits],
  );
  const spotNoteOf = useCallback(
    (spotId: string) => edits.get(`spot:${spotId}`)?.note ?? '',
    [edits],
  );

  const value: LibraryState = {
    ready,
    photos,
    photoById,
    albumViews,
    settings,
    importing,
    geocodingLeft,
    addFiles,
    createAlbum,
    updateAlbum,
    removeAlbum,
    movePhotos,
    removePhoto,
    removeAll,
    updateSettings,
    saveSpotEdit,
    spotTitleOf,
    spotNoteOf,
  };

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

/** 既存アルバムの期間を、振り分け用の形にして返す。 */
function rangesOf(albums: Album[], photos: Photo[]): AlbumRange[] {
  return albums.map((album) => {
    const times = photos
      .filter((p) => p.albumId === album.id)
      .map((p) => p.takenAt)
      .filter((t): t is number => t !== null);
    return {
      albumId: album.id,
      startAt: times.length > 0 ? Math.min(...times) : 0,
      endAt: times.length > 0 ? Math.max(...times) : 0,
    };
  });
}

/** 取り込んだ写真を、日付の近い既存アルバムか、新しく作るアルバムへ振り分ける。 */
async function autoAssign(
  addedIds: string[],
  albums: Album[],
  knownPhotos: Photo[],
  settings: Settings,
  createAlbum: (title?: string) => Promise<string>,
): Promise<void> {
  const all = await db.allPhotos();
  const added = all.filter((p) => addedIds.includes(p.id));
  const assignment = assignToAlbums(added, rangesOf(albums, knownPhotos), settings);

  for (const [albumId, ids] of assignment.toExisting) {
    await db.setPhotosAlbum(ids, albumId);
  }
  for (const group of assignment.newGroups) {
    const albumId = await createAlbum();
    await db.setPhotosAlbum(group, albumId);
  }
  // 撮影日時が読み取れなかった写真は未整理のまま残し、利用者が移せるようにする
}

/**
 * アルバム機能を入れる前の写真を、アルバムへ移す（初回起動時に一度だけ）。
 * 以前のバージョンで付けた旅の名前とメモは、同じ ID 規則で引き継ぐ。
 */
async function migrateToAlbums(
  storedPhotos: Photo[],
  edits: Map<string, Edit>,
  settings: Settings,
): Promise<{ photos: Photo[]; albums: Album[] }> {
  const unassigned = storedPhotos.filter((p) => !p.albumId);
  const created: Album[] = [];

  if (unassigned.length > 0) {
    const assignment = assignToAlbums(unassigned, [], settings);
    for (const group of assignment.newGroups) {
      // 旧バージョンの旅 ID は先頭写真から作っていたので、同じ規則で名前を探す
      const previous = edits.get(`trip:t_${group[0]}`);
      const album = makeAlbum(previous?.title?.trim() ?? '');
      album.note = previous?.note ?? '';
      await db.putAlbum(album);
      await db.setPhotosAlbum(group, album.id);
      created.push(album);
    }
  }

  await db.setFlag('albumsMigrated', true);
  return { photos: await db.allPhotos(), albums: await db.allAlbums() };
}

export function useLibrary(): LibraryState {
  const context = useContext(LibraryContext);
  if (!context) throw new Error('LibraryProvider の外で useLibrary が呼ばれました');
  return context;
}
