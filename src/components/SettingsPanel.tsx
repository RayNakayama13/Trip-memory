import { useEffect, useState } from 'react';
import { useLibrary } from '../lib/store';
import { storageEstimate } from '../lib/db';
import { formatBytes } from '../lib/format';

/** まとめ方の調整と、保存データの管理。 */
export function SettingsPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const { settings, updateSettings, photos, removeAll } = useLibrary();
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    void storageEstimate().then(setUsage);
  }, [photos.length]);

  return (
    <div className="container">
      <div className="section-title">
        <h2>設定</h2>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          閉じる
        </button>
      </div>

      <div className="card settings">
        <div className="field">
          <span className="field__label">旅の区切り</span>
          <span className="field__hint">
            写真の間隔がこれ以上空いたら、別の旅として分けます。
          </span>
          <div className="field__row">
            <input
              type="range"
              min={6}
              max={96}
              step={6}
              value={settings.tripGapHours}
              onChange={(e) => void updateSettings({ tripGapHours: Number(e.target.value) })}
            />
            <span className="field__value">{settings.tripGapHours} 時間</span>
          </div>
        </div>

        <div className="field">
          <span className="field__label">立ち寄り先の区切り（時間）</span>
          <span className="field__hint">
            同じ場所でもこれ以上時間が空いたら、別の立ち寄り先として分けます。
          </span>
          <div className="field__row">
            <input
              type="range"
              min={15}
              max={240}
              step={15}
              value={settings.spotGapMinutes}
              onChange={(e) => void updateSettings({ spotGapMinutes: Number(e.target.value) })}
            />
            <span className="field__value">{settings.spotGapMinutes} 分</span>
          </div>
        </div>

        <div className="field">
          <span className="field__label">立ち寄り先の区切り（距離）</span>
          <span className="field__hint">
            これ以上移動したら、別の立ち寄り先として分けます。
          </span>
          <div className="field__row">
            <input
              type="range"
              min={100}
              max={3000}
              step={100}
              value={settings.spotRadiusMeters}
              onChange={(e) => void updateSettings({ spotRadiusMeters: Number(e.target.value) })}
            />
            <span className="field__value">{settings.spotRadiusMeters} m</span>
          </div>
        </div>

        <div className="field">
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.reverseGeocode}
              onChange={(e) => void updateSettings({ reverseGeocode: e.target.checked })}
            />
            <span className="field__label">地名を自動で取得する</span>
          </label>
          <span className="field__hint">
            OpenStreetMap（Nominatim）へ座標だけを送って地名を調べます。写真そのものは送信しません。
            オフにすると、場所は座標のまま表示されます。
          </span>
        </div>
      </div>

      <div className="section-title">
        <h2>保存データ</h2>
      </div>
      <div className="card settings">
        <div className="field">
          <span className="field__label">この端末に保存されている写真</span>
          <span className="field__hint">
            {photos.length} 枚
            {usage && ` ・ 使用量 ${formatBytes(usage.usage)}（上限の目安 ${formatBytes(usage.quota)}）`}
          </span>
        </div>
        <div>
          <button
            type="button"
            className="btn btn--danger"
            disabled={photos.length === 0}
            onClick={() => {
              if (window.confirm('保存された写真をすべて削除します。元に戻せません。よろしいですか？')) {
                void removeAll();
              }
            }}
          >
            写真をすべて削除
          </button>
        </div>
      </div>
    </div>
  );
}
