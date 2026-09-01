import { useCallback, useEffect, useRef } from 'react';
import type { PhotoMeta } from '../lib/types';
import type { UrlResolver } from '../lib/media';
import { formatDateTime } from '../lib/format';

interface Props {
  photos: PhotoMeta[];
  urlOf: UrlResolver;
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** 手元のアルバムを見ているときだけ渡す。共有リンクからの閲覧では省略する。 */
  onDelete?: (photoId: string) => void;
  onMove?: (photoId: string) => void;
  caption?: string;
}

/** 写真を大きく見るためのオーバーレイ。左右キーで移動、Esc で閉じる。 */
export function Lightbox({
  photos,
  urlOf,
  index,
  onIndexChange,
  onClose,
  onDelete,
  onMove,
  caption,
}: Props): JSX.Element | null {
  const photo = photos[index];
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const move = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next >= 0 && next < photos.length) onIndexChange(next);
    },
    [index, photos.length, onIndexChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') move(-1);
      if (e.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, onClose]);

  // 背後のページがスクロールしないようにする
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!photo) return null;

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="写真の表示">
      <div className="lightbox__bar">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          ← 閉じる
        </button>
        <span>
          {index + 1} / {photos.length}
        </span>
        <span style={{ flex: 1 }} />
        {onMove && (
          <button type="button" className="btn btn--ghost" onClick={() => onMove(photo.id)}>
            アルバムを移す
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              if (window.confirm(`「${photo.fileName}」を削除しますか？`)) {
                onDelete(photo.id);
                if (index >= photos.length - 1) onClose();
              }
            }}
          >
            削除
          </button>
        )}
      </div>

      <div
        className="lightbox__stage"
        onTouchStart={(e) => {
          const touch = e.touches[0];
          touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
        }}
        onTouchEnd={(e) => {
          const start = touchStartRef.current;
          const touch = e.changedTouches[0];
          touchStartRef.current = null;
          if (!start || !touch) return;
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          // 横方向にはっきり動いたときだけ写真を送る（縦スワイプは無視）
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
        }}
      >
        <img src={urlOf(photo, 'full')} alt={photo.fileName} />
        {index > 0 && (
          <button
            type="button"
            className="lightbox__nav lightbox__nav--prev"
            onClick={() => move(-1)}
            aria-label="前の写真"
          >
            ‹
          </button>
        )}
        {index < photos.length - 1 && (
          <button
            type="button"
            className="lightbox__nav lightbox__nav--next"
            onClick={() => move(1)}
            aria-label="次の写真"
          >
            ›
          </button>
        )}
      </div>

      <div className="lightbox__caption">
        {caption && <div>{caption}</div>}
        <div className="faint">
          {photo.takenAt !== null ? formatDateTime(photo.takenAt) : '撮影日時不明'}
          {photo.takenAtSource === 'file' && '（ファイルの更新日時）'}
          {photo.cameraModel ? ` ・ ${photo.cameraModel}` : ''}
          {photo.lat !== null && photo.lon !== null
            ? ` ・ ${photo.lat.toFixed(5)}, ${photo.lon.toFixed(5)}`
            : ' ・ 位置情報なし'}
        </div>
      </div>
    </div>
  );
}
