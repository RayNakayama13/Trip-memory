import { useState } from 'react';
import type { AlbumView } from '../lib/types';
import { useLibrary, UNSORTED_ID } from '../lib/store';
import { dayCount, regionsOf } from '../lib/cluster';
import { formatRange } from '../lib/format';
import { photoUrl } from '../lib/media';
import { NewAlbumDialog } from './NewAlbumDialog';

interface Props {
  onOpenAlbum: (albumId: string) => void;
}

/** これまでの旅のアルバムが並ぶホーム画面。旅は利用者が作って名前を付ける。 */
export function AlbumList({ onOpenAlbum }: Props): JSX.Element {
  const { albumViews, photos, photoById, geocodingLeft, createAlbum } = useLibrary();
  const [creating, setCreating] = useState(false);

  const start = async (title: string): Promise<void> => {
    const id = await createAlbum(title);
    setCreating(false);
    onOpenAlbum(id);
  };

  const dialog = creating ? (
    <NewAlbumDialog onCreate={(title) => void start(title)} onClose={() => setCreating(false)} />
  ) : null;

  if (albumViews.length === 0) {
    return (
      <div className="container">
        <section className="hero">
          <h1 className="hero__title">旅の思い出を、写真から。</h1>
          <p className="hero__lead">
            旅ごとにアルバムを作って、写真を入れるだけ。撮影日時と位置情報を読み取って、
            「いつ・どこで・何をしていたか」を地図と時系列で並べ直します。
          </p>
          <div style={{ marginTop: 22 }}>
            <button type="button" className="btn btn--primary btn--lg" onClick={() => setCreating(true)}>
              ＋ 最初の旅を作る
            </button>
          </div>
        </section>

        <div className="steps">
          <div className="step">
            <div className="step__num">STEP 1</div>
            <h3 className="step__title">旅を作って名前を付ける</h3>
            <p className="faint">
              「イタリア旅行」「北海道旅行」のように、ひとつの旅にひとつのアルバムを作ります。
            </p>
          </div>
          <div className="step">
            <div className="step__num">STEP 2</div>
            <h3 className="step__title">その旅の写真を入れる</h3>
            <p className="faint">
              入れた写真がその旅の記録になります。iPhone の HEIC もそのまま。
              写真はこの端末のブラウザ内に保存され、共有しない限りどこにも送られません。
            </p>
          </div>
          <div className="step">
            <div className="step__num">STEP 3</div>
            <h3 className="step__title">地図と時系列で振り返る</h3>
            <p className="faint">
              アルバムの中で、日ごと・立ち寄り先ごとに自動で並びます。
              次の旅はまた新しいアルバムを作ってください。
            </p>
          </div>
        </div>
        {dialog}
      </div>
    );
  }

  return (
    <div className="container">
      <div className="section-title">
        <h2>旅の記録</h2>
        <span className="faint">
          {albumViews.filter((v) => v.album.id !== UNSORTED_ID).length} 件 ・ 写真 {photos.length} 枚
          {geocodingLeft > 0 && ` ・ 地名を取得中 (残り ${geocodingLeft})`}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
          ＋ 新しい旅
        </button>
      </div>

      <div className="trip-grid">
        {albumViews.map((view) => (
          <AlbumCard
            key={view.album.id}
            view={view}
            coverUrl={(() => {
              if (!view.coverPhotoId) return null;
              const photo = photoById.get(view.coverPhotoId);
              return photo ? photoUrl(photo, 'thumb') : null;
            })()}
            onOpen={() => onOpenAlbum(view.album.id)}
          />
        ))}
      </div>
      {dialog}
    </div>
  );
}

interface CardProps {
  view: AlbumView;
  coverUrl: string | null;
  onOpen: () => void;
}

function AlbumCard({ view, coverUrl, onOpen }: CardProps): JSX.Element {
  const regions = regionsOf(view).slice(0, 3);
  const days = dayCount(view);
  const unsorted = view.album.id === UNSORTED_ID;
  const named = view.album.title.trim().length > 0;

  return (
    <button type="button" className="trip-card" onClick={onOpen}>
      <div className={`trip-card__cover ${coverUrl ? '' : 'trip-card__cover--empty'}`}>
        {coverUrl ? <img src={coverUrl} alt="" loading="lazy" /> : '📷'}
      </div>
      <div className="trip-card__body">
        <h3 className="trip-card__title">
          {view.album.title || view.suggestedTitle}
          {!named && !unsorted && view.photoIds.length > 0 && (
            <span className="trip-card__auto">仮の名前</span>
          )}
        </h3>
        <div className="trip-card__meta">
          {view.photoIds.length === 0
            ? '写真を入れて記録を始めましょう'
            : formatRange(view.startAt, view.endAt)}
          {view.startAt > 0 && ` ・ ${days}日間`}
        </div>
        <div className="trip-card__chips">
          {view.album.remoteId && (
            <span className="tag">
              共有中{view.album.memberCount ? ` ${view.album.memberCount}人` : ''}
            </span>
          )}
          <span className="tag tag--quiet">写真 {view.photoIds.length} 枚</span>
          {view.spots.length > 0 && (
            <span className="tag tag--quiet">立ち寄り {view.spots.length} か所</span>
          )}
          {regions.map((region) => (
            <span className="tag" key={region}>
              {region}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}
