import { useEffect, useState } from 'react';
import { useLibrary } from '../lib/store';
import { storageEstimate } from '../lib/db';
import { formatBytes } from '../lib/format';
import { currentUserId, sharingConfigured } from '../lib/supabase';

/** まとめ方の調整と、保存データの管理。 */
export function SettingsPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const { settings, updateSettings, photos, removeAll } = useLibrary();
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    void storageEstimate().then(setUsage);
  }, [photos.length]);

  useEffect(() => {
    void currentUserId().then(setDeviceId);
  }, []);

  return (
    <div className="container">
      <div className="section-title">
        <h2>設定</h2>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          閉じる
        </button>
      </div>

      <p className="faint" style={{ marginTop: -6 }}>
        旅の区切りはアルバムで決まります。ここでは、アルバムの中を
        「立ち寄り先」に分ける細かさを調整できます。
      </p>

      <div className="card settings">
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
        <h2>共有</h2>
      </div>
      <div className="card settings">
        <label className="field">
          <span className="field__label">共有アルバムでの表示名</span>
          <span className="field__hint">
            他の人の共有アルバムを開いたときに、相手の一覧に出る名前です。空でも構いません。
          </span>
          <input
            className="input"
            value={settings.displayName}
            placeholder="なまえ"
            maxLength={40}
            onChange={(e) => void updateSettings({ displayName: e.target.value })}
          />
        </label>

        {sharingConfigured && (
          <div className="field">
            <span className="field__label">この端末の ID</span>
            <span className="field__hint">
              共有アルバムで、どの端末からの操作かを見分けるための番号です。
              アルバムを作った端末が持ち主になります。
              {deviceId
                ? ' この端末のデータを消すと ID も変わり、いま持っている共有アルバムを管理できなくなります。'
                : ' まだ共有機能を使っていないため、発行されていません。'}
            </span>
            <input
              className="input"
              readOnly
              value={deviceId ?? '（未発行）'}
              onFocus={(e) => e.target.select()}
            />
          </div>
        )}
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
