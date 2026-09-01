import { useEffect, useRef, useState } from 'react';

interface Props {
  /** 何を開こうとしているか（見出しに使う） */
  action: string;
  onSubmit: (name: string) => void;
}

/**
 * 共有リンクを開いた人に名前を尋ねる画面。
 * 共有した側の一覧に「誰が開いたか」を出すために使う。任意で、空でも進める。
 */
export function NamePrompt({ action, onSubmit }: Props): JSX.Element {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="container">
      <div className="empty">
        <div className="empty__emoji">🧳</div>
        <h2>共有アルバムが届いています</h2>
        <p className="faint" style={{ maxWidth: 420, margin: '6px auto 0' }}>
          お名前を入れると、共有した相手の画面に「誰が開いたか」が表示されます。
          入れなくても{action}できます。
        </p>

        <div className="name-prompt">
          <input
            ref={inputRef}
            className="input"
            value={name}
            placeholder="お名前（任意）"
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit(name.trim());
            }}
          />
          <button type="button" className="btn btn--primary" onClick={() => onSubmit(name.trim())}>
            アルバムを{action}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => onSubmit('')}>
            名前を入れずに{action}
          </button>
        </div>
      </div>
    </div>
  );
}
