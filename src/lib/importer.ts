import type { Photo } from './types';
import { readExif } from './exif';
import { contentHash, decode, fromBitmap, resize, type Decoded } from './image';
import { photoExists, putPhoto } from './db';

/** 表示用画像とサムネイルの長辺（px） */
const FULL_EDGE = 1600;
const THUMB_EDGE = 400;

export interface ImportProgress {
  total: number;
  processed: number;
  added: number;
  /** 取り込み済みだった写真 */
  skipped: number;
  failed: Array<{ fileName: string; reason: string }>;
  currentFileName: string;
}

const HEIC_PATTERN = /\.(heic|heif)$/i;

function looksHeic(file: File): boolean {
  return /^image\/hei[cf]/i.test(file.type) || HEIC_PATTERN.test(file.name);
}

/** iPhone の HEIC は多くのブラウザが直接デコードできないため、必要になったときだけ変換器を読み込む。 */
async function decodeHeic(file: File): Promise<Decoded> {
  const { heicTo } = await import('heic-to');
  return fromBitmap(await heicTo({ blob: file, type: 'bitmap' }));
}

async function decodeAny(file: File): Promise<Decoded> {
  if (looksHeic(file)) return decodeHeic(file);
  try {
    return await decode(file);
  } catch (error) {
    // 拡張子も MIME も当てにならない場合があるので、最後に HEIC として読み直す
    try {
      return await decodeHeic(file);
    } catch {
      throw error;
    }
  }
}

function isImageCandidate(file: File): boolean {
  return file.type.startsWith('image/') || looksHeic(file) || /\.(jpe?g|png|webp|avif)$/i.test(file.name);
}

/**
 * 写真を 1 枚ずつ取り込み、縮小画像とメタデータを IndexedDB に保存する。
 * 同じ内容の写真は内容ハッシュで判定してスキップするので、重複アップロードしても増えない。
 */
export async function importFiles(
  files: File[],
  onProgress: (progress: ImportProgress) => void,
): Promise<ImportProgress> {
  const targets = files.filter(isImageCandidate);
  const progress: ImportProgress = {
    total: targets.length,
    processed: 0,
    added: 0,
    skipped: 0,
    failed: files
      .filter((f) => !isImageCandidate(f))
      .map((f) => ({ fileName: f.name, reason: '画像ではないファイルです' })),
    currentFileName: '',
  };
  onProgress({ ...progress });

  for (const file of targets) {
    progress.currentFileName = file.name;
    onProgress({ ...progress });

    try {
      const id = await contentHash(file);
      if (await photoExists(id)) {
        progress.skipped += 1;
      } else {
        const [exif, image] = await Promise.all([readExif(file), decodeAny(file)]);
        let full: Blob;
        let thumb: Blob;
        try {
          full = await resize(image, FULL_EDGE, 0.82);
          thumb = await resize(image, THUMB_EDGE, 0.7);
        } finally {
          image.release();
        }
        const photo: Photo = {
          id,
          fileName: file.name,
          takenAt: exif.takenAt,
          takenAtSource: exif.takenAtSource,
          lat: exif.lat,
          lon: exif.lon,
          heading: exif.heading,
          width: image.width,
          height: image.height,
          full,
          thumb,
          cameraModel: exif.cameraModel,
          createdAt: Date.now(),
        };
        await putPhoto(photo);
        progress.added += 1;
      }
    } catch (error) {
      progress.failed.push({
        fileName: file.name,
        reason: error instanceof Error ? error.message : '読み込めませんでした',
      });
    }

    progress.processed += 1;
    onProgress({ ...progress });
  }

  progress.currentFileName = '';
  onProgress({ ...progress });
  return progress;
}
