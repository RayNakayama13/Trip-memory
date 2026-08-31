import { useCallback, useRef, useState } from 'react';
import { useLibrary } from '../lib/store';

interface Props {
  compact?: boolean;
  /** 取り込んだ写真を入れるアルバム。省略すると撮影日から自動で振り分ける */
  albumId?: string;
}

/** 写真をドラッグ&ドロップ、またはファイル選択で取り込むためのゾーン。 */
export function Uploader({ compact = false, albumId }: Props): JSX.Element {
  const { addFiles, importing } = useLibrary();
  const [dragging, setDragging] = useState(false);
  const [lastFailed, setLastFailed] = useState<Array<{ fileName: string; reason: string }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setLastFailed([]);
      const result = await addFiles(Array.from(fileList), albumId);
      if (result) setLastFailed(result.failed);
    },
    [addFiles, albumId],
  );

  const busy = importing !== null;
  const percent = importing && importing.total > 0
    ? Math.round((importing.processed / importing.total) * 100)
    : 0;

  return (
    <div
      className={`dropzone ${dragging ? 'dropzone--active' : ''}`}
      style={compact ? { padding: '22px 18px' } : undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handleFiles(e.dataTransfer.files);
      }}
    >
      {busy && importing ? (
        <div className="import-status">
          <div className="import-status__line">
            <span>写真を読み込んでいます…</span>
            <span>
              {importing.processed} / {importing.total}
            </span>
          </div>
          <div className="progress">
            <div className="progress__bar" style={{ width: `${percent}%` }} />
          </div>
          <div className="import-status__line">
            <span className="faint">{importing.currentFileName}</span>
            <span className="faint">
              {importing.added} 枚追加
              {importing.skipped > 0 ? ` / ${importing.skipped} 枚は取り込み済み` : ''}
            </span>
          </div>
        </div>
      ) : (
        <>
          <h3 className="dropzone__title">
            {compact ? '写真を追加する' : '写真をここにドロップ'}
          </h3>
          <p className="dropzone__hint">
            {albumId
              ? 'JPEG・PNG・HEIC に対応。このアルバムに追加されます。'
              : 'JPEG・PNG・HEIC に対応。撮影日時と位置情報から、旅ごとに自動でまとめます。'}
          </p>
          <button type="button" className="btn btn--primary" onClick={() => inputRef.current?.click()}>
            写真を選ぶ
          </button>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        hidden
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {lastFailed.length > 0 && (
        <ul className="failed-list">
          <li>
            <strong>{lastFailed.length} 枚は読み込めませんでした</strong>
          </li>
          {lastFailed.slice(0, 5).map((f) => (
            <li key={f.fileName}>
              {f.fileName}：{f.reason}
            </li>
          ))}
          {lastFailed.length > 5 && <li>ほか {lastFailed.length - 5} 件</li>}
        </ul>
      )}
    </div>
  );
}
