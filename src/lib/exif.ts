import exifr from 'exifr';

export interface ExifData {
  takenAt: number | null;
  takenAtSource: 'exif' | 'file' | 'none';
  lat: number | null;
  lon: number | null;
  heading: number | null;
  cameraModel?: string;
}

interface RawExif {
  DateTimeOriginal?: Date;
  CreateDate?: Date;
  ModifyDate?: Date;
  latitude?: number;
  longitude?: number;
  GPSImgDirection?: number;
  Make?: string;
  Model?: string;
}

function firstDate(raw: RawExif): Date | undefined {
  for (const value of [raw.DateTimeOriginal, raw.CreateDate, raw.ModifyDate]) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  }
  return undefined;
}

function validCoord(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    // 0,0 は GPS 未取得のカメラが書き込むことがあるので無効扱いにする
    !(lat === 0 && lon === 0)
  );
}

/**
 * 写真から撮影日時・位置情報を取り出す。
 * EXIF の日時はタイムゾーンを持たないため、撮影地の壁時計の値としてそのまま扱う。
 */
export async function readExif(file: File): Promise<ExifData> {
  let raw: RawExif = {};
  try {
    raw = (await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      translateValues: true,
      reviveValues: true,
    })) as RawExif;
  } catch {
    // EXIF が無い / 壊れている写真でも取り込みは続行する
    raw = {};
  }
  raw = raw ?? {};

  const exifDate = firstDate(raw);
  let takenAt: number | null = null;
  let takenAtSource: ExifData['takenAtSource'] = 'none';

  if (exifDate) {
    takenAt = exifDate.getTime();
    takenAtSource = 'exif';
  } else if (file.lastModified) {
    takenAt = file.lastModified;
    takenAtSource = 'file';
  }

  const hasCoord = validCoord(raw.latitude, raw.longitude);
  const model = [raw.Make, raw.Model]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' ')
    .trim();

  return {
    takenAt,
    takenAtSource,
    lat: hasCoord ? (raw.latitude as number) : null,
    lon: hasCoord ? (raw.longitude as number) : null,
    heading: typeof raw.GPSImgDirection === 'number' ? raw.GPSImgDirection : null,
    cameraModel: model || undefined,
  };
}
