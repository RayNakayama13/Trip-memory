import type { Trip } from '../lib/types';
import { useLibrary } from '../lib/store';
import { dayCount, regionsOf } from '../lib/cluster';
import { formatRange } from '../lib/format';
import { photoUrl } from '../lib/media';
import { Uploader } from './Uploader';

/** 取り込んだ写真から作られた旅の一覧。 */
export function TripList({ onOpenTrip }: { onOpenTrip: (tripId: string) => void }): JSX.Element {
  const { trips, photos, photoById, titleOf, geocodingLeft } = useLibrary();

  if (photos.length === 0) {
    return (
      <div className="container">
        <section className="hero">
          <h1 className="hero__title">旅の思い出を、写真から。</h1>
          <p className="hero__lead">
            写真をアップロードするだけ。撮影日時と位置情報を読み取って、
            「いつ・どこで・何をしていたか」を地図と時系列で並べ直します。
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
            <h3 className="step__title">旅ごとに自動でまとまる</h3>
            <p className="faint">
              撮影の間隔と移動距離から、旅・日・立ち寄り先を推定して並べます。
            </p>
          </div>
          <div className="step">
            <div className="step__num">STEP 3</div>
            <h3 className="step__title">地図と時系列で振り返る</h3>
            <p className="faint">
              訪れた場所の名前も自動で付きます。タイトルやメモは自由に書き換えられます。
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
          {trips.length} 件 ・ 写真 {photos.length} 枚
          {geocodingLeft > 0 && ` ・ 地名を取得中 (残り ${geocodingLeft})`}
        </span>
      </div>

      <div className="trip-grid">
        {trips.map((trip) => (
          <TripCard
            key={trip.id}
            trip={trip}
            title={titleOf(`trip:${trip.id}`, trip.autoTitle)}
            coverUrl={
              trip.coverPhotoId
                ? (() => {
                    const photo = photoById.get(trip.coverPhotoId);
                    return photo ? photoUrl(photo, 'thumb') : null;
                  })()
                : null
            }
            onOpen={() => onOpenTrip(trip.id)}
          />
        ))}
      </div>

      <div className="section-title">
        <h2>写真を追加</h2>
      </div>
      <Uploader compact />
    </div>
  );
}

interface CardProps {
  trip: Trip;
  title: string;
  coverUrl: string | null;
  onOpen: () => void;
}

function TripCard({ trip, title, coverUrl, onOpen }: CardProps): JSX.Element {
  const regions = regionsOf(trip).slice(0, 3);
  const days = dayCount(trip);

  return (
    <button type="button" className="trip-card" onClick={onOpen}>
      <div className={`trip-card__cover ${coverUrl ? '' : 'trip-card__cover--empty'}`}>
        {coverUrl ? <img src={coverUrl} alt="" loading="lazy" /> : '📷'}
      </div>
      <div className="trip-card__body">
        <h3 className="trip-card__title">{title}</h3>
        <div className="trip-card__meta">
          {formatRange(trip.startAt, trip.endAt)}
          {trip.startAt > 0 && ` ・ ${days}日間`}
        </div>
        <div className="trip-card__chips">
          <span className="tag tag--quiet">写真 {trip.photoIds.length} 枚</span>
          <span className="tag tag--quiet">立ち寄り {trip.spots.length} か所</span>
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
