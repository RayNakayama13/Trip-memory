import { useState } from 'react';
import type { AlbumView } from '../lib/types';
import { UNSORTED_ID } from '../lib/store';
import { formatRange } from '../lib/format';

interface Props {
  /** 移動先の候補（自分自身は除いて渡す） */
  albums: AlbumView[];
  count: number;
  onPick: (albumId: string | 'new') => void;
  onClose: () => void;
}

/** 写真の移動先アルバムを選ぶダイアログ。 */
export function AlbumPicker({ albums, count, onPick, onClose }: Props): JSX.Element {
  const [busy, setBusy] = useState(false);

  const choose = (albumId: string | 'new'): void => {
    setBusy(true);
    onPick(albumId);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="移動先のアルバムを選ぶ">
      <div className="modal__panel">
        <div className="modal__head">
          <h3>写真 {count} 枚の移動先</h3>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="modal__body">
          <button
            type="button"
            className="album-option album-option--new"
            disabled={busy}
            onClick={() => choose('new')}
          >
            <span className="album-option__title">＋ 新しいアルバムを作って移す</span>
          </button>

          {albums.map((view) => (
            <button
              key={view.album.id}
              type="button"
              className="album-option"
              disabled={busy}
              onClick={() => choose(view.album.id)}
            >
              <span className="album-option__title">
                {view.album.id === UNSORTED_ID
                  ? '未整理に戻す'
                  : view.album.title || view.suggestedTitle}
              </span>
              <span className="album-option__meta">
                {view.startAt ? formatRange(view.startAt, view.endAt) : '写真なし'} ・{' '}
                {view.photoIds.length} 枚
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
