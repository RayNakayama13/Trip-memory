/** 画像の縮小と、内容ハッシュによる ID 生成をまとめたユーティリティ。 */

const MIME = 'image/jpeg';

export interface Decoded {
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

/** EXIF の回転情報を反映した状態でデコードする。 */
export async function decode(file: Blob): Promise<Decoded> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return { bitmap, width: bitmap.width, height: bitmap.height };
}

/** 長辺が maxEdge に収まるよう縮小した JPEG を返す（元が小さければそのまま再エンコード）。 */
export async function resize(bitmap: ImageBitmap, maxEdge: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas context を取得できませんでした');
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.convertToBlob({ type: MIME, quality });
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context を取得できませんでした');
  ctx.drawImage(bitmap, 0, 0, w, h);
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
