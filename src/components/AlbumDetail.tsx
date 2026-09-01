import { useCallback, useMemo, useState } from 'react';
import type { AlbumView, Photo, Spot } from '../lib/types';
import { useLibrary, UNSORTED_ID } from '../lib/store';
import { dayCount, regionsOf } from '../lib/cluster';
import { formatRange } from '../lib/format';
import { EditableText } from './EditableText';
import { MapView } from './MapView';
import { Timeline } from './Timeline';
import { Lightbox } from './Lightbox';
import { Uploader } from './Uploader';
import { AlbumPicker } from './AlbumPicker';
import { SharePanel } from './SharePanel';

interface Props {
  view: AlbumView;
  onBack: () => void;
}

/** ひとつのアルバムを、地図と時系列で振り返る画面。 */
export function AlbumDetail({ view, onBack }: Props): JSX.Element {
  const {
    albumViews,
    photoById,
    updateAlbum,
    removeAlbum,
    movePhotos,
    createAlbum,
    removePhoto,
    spotTitleOf,
    spotNoteOf,
    saveSpotEdit,
  } = useLibrary();

  const [active, setActive] = useState<{ id: string; source: 'map' | 'timeline' } | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  /** 移動しようとしている写真。null なら移動ダイアログは閉じている */
  const [moving, setMoving] = useState<string[] | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const album = view.album;
  const unsorted = album.id === UNSORTED_ID;
  const title = album.title || view.suggestedTitle;
  const regions = regionsOf(view);

  const photos = useMemo(
    () => view.photoIds.map((id) => photoById.get(id)).filter((p): p is Photo => p !== undefined),
    [view.photoIds, photoById],
  );

  const spotTitle = useCallback(
    (spot: Spot, index: number) =>
      spotTitleOf(spot.id, spot.place?.name ?? `${index + 1} 番目の立ち寄り先`),
    [spotTitleOf],
  );

  const openPhoto = useCallback(
    (photoId: string) => {
      const index = photos.findIndex((p) => p.id === photoId);
      if (index >= 0) setLightboxIndex(index);
    },
    [photos],
  );

  const handleMove = async (target: string | 'new'): Promise<void> => {
    const ids = moving;
    setMoving(null);
    if (!ids) return;
    const albumId = target === 'new' ? await createAlbum() : target;
    await movePhotos(ids, albumId === UNSORTED_ID ? null : albumId);
  };

  const handleDelete = async (withPhotos: boolean): Promise<void> => {
    if (withPhotos && !window.confirm(`写真 ${view.photoIds.length} 枚ごと削除します。元に戻せません。`)) {
      return;
    }
    await removeAlbum(album.id, withPhotos);
    onBack();
  };

  const located = view.spots.filter((s) => s.lat !== null).length;

  return (
    <div className="container">
      <div className="detail-head">
        <button type="button" className="btn btn--ghost" onClick={onBack} style={{ marginBottom: 10 }}>
          ← 旅の一覧
        </button>

        {unsorted ? (
          <h1 className="detail-head__title">未整理の写真</h1>
        ) : (
          <h1 className="detail-head__title">
            <EditableText
              value={album.title}
              placeholder={view.suggestedTitle || 'アルバム名を付ける'}
              ariaLabel="アルバム名"
              onSave={(value) => void updateAlbum(album.id, { title: value })}
            />
          </h1>
        )}

        <div className="detail-head__meta">
          <span>
            {view.photoIds.length === 0 ? 'まだ写真がありません' : formatRange(view.startAt, view.endAt)}
          </span>
          {view.startAt > 0 && <span>{dayCount(view)}日間</span>}
          <span>写真 {view.photoIds.length} 枚</span>
          {view.spots.length > 0 && <span>立ち寄り {view.spots.length} か所</span>}
          {regions.length > 0 && <span>{regions.slice(0, 4).join('・')}</span>}
        </div>

        {unsorted ? (
          <p className="faint" style={{ marginTop: 10 }}>
            撮影日時が読み取れなかった写真や、アルバムから外した写真がここに入ります。
            各スポットの「アルバムを移す」から、行き先のアルバムへまとめて移動できます。
          </p>
        ) : (
          <>
            <div style={{ marginTop: 12 }}>
              {album.note ? (
                <div className="note">
                  <EditableText
                    value={album.note}
                    placeholder="この旅のメモ"
                    multiline
                    ariaLabel="アルバムのメモ"
                    onSave={(value) => void updateAlbum(album.id, { note: value })}
                  />
                </div>
              ) : (
                <EditableText
                  value=""
                  placeholder="＋ この旅について書き残す"
                  multiline
                  ariaLabel="アルバムのメモ"
                  onSave={(value) => void updateAlbum(album.id, { note: value })}
                />
              )}
            </div>
            <div style={{ marginTop: 14 }}>
              {confirmingDelete ? (
                <div className="danger-panel">
                  <p className="danger-panel__title">「{title}」を削除します</p>
                  <div className="danger-panel__actions">
                    <button type="button" className="btn" onClick={() => void handleDelete(false)}>
                      アルバムだけ削除（写真は未整理へ）
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger"
                      onClick={() => void handleDelete(true)}
                    >
                      写真 {view.photoIds.length} 枚ごと削除
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => setConfirmingDelete(false)}
                    >
                      やめる
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => setConfirmingDelete(true)}
                >
                  このアルバムを削除
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {view.photoIds.length === 0 ? (
        <div className="empty">
          <div className="empty__emoji">📷</div>
          この旅の写真をまだ入れていません。
          <br />
          <span className="faint">下から写真を追加すると、地図と時系列で振り返れます。</span>
        </div>
      ) : (
        <>
          <MapView
            spots={view.spots}
            photoById={photoById}
            titleOf={spotTitle}
            activeSpotId={active?.id ?? null}
            activeSource={active?.source ?? null}
            onSelectSpot={(id) => setActive({ id, source: 'map' })}
          />
          {located > 0 && (
            <p className="faint" style={{ marginTop: 8 }}>
              番号は立ち寄った順です。ピンを押すと下の時系列がその場所に移動します。
            </p>
          )}

          <Timeline
            view={view}
            photoById={photoById}
            spotTitle={spotTitle}
            noteOf={(key) => spotNoteOf(key.replace(/^spot:/, ''))}
            onSaveTitle={(spot, value) => void saveSpotEdit(spot.id, { title: value })}
            onSaveNote={(spot, value) => void saveSpotEdit(spot.id, { note: value })}
            activeSpotId={active?.id ?? null}
            activeSource={active?.source ?? null}
            onActivateSpot={(id) => setActive({ id, source: 'timeline' })}
            onOpenPhoto={openPhoto}
            onMoveSpot={(spot) => setMoving(spot.photoIds)}
          />
        </>
      )}

      {!unsorted && (
        <div style={{ marginTop: 32 }}>
          <SharePanel album={album} />
        </div>
      )}

      <div style={{ margin: '28px 0 10px' }}>
        {!unsorted && <Uploader compact={view.photoIds.length > 0} albumId={album.id} />}
      </div>

      {moving && (
        <AlbumPicker
          albums={albumViews.filter((v) => v.album.id !== album.id)}
          count={moving.length}
          onPick={(target) => void handleMove(target)}
          onClose={() => setMoving(null)}
        />
      )}

      {lightboxIndex !== null && photos.length > 0 && (
        <Lightbox
          photos={photos}
          index={Math.min(lightboxIndex, photos.length - 1)}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDelete={(photoId) => void removePhoto(photoId)}
          onMove={(photoId) => {
            setLightboxIndex(null);
            setMoving([photoId]);
          }}
          caption={title}
        />
      )}
    </div>
  );
}
