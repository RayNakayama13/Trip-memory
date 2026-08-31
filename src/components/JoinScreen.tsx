import { useEffect, useRef, useState } from 'react';
import { useLibrary } from '../lib/store';

interface Props {
  token: string;
  onJoined: (albumId: string) => void;
  onCancel: () => void;
}

/** 招待リンクを開いたときの画面。参加すると共有アルバムが手元に増える。 */
export function JoinScreen({ token, onJoined, onCancel }: Props): JSX.Element {
  const { sharingConfigured, joinAlbum, syncing } = useLibrary();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const join = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      onJoined(await joinAlbum(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : '参加できませんでした');
    } finally {
      setBusy(false);
    }
  };

  // リンクを開いたらそのまま参加まで進める（待たせない）
  useEffect(() => {
    if (started.current || !sharingConfigured) return;
    started.current = true;
    void join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharingConfigured]);

  return (
    <div className="container">
      <div className="empty">
        <div className="empty__emoji">🧳</div>
        {!sharingConfigured ? (
          <>
            <h2>共有機能が設定されていません</h2>
            <p className="faint">
              このアプリでは共有アルバムを開けません。リンクをくれた方に確認してください。
            </p>
          </>
        ) : error ? (
          <>
            <h2>参加できませんでした</h2>
            <p className="faint">{error}</p>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void join()}>
                もう一度試す
              </button>
              <button type="button" className="btn btn--ghost" onClick={onCancel}>
                旅の一覧へ
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>共有アルバムに参加しています…</h2>
            <p className="faint">
              {syncing
                ? syncing.progress.phase === 'download'
                  ? `写真を受け取っています ${syncing.progress.done}/${syncing.progress.total}`
                  : '準備しています'
                : '少しお待ちください'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
