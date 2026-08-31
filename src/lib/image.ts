/** 画像の読み込み・縮小と、内容ハッシュによる ID 生成をまとめたユーティリティ。 */

const MIME = 'image/jpeg';

export interface Decoded {
  source: CanvasImageSource;
  /** EXIF の回転を反映したあとの幅・高さ */
  width: number;
  height: number;
  /** 使い終わったら必ず呼んで Blob URL を解放する */
  release: () => void;
}

/**
 * 画像を読み込む。
 *
 * createImageBitmap の imageOrientation オプションはブラウザによって効かないことがあり、
 * iPhone の縦写真が横倒しになる。<img> 経由なら CSS の image-orientation: from-image が
 * 既定で効くため、どのブラウザでも EXIF の回転が反映された状態で得られる。
 */
export function decode(blob: Blob): Promise<Decoded> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    const release = (): void => URL.revokeObjectURL(url);

    image.onload = () =>
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release,
      });
    image.onerror = () => {
      release();
      reject(new Error('この形式の画像は表示できませんでした'));
    };
    image.src = url;
  });
}

/** すでにデコード済みの ImageBitmap を Decoded として扱う（HEIC 変換の結果など）。 */
export function fromBitmap(bitmap: ImageBitmap): Decoded {
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    release: () => bitmap.close(),
  };
}

/** 長辺が maxEdge に収まるよう縮小した JPEG を返す（元が小さければそのまま再エンコード）。 */
export async function resize(decoded: Decoded, maxEdge: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(decoded.width, decoded.height));
  const w = Math.max(1, Math.round(decoded.width * scale));
  const h = Math.max(1, Math.round(decoded.height * scale));

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas context を取得できませんでした');
    ctx.drawImage(decoded.source, 0, 0, w, h);
    return canvas.convertToBlob({ type: MIME, quality });
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context を取得できませんでした');
  ctx.drawImage(decoded.source, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('画像の変換に失敗しました'))),
      MIME,
      quality,
    );
  });
}

/** ファイル内容の SHA-256。同じ写真を二度取り込んでも重複しないようにするための ID。 */
export async function contentHash(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
