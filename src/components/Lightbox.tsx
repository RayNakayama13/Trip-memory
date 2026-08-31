import { useCallback, useEffect } from 'react';
import type { Photo } from '../lib/types';
import { photoUrl } from '../lib/media';
import { formatDateTime } from '../lib/format';

interface Props {
  photos: Photo[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onDelete: (photoId: string) => void;
  caption?: string;
}

/** 写真を大きく見るためのオーバーレイ。左右キーで移動、Esc で閉じる。 */
export function Lightbox({
  photos,
  index,
  onIndexChange,
  onClose,
  onDelete,
  caption,
}: Props): JSX.Element | null {
  const photo = photos[index];

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
      </div>

      <div className="lightbox__stage">
        <img src={photoUrl(photo, 'full')} alt={photo.fileName} />
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
