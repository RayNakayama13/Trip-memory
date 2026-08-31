import type { Album, Photo } from './types';
import { getSupabase, ensureSignedIn, makeInviteToken } from './supabase';
import * as db from './db';
import { decode, resize } from './image';

const BUCKET = 'trip-photos';
const THUMB_EDGE = 400;

interface PhotoRow {
  id: string;
  album_id: string;
  uploader_id: string;
  file_name: string;
  taken_at: string | null;
  lat: number | null;
  lon: number | null;
  width: number;
  height: number;
  storage_path: string;
}

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  /** 相手側で書き換えられていた場合の、新しい名前とメモ */
  remote: { title: string; note: string; updatedAt: number } | null;
  members: number;
}

export interface SyncProgress {
  phase: 'upload' | 'download' | 'done';
  done: number;
  total: number;
}

const storagePath = (remoteAlbumId: string, photoId: string): string =>
  `${remoteAlbumId}/${photoId}.jpg`;

/**
 * アルバムを共有できる状態にする。
 * サーバーにアルバムを作り、合言葉つきの招待リンクを返す。
 */
export async function createSharedAlbum(album: Album): Promise<{ remoteId: string; inviteToken: string }> {
  const supabase = getSupabase();
  const userId = await ensureSignedIn();
  const inviteToken = makeInviteToken();

  const { data, error } = await supabase
    .from('shared_albums')
    .insert({
      title: album.title,
      note: album.note,
      owner_id: userId,
      invite_token: inviteToken,
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`共有の開始に失敗しました：${error?.message ?? '不明なエラー'}`);
  const remoteId = data.id as string | undefined;
  if (!remoteId) throw new Error('共有の開始に失敗しました：アルバム ID を受け取れませんでした');
  return { remoteId, inviteToken };
}

/** 招待リンクの合言葉で参加し、アルバムの情報を受け取る。 */
export async function joinByToken(
  token: string,
): Promise<{ remoteId: string; title: string; note: string; inviteToken: string }> {
  const supabase = getSupabase();
  await ensureSignedIn();

  const { data: joined, error } = await supabase.rpc('join_album', { token, display_name: '' });
  if (error || !joined) {
    throw new Error('この招待リンクは使えませんでした。リンクが正しいか確認してください。');
  }

  const remoteId = joined as string;
  const { data: album, error: readError } = await supabase
    .from('shared_albums')
    .select('title, note, invite_token')
    .eq('id', remoteId)
    .single();
  if (readError || !album) throw new Error('アルバムの読み込みに失敗しました。');

  return {
    remoteId,
    title: (album.title as string) ?? '',
    note: (album.note as string) ?? '',
    inviteToken: (album.invite_token as string) ?? token,
  };
}

/**
 * 共有アルバムを同期する。
 *
 * 手元にしかない写真を上げ、サーバーにしかない写真を落とす。写真の ID は
 * 内容から作ったハッシュなので、同じ写真を別々の人が入れても重複しない。
 * 名前とメモは、あとから書き換えたほうを採用する（最終更新が新しいほう）。
 */
export async function syncAlbum(
  album: Album,
  localPhotos: Photo[],
  onProgress?: (progress: SyncProgress) => void,
): Promise<SyncResult> {
  if (!album.remoteId) throw new Error('このアルバムは共有されていません。');
  const supabase = getSupabase();
  const userId = await ensureSignedIn();
  const remoteId = album.remoteId;

  const { data: remoteAlbum, error: albumError } = await supabase
    .from('shared_albums')
    .select('title, note, updated_at')
    .eq('id', remoteId)
    .single();
  if (albumError || !remoteAlbum) {
    throw new Error('共有アルバムを開けませんでした。参加から外れている可能性があります。');
  }

  const { data: rows, error: rowsError } = await supabase
    .from('shared_photos')
    .select('id, album_id, uploader_id, file_name, taken_at, lat, lon, width, height, storage_path')
    .eq('album_id', remoteId);
  if (rowsError) throw new Error(`写真の一覧を取得できませんでした：${rowsError.message}`);

  const remoteRows = (rows ?? []) as PhotoRow[];
  const remoteIds = new Set(remoteRows.map((r) => r.id));
  const localIds = new Set(localPhotos.map((p) => p.id));

  // --- 手元にしかない写真を上げる ---
  const toUpload = localPhotos.filter((p) => !remoteIds.has(p.id));
  let uploaded = 0;
  for (const photo of toUpload) {
    onProgress?.({ phase: 'upload', done: uploaded, total: toUpload.length });
    const path = storagePath(remoteId, photo.id);
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, photo.full, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) throw new Error(`写真の送信に失敗しました：${uploadError.message}`);

    const { error: insertError } = await supabase.from('shared_photos').upsert({
      id: photo.id,
      album_id: remoteId,
      uploader_id: userId,
      file_name: photo.fileName,
      taken_at: photo.takenAt !== null ? new Date(photo.takenAt).toISOString() : null,
      lat: photo.lat,
      lon: photo.lon,
      width: photo.width,
      height: photo.height,
      storage_path: path,
    });
    if (insertError) throw new Error(`写真の登録に失敗しました：${insertError.message}`);

    await db.putPhoto({ ...photo, uploaded: true });
    uploaded += 1;
  }

  // --- サーバーにしかない写真を落とす ---
  const toDownload = remoteRows.filter((r) => !localIds.has(r.id));
  let downloaded = 0;
  for (const row of toDownload) {
    onProgress?.({ phase: 'download', done: downloaded, total: toDownload.length });
    const { data: blob, error: downloadError } = await supabase.storage
      .from(BUCKET)
      .download(row.storage_path);
    if (downloadError || !blob) continue; // 1 枚落とせなくても残りは続ける

    // サーバーには表示用の画像だけを置いているので、一覧用は手元で作る
    const image = await decode(blob);
    let thumb: Blob;
    try {
      thumb = await resize(image, THUMB_EDGE, 0.7);
    } finally {
      image.release();
    }

    await db.putPhoto({
      id: row.id,
      albumId: album.id,
      fileName: row.file_name || `${row.id}.jpg`,
      takenAt: row.taken_at ? new Date(row.taken_at).getTime() : null,
      takenAtSource: row.taken_at ? 'exif' : 'none',
      lat: row.lat,
      lon: row.lon,
      heading: null,
      width: row.width,
      height: row.height,
      full: blob,
      thumb,
      createdAt: Date.now(),
      uploaded: true,
    });
    downloaded += 1;
  }

  // --- 名前とメモ ---
  const remoteUpdatedAt = new Date(remoteAlbum.updated_at as string).getTime();
  let remote: SyncResult['remote'] = null;
  if (remoteUpdatedAt > album.updatedAt) {
    remote = {
      title: (remoteAlbum.title as string) ?? '',
      note: (remoteAlbum.note as string) ?? '',
      updatedAt: remoteUpdatedAt,
    };
  } else if (
    (remoteAlbum.title as string) !== album.title ||
    (remoteAlbum.note as string) !== album.note
  ) {
    await supabase
      .from('shared_albums')
      .update({ title: album.title, note: album.note, updated_at: new Date().toISOString() })
      .eq('id', remoteId);
  }

  const { count } = await supabase
    .from('album_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('album_id', remoteId);

  onProgress?.({ phase: 'done', done: 0, total: 0 });
  return { uploaded, downloaded, remote, members: count ?? 1 };
}

/** 共有をやめる。持ち主ならサーバーから消し、参加者なら自分だけ抜ける。 */
export async function stopSharing(album: Album): Promise<void> {
  if (!album.remoteId) return;
  const supabase = getSupabase();
  const userId = await ensureSignedIn();

  if (album.shareRole === 'owner') {
    // 写真ファイルはアルバムを消しても残るため、先に消す
    const { data: rows } = await supabase
      .from('shared_photos')
      .select('storage_path')
      .eq('album_id', album.remoteId);
    const paths = (rows ?? []).map((r) => r.storage_path as string);
    if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
    await supabase.from('shared_albums').delete().eq('id', album.remoteId);
  } else {
    await supabase
      .from('album_members')
      .delete()
      .eq('album_id', album.remoteId)
      .eq('user_id', userId);
  }
}
