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
import type { Edit, Photo, Place, Settings, Trip } from './types';
import { DEFAULT_SETTINGS } from './types';
import * as db from './db';
import { attachPlaces, buildTrips } from './cluster';
import { placeKey, reverseGeocode } from './geocode';
import { importFiles, type ImportProgress } from './importer';
import { releasePhotoUrls } from './media';

interface LibraryState {
  ready: boolean;
  photos: Photo[];
  photoById: Map<string, Photo>;
  trips: Trip[];
  settings: Settings;
  edits: Map<string, Edit>;
  /** 取り込み中の進捗。null なら取り込み中ではない。 */
  importing: ImportProgress | null;
  /** 地名を問い合わせ中のスポット数 */
  geocodingLeft: number;
  addFiles: (files: File[]) => Promise<ImportProgress | null>;
  removePhoto: (id: string) => Promise<void>;
  removeAll: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  saveEdit: (key: string, patch: Omit<Partial<Edit>, 'key' | 'updatedAt'>) => Promise<void>;
  /** ユーザー編集を優先したタイトルを返す。 */
  titleOf: (key: string, fallback: string) => string;
  noteOf: (key: string) => string;
}

const LibraryContext = createContext<LibraryState | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }): JSX.Element {
  const [ready, setReady] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
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
      const [storedPhotos, storedSettings, storedEdits] = await Promise.all([
        db.allPhotos(),
        db.loadSettings(),
        db.allEdits(),
      ]);
      setPhotos(storedPhotos);
      setSettings(storedSettings);
      setEdits(new Map(storedEdits.map((e) => [e.key, e])));
      setReady(true);
    })();
  }, []);

  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);

  const trips = useMemo(() => {
    const base = buildTrips(photos, settings);
    return attachPlaces(base, (lat, lon) => places.get(placeKey(lat, lon)) ?? null);
  }, [photos, settings, places]);

  // 地名が未取得のスポットを順番に問い合わせる（Nominatim の利用ポリシーに従い直列・低速）
  useEffect(() => {
    if (!ready || !settings.reverseGeocode) return;

    const pending = new Map<string, { lat: number; lon: number }>();
    for (const trip of trips) {
      for (const spot of trip.spots) {
        if (spot.lat === null || spot.lon === null) continue;
        const key = placeKey(spot.lat, spot.lon);
        if (requested.current.has(key) || pending.has(key)) continue;
        pending.set(key, { lat: spot.lat, lon: spot.lon });
      }
    }
    if (pending.size === 0) return;
    for (const key of pending.keys()) requested.current.add(key);

    // 結果が届くたびに trips が作り直されてこの効果も再実行されるため、
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
  }, [ready, settings.reverseGeocode, trips]);

  const addFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return null;
    const result = await importFiles(files, setImporting);
    setPhotos(await db.allPhotos());
    setImporting(null);
    return result;
  }, []);

  const removePhoto = useCallback(async (id: string) => {
    await db.deletePhoto(id);
    releasePhotoUrls(id);
    setPhotos(await db.allPhotos());
  }, []);

  const removeAll = useCallback(async () => {
    await db.deleteAllPhotos();
    releasePhotoUrls();
    setPhotos([]);
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      await db.saveSettings(next);
    },
    [settings],
  );

  const saveEdit = useCallback(
    async (key: string, patch: Omit<Partial<Edit>, 'key' | 'updatedAt'>) => {
      const next: Edit = { ...(edits.get(key) ?? { key }), ...patch, key, updatedAt: Date.now() };
      setEdits((prev) => new Map(prev).set(key, next));
      await db.putEdit(next);
    },
    [edits],
  );

  const titleOf = useCallback(
    (key: string, fallback: string) => edits.get(key)?.title?.trim() || fallback,
    [edits],
  );
  const noteOf = useCallback((key: string) => edits.get(key)?.note ?? '', [edits]);

  const value: LibraryState = {
    ready,
    photos,
    photoById,
    trips,
    settings,
    edits,
    importing,
    geocodingLeft,
    addFiles,
    removePhoto,
    removeAll,
    updateSettings,
    saveEdit,
    titleOf,
    noteOf,
  };

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryState {
  const context = useContext(LibraryContext);
  if (!context) throw new Error('LibraryProvider の外で useLibrary が呼ばれました');
  return context;
}
