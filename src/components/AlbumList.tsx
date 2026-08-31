import type { AlbumView } from '../lib/types';
import { useLibrary, UNSORTED_ID } from '../lib/store';
import { dayCount, regionsOf } from '../lib/cluster';
import { formatRange } from '../lib/format';
import { photoUrl } from '../lib/media';
import { Uploader } from './Uploader';

interface Props {
  onOpenAlbum: (albumId: string) => void;
}

/** これまでの旅のアルバムが並ぶホーム画面。 */
export function AlbumList({ onOpenAlbum }: Props): JSX.Element {
  const { albumViews, photos, photoById, geocodingLeft, createAlbum } = useLibrary();

  const startNewAlbum = async (): Promise<void> => {
    const id = await createAlbum();
    onOpenAlbum(id);
  };

  if (photos.length === 0 && albumViews.length === 0) {
    return (
      <div className="container">
        <section className="hero">
          <h1 className="hero__title">旅の思い出を、写真から。</h1>
          <p className="hero__lead">
            写真をアップロードするだけ。撮影日時と位置情報を読み取って、
            「いつ・どこで・何をしていたか」を地図と時系列で並べ直します。
            旅ごとにアルバムが作られ、あとから名前を付けて見返せます。
          </p>
        </section>

        <Uploader />

        <div className="steps">
          <div className="step">
            <div className="step__num">STEP 1</div>
            <h3 className="step__title">写真をまとめて入れる</h3>
            <p className="faint">
              iPhone の HEIC もそのまま。写真はこの端末のブラウザ内にだけ保存され、
              どこにもアップロードされません。
            </p>
          </div>
          <div className="step">
            <div className="step__num">STEP 2</div>
            <h3 className="step__title">旅ごとにアルバムができる</h3>
            <p className="faint">
              撮影の間隔から旅の区切りを見つけて、アルバムに分けます。
              名前はあとから自由に変えられます。
            </p>
          </div>
          <div className="step">
            <div className="step__num">STEP 3</div>
            <h3 className="step__title">地図と時系列で振り返る</h3>
            <p className="faint">
              次の旅の写真を入れれば、また新しいアルバムが増えていきます。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="section-title">
        <h2>旅の記録</h2>
        <span className="faint">
          {albumViews.filter((v) => v.album.id !== UNSORTED_ID).length} 冊 ・ 写真 {photos.length} 枚
          {geocodingLeft > 0 && ` ・ 地名を取得中 (残り ${geocodingLeft})`}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={() => void startNewAlbum()}>
          ＋ 新しいアルバム
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

      <div className="section-title">
        <h2>写真を追加</h2>
        <span className="faint">撮影日から、近い旅のアルバムへ自動で振り分けます</span>
      </div>
      <Uploader compact />
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
          {!named && !unsorted && <span className="trip-card__auto">仮の名前</span>}
        </h3>
        <div className="trip-card__meta">
          {view.photoIds.length === 0
            ? 'まだ写真がありません'
            : formatRange(view.startAt, view.endAt)}
          {view.startAt > 0 && ` ・ ${days}日間`}
        </div>
        <div className="trip-card__chips">
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
