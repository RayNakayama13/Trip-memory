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

/**
 * crypto.subtle が使えないときの代替ハッシュ。
 *
 * crypto.subtle は「安全なコンテキスト」（https:// か localhost）でしか使えず、
 * 自宅の Wi-Fi 経由で http://192.168.x.x のように開いた場合は存在しない。
 * 重複した写真を見分けるのが目的なので、暗号強度は必要ない。
 * FNV-1a を 4 本、別々の初期値で同時に回して 128bit 相当の値を作る。
 */
function fallbackHash(bytes: Uint8Array): string {
  const PRIME = 0x01000193;
  let h0 = 0x811c9dc5;
  let h1 = 0x1000193b;
  let h2 = 0x7fed7fed;
  let h3 = 0xdeadbeef;

  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    h0 = Math.imul(h0 ^ b, PRIME);
    h1 = Math.imul(h1 ^ (b + i), PRIME);
    h2 = Math.imul(h2 ^ (b ^ (i >>> 3)), PRIME);
    h3 = Math.imul(h3 ^ (b + (i << 1)), PRIME);
  }

  // 長さも混ぜて、並びが同じで長さだけ違うデータの衝突を避ける
  h0 ^= bytes.length;
  h3 = Math.imul(h3 ^ bytes.length, PRIME);

  return [h0, h1, h2, h3].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('');
}

/** ファイル内容のハッシュ。同じ写真を二度取り込んでも重複しないようにするための ID。 */
export async function contentHash(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();

  if (crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .slice(0, 16)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return fallbackHash(new Uint8Array(buffer));
}
