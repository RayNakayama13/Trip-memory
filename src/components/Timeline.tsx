import { useEffect, useRef } from 'react';
import type { Photo, Spot, Trip } from '../lib/types';
import { dayKey, formatDate, formatDuration, formatTime } from '../lib/format';
import { photoUrl } from '../lib/media';
import { EditableText } from './EditableText';

interface Props {
  trip: Trip;
  photoById: Map<string, Photo>;
  spotTitle: (spot: Spot, index: number) => string;
  noteOf: (key: string) => string;
  onSaveTitle: (spot: Spot, title: string) => void;
  onSaveNote: (spot: Spot, note: string) => void;
  activeSpotId: string | null;
  /** どこから選ばれたか。地図から選ばれたときだけ時系列側をスクロールする。 */
  activeSource: 'map' | 'timeline' | null;
  onActivateSpot: (spotId: string) => void;
  onOpenPhoto: (photoId: string) => void;
}

/** 旅の写真を「日 → 立ち寄りスポット」の順に並べた時系列ビュー。 */
export function Timeline(props: Props): JSX.Element {
  const { trip } = props;

  // 同じ日のスポットをまとめる（撮影日時が無いものは末尾の「日付不明」に入る）
  const days = new Map<string, Spot[]>();
  for (const spot of trip.spots) {
    const key = spot.startAt ? dayKey(spot.startAt) : 'unknown';
    const list = days.get(key);
    if (list) list.push(spot);
    else days.set(key, [spot]);
  }

  let dayNumber = 0;
  return (
    <div>
      {[...days.entries()].map(([key, spots]) => {
        const dated = key !== 'unknown';
        if (dated) dayNumber += 1;
        return (
          <section className="day" key={key}>
            <div className="day__head">
              {dated && <span className="tag">{dayNumber}日目</span>}
              <span className="day__label">
                {dated ? formatDate(spots[0].startAt) : '撮影日時のわからない写真'}
              </span>
              <span className="faint">
                {spots.reduce((sum, s) => sum + s.photoIds.length, 0)} 枚
              </span>
            </div>
            <div className="timeline">
              {spots.map((spot) => (
                <SpotSection key={spot.id} spot={spot} {...props} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SpotSection({
  spot,
  trip,
  photoById,
  spotTitle,
  noteOf,
  onSaveTitle,
  onSaveNote,
  activeSpotId,
  activeSource,
  onActivateSpot,
  onOpenPhoto,
}: Props & { spot: Spot }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const index = trip.spots.indexOf(spot);
  const active = activeSpotId === spot.id;

  // 地図のピンから選ばれたときだけ、その場所までスクロールする
  useEffect(() => {
    if (active && activeSource === 'map') {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [active, activeSource]);

  const duration = spot.startAt ? formatDuration(spot.startAt, spot.endAt) : null;
  const area = [spot.place?.city, spot.place?.state].filter(Boolean).join('・');
  const note = noteOf(`spot:${spot.id}`);
  const photos = spot.photoIds
    .map((id) => photoById.get(id))
    .filter((p): p is Photo => p !== undefined);

  return (
    <div ref={ref} className={`spot ${active ? 'spot--active' : ''}`}>
      <div className="spot__head">
        <span className="spot__time">{spot.startAt ? formatTime(spot.startAt) : '--:--'}</span>
        <button
          type="button"
          className="tag tag--quiet"
          style={{ border: 'none' }}
          onClick={() => onActivateSpot(spot.id)}
          title="地図で位置を見る"
          disabled={spot.lat === null}
        >
          📍 {index + 1}
        </button>
        <span className="spot__title">
          <EditableText
            value={spotTitle(spot, index)}
            placeholder="場所の名前"
            ariaLabel="スポット名"
            onSave={(value) => onSaveTitle(spot, value)}
          />
        </span>
        <span className="tag">{spot.activity}</span>
      </div>

      <div className="spot__meta">
        {area && <span>{area}</span>}
        {duration && <span>滞在 {duration}</span>}
        <span>{spot.photoIds.length} 枚</span>
        {spot.lat !== null && spot.lon !== null && (
          <a
            href={`https://www.openstreetmap.org/?mlat=${spot.lat}&mlon=${spot.lon}#map=17/${spot.lat}/${spot.lon}`}
            target="_blank"
            rel="noreferrer"
          >
            地図で開く
          </a>
        )}
      </div>

      <div className="photo-grid">
        {photos.map((photo) => (
          <button
            key={photo.id}
            type="button"
            className="photo-grid__item"
            onClick={() => onOpenPhoto(photo.id)}
            title={photo.takenAt !== null ? formatTime(photo.takenAt) : photo.fileName}
          >
            <img src={photoUrl(photo, 'thumb')} alt={photo.fileName} loading="lazy" />
          </button>
        ))}
      </div>

      <div style={{ marginTop: 10 }}>
        {note ? (
          <div className="note">
            <EditableText
              value={note}
              placeholder="メモを書く"
              multiline
              ariaLabel="スポットのメモ"
              onSave={(value) => onSaveNote(spot, value)}
            />
          </div>
        ) : (
          <EditableText
            value=""
            placeholder="＋ ここでの思い出をメモする"
            multiline
            ariaLabel="スポットのメモ"
            onSave={(value) => onSaveNote(spot, value)}
          />
        )}
      </div>
    </div>
  );
}
