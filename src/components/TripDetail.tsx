import { useCallback, useMemo, useState } from 'react';
import type { Photo, Spot, Trip } from '../lib/types';
import { useLibrary } from '../lib/store';
import { dayCount, regionsOf } from '../lib/cluster';
import { formatRange } from '../lib/format';
import { EditableText } from './EditableText';
import { MapView } from './MapView';
import { Timeline } from './Timeline';
import { Lightbox } from './Lightbox';
import { Uploader } from './Uploader';

interface Props {
  trip: Trip;
  onBack: () => void;
}

/** ひとつの旅を、地図と時系列で振り返る画面。 */
export function TripDetail({ trip, onBack }: Props): JSX.Element {
  const { photoById, titleOf, noteOf, saveEdit, removePhoto } = useLibrary();
  const [active, setActive] = useState<{ id: string; source: 'map' | 'timeline' } | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const tripKey = `trip:${trip.id}`;
  const title = titleOf(tripKey, trip.autoTitle);
  const note = noteOf(tripKey);
  const regions = regionsOf(trip);

  const photos = useMemo(
    () => trip.photoIds.map((id) => photoById.get(id)).filter((p): p is Photo => p !== undefined),
    [trip.photoIds, photoById],
  );

  const spotTitle = useCallback(
    (spot: Spot, index: number) =>
      titleOf(`spot:${spot.id}`, spot.place?.name ?? `${index + 1} 番目の立ち寄り先`),
    [titleOf],
  );

  const openPhoto = useCallback(
    (photoId: string) => {
      const index = photos.findIndex((p) => p.id === photoId);
      if (index >= 0) setLightboxIndex(index);
    },
    [photos],
  );

  const located = trip.spots.filter((s) => s.lat !== null).length;

  return (
    <div className="container">
      <div className="detail-head">
        <button type="button" className="btn btn--ghost" onClick={onBack} style={{ marginBottom: 10 }}>
          ← 旅の一覧
        </button>
        <h1 className="detail-head__title">
          <EditableText
            value={title}
            placeholder="旅のタイトル"
            ariaLabel="旅のタイトル"
            onSave={(value) => void saveEdit(tripKey, { title: value })}
          />
        </h1>
        <div className="detail-head__meta">
          <span>{formatRange(trip.startAt, trip.endAt)}</span>
          {trip.startAt > 0 && <span>{dayCount(trip)}日間</span>}
          <span>写真 {trip.photoIds.length} 枚</span>
          <span>立ち寄り {trip.spots.length} か所</span>
          {regions.length > 0 && <span>{regions.slice(0, 4).join('・')}</span>}
        </div>
        <div style={{ marginTop: 12 }}>
          {note ? (
            <div className="note">
              <EditableText
                value={note}
                placeholder="この旅のメモ"
                multiline
                ariaLabel="旅のメモ"
                onSave={(value) => void saveEdit(tripKey, { note: value })}
              />
            </div>
          ) : (
            <EditableText
              value=""
              placeholder="＋ この旅について書き残す"
              multiline
              ariaLabel="旅のメモ"
              onSave={(value) => void saveEdit(tripKey, { note: value })}
            />
          )}
        </div>
      </div>

      <MapView
        spots={trip.spots}
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
        trip={trip}
        photoById={photoById}
        spotTitle={spotTitle}
        noteOf={noteOf}
        onSaveTitle={(spot, value) => void saveEdit(`spot:${spot.id}`, { title: value })}
        onSaveNote={(spot, value) => void saveEdit(`spot:${spot.id}`, { note: value })}
        activeSpotId={active?.id ?? null}
        activeSource={active?.source ?? null}
        onActivateSpot={(id) => setActive({ id, source: 'timeline' })}
        onOpenPhoto={openPhoto}
      />

      <div style={{ margin: '36px 0 10px' }}>
        <Uploader compact />
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          index={Math.min(lightboxIndex, photos.length - 1)}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDelete={(photoId) => void removePhoto(photoId)}
          caption={title}
        />
      )}
    </div>
  );
}
