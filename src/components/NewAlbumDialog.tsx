import { useEffect, useRef, useState } from 'react';

interface Props {
  onCreate: (title: string) => void;
  onClose: () => void;
}

/** 新しい旅を作るときに、先に名前を決めてもらうダイアログ。 */
export function NewAlbumDialog({ onCreate, onClose }: Props): JSX.Element {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = (): void => {
    if (busy) return;
    setBusy(true);
    onCreate(title.trim());
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="新しい旅を作る">
      <div className="modal__panel">
        <div className="modal__head">
          <h3>新しい旅</h3>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="modal__body">
          <label className="field">
            <span className="field__label">旅の名前</span>
            <input
              ref={inputRef}
              className="input"
              value={title}
              placeholder="イタリア旅行"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') onClose();
              }}
            />
            <span className="field__hint">あとからいつでも変えられます。</span>
          </label>

          <button type="button" className="btn btn--primary" disabled={busy} onClick={submit}>
            作って写真を入れる
          </button>
        </div>
      </div>
    </div>
  );
}
