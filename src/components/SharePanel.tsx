import { useState } from 'react';
import type { Album } from '../lib/types';
import { useLibrary } from '../lib/store';
import { formatDateTime } from '../lib/format';

/** アルバムを他の人と共有するための操作をまとめたパネル。 */
export function SharePanel({ album }: { album: Album }): JSX.Element {
  const { sharingConfigured, syncing, shareAlbum, syncAlbum, stopSharing, inviteLink } = useLibrary();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [copied, setCopied] = useState(false);

  const shared = Boolean(album.remoteId);
  const link = shared ? inviteLink(album) : '';
  const progress = syncing?.albumId === album.id ? syncing.progress : null;

  const run = async (task: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : '処理に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードが使えない環境では、下の入力欄から手で選んでもらう
      setError('自動でコピーできませんでした。下のリンクを選んでコピーしてください。');
    }
  };

  if (!sharingConfigured) {
    return (
      <div className="share share--off">
        <span className="share__title">みんなで作る</span>
        <p className="faint">
          共有機能はまだ設定されていません。README の「共有アルバムを使えるようにする」の手順で
          Supabase をつなぐと、他の人も同じアルバムに写真を追加できるようになります。
        </p>
      </div>
    );
  }

  return (
    <div className="share">
      <div className="share__head">
        <span className="share__title">みんなで作る</span>
        {shared && (
          <span className="tag">
            共有中{album.shareRole === 'member' ? '（参加）' : ''}
          </span>
        )}
      </div>

      {shared ? (
        <>
          <p className="faint">
            このリンクを渡した人だけが、このアルバムを見て写真を追加できます。
            {album.memberCount ? ` 現在 ${album.memberCount} 人が参加中。` : ''}
            {album.lastSyncedAt ? ` 最終同期 ${formatDateTime(album.lastSyncedAt)}。` : ''}
          </p>

          <div className="share__link">
            <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn" onClick={() => void copyLink()}>
              {copied ? 'コピーしました' : 'リンクをコピー'}
            </button>
          </div>

          <div className="share__actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || progress !== null}
              onClick={() => void run(async () => {
                const result = await syncAlbum(album.id);
                setMessage(
                  `同期しました（送信 ${result.uploaded} 枚 / 受信 ${result.downloaded} 枚）`,
                );
              })}
            >
              {progress
                ? progress.phase === 'upload'
                  ? `送信中 ${progress.done}/${progress.total}`
                  : progress.phase === 'download'
                    ? `受信中 ${progress.done}/${progress.total}`
                    : '仕上げ中'
                : 'いま同期する'}
            </button>

            {confirmingStop ? (
              <>
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={busy}
                  onClick={() => void run(async () => {
                    await stopSharing(album.id);
                    setConfirmingStop(false);
                    setMessage('共有をやめました。写真はこの端末に残っています。');
                  })}
                >
                  {album.shareRole === 'owner'
                    ? 'サーバーから削除してやめる'
                    : 'このアルバムから抜ける'}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setConfirmingStop(false)}
                >
                  やめる
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => setConfirmingStop(true)}
              >
                共有をやめる
              </button>
            )}
          </div>

          {album.shareRole === 'owner' && confirmingStop && (
            <p className="faint">
              サーバー上のアルバムと写真が消え、参加している人からは見えなくなります。
              あなたの端末の写真は残ります。
            </p>
          )}
        </>
      ) : (
        <>
          <p className="faint">
            共有すると、このアルバムの写真がサーバーに保存され、リンクを知っている人が
            写真を追加できるようになります。共有していないアルバムは、これまでどおり
            この端末から出ません。
          </p>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || progress !== null}
            onClick={() => void run(async () => {
              const created = await shareAlbum(album.id);
              setMessage(`共有を開始しました。リンク：${created}`);
            })}
          >
            {progress ? `写真を送信中 ${progress.done}/${progress.total}` : 'このアルバムを共有する'}
          </button>
        </>
      )}

      {message && <p className="share__message">{message}</p>}
      {error && <p className="share__error">{error}</p>}
    </div>
  );
}
