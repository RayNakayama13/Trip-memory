import { useState } from 'react';
import type { Album } from '../lib/types';
import { useLibrary } from '../lib/store';
import { formatDateTime } from '../lib/format';
import { ShareMembers } from './ShareMembers';

/** アルバムを他の人と共有するための操作をまとめたパネル。 */
export function SharePanel({ album }: { album: Album }): JSX.Element {
  const { photos, sharingConfigured, syncing, shareAlbum, syncAlbum, stopSharing, inviteLink, viewLink } =
    useLibrary();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [copied, setCopied] = useState<'view' | 'invite' | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const shared = Boolean(album.remoteId);
  const progress = syncing?.albumId === album.id ? syncing.progress : null;

  // 送信が途中で止まっても気づけるよう、未送信の枚数をいつでも見えるようにする
  const inAlbum = photos.filter((p) => p.albumId === album.id);
  const pending = inAlbum.filter((p) => !p.uploaded).length;

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

  const copyLink = async (kind: 'view' | 'invite', link: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // クリップボードが使えない環境では、入力欄から手で選んでもらう
      setError('自動でコピーできませんでした。リンクを選んでコピーしてください。');
    }
  };

  if (!sharingConfigured) {
    return (
      <div className="share share--off">
        <span className="share__title">共有する</span>
        <p className="faint">
          共有機能はまだ設定されていません。README の「共有アルバム」の手順で Supabase を
          つなぐと、リンクを渡すだけで他の人にアルバムを見てもらえるようになります。
        </p>
      </div>
    );
  }

  return (
    <div className="share">
      <div className="share__head">
        <span className="share__title">共有する</span>
        {shared && (
          <span className="tag">共有中{album.shareRole === 'member' ? '（参加）' : ''}</span>
        )}
      </div>

      {shared ? (
        <>
          <p className="faint">
            リンクを渡した人だけがこのアルバムを開けます。
            {album.memberCount ? ` これまでに ${album.memberCount} 人が開きました。` : ''}
            {album.lastSyncedAt ? ` 最終更新 ${formatDateTime(album.lastSyncedAt)}。` : ''}
          </p>

          {pending > 0 ? (
            <div className="share__pending">
              <strong>未送信の写真が {pending} 枚あります</strong>
              <span className="faint">
                （送信済み {inAlbum.length - pending} 枚 / 全 {inAlbum.length} 枚）
                いま見てもらうと、送信済みのぶんだけが表示されます。
                「いま同期する」を押して、画面を開いたままお待ちください。
              </span>
            </div>
          ) : (
            <p className="faint">写真 {inAlbum.length} 枚すべて送信済みです。</p>
          )}

          <div className="share__group">
            <span className="share__label">見てもらうリンク</span>
            <p className="faint">
              渡した人はアルバムを見るだけで、写真の追加や書き換えはできません。
              相手にアプリや登録は要りません。
            </p>
            <div className="share__link">
              <input
                className="input"
                readOnly
                value={viewLink(album)}
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void copyLink('view', viewLink(album))}
              >
                {copied === 'view' ? 'コピーしました' : 'リンクをコピー'}
              </button>
            </div>
          </div>

          <ShareMembers album={album} />

          {showInvite ? (
            <div className="share__group">
              <span className="share__label">一緒に写真を足せるリンク</span>
              <p className="faint">
                渡した人もこのアルバムに写真を追加できます。渡す相手にご注意ください。
              </p>
              <div className="share__link">
                <input
                  className="input"
                  readOnly
                  value={inviteLink(album)}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => void copyLink('invite', inviteLink(album))}
                >
                  {copied === 'invite' ? 'コピーしました' : 'リンクをコピー'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn--ghost"
              style={{ justifySelf: 'start' }}
              onClick={() => setShowInvite(true)}
            >
              一緒に写真を足せるリンクも使う
            </button>
          )}

          <div className="share__actions">
            <button
              type="button"
              className="btn"
              disabled={busy || progress !== null}
              onClick={() => void run(async () => {
                const result = await syncAlbum(album.id);
                if (result.failed > 0) {
                  setError(
                    `${result.failed} 枚を送れませんでした（${result.failedReason ?? '理由不明'}）。` +
                      'もう一度「いま同期する」を押すと、送れなかったぶんだけ送り直します。',
                  );
                }
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

            {!confirmingStop && (
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

          {confirmingStop && (
            <div className="danger-panel">
              <p className="danger-panel__title">
                {album.shareRole === 'owner' ? '共有をやめますか？' : 'このアルバムから抜けますか？'}
              </p>
              <p className="faint" style={{ marginBottom: 10 }}>
                {album.shareRole === 'owner' ? (
                  <>
                    <strong>この端末の写真 {inAlbum.length} 枚は消えません。</strong>
                    サーバーに置いた写真とアルバムだけが消え、これまでに渡したリンクは
                    すべて開けなくなります。共有し直すこともできます。
                  </>
                ) : (
                  <>
                    <strong>この端末に取り込んだ写真は消えません。</strong>
                    このアルバムの更新が届かなくなり、一覧からも外れます。
                  </>
                )}
              </p>
              <div className="danger-panel__actions">
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={busy}
                  onClick={() => void run(async () => {
                    await stopSharing(album.id);
                    setConfirmingStop(false);
                    setMessage('共有をやめました。この端末の写真はそのまま残っています。');
                  })}
                >
                  {album.shareRole === 'owner'
                    ? '共有をやめる（端末の写真は残す）'
                    : 'このアルバムから抜ける'}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setConfirmingStop(false)}
                >
                  やめる
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="faint">
            共有すると、このアルバムの写真がサーバーに保存され、リンクを渡した人が
            見られるようになります（相手はアプリも登録も不要です）。共有していない
            アルバムは、これまでどおりこの端末から出ません。
          </p>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || progress !== null}
            onClick={() => void run(async () => {
              await shareAlbum(album.id);
              setMessage('共有を始めました。下のリンクを渡してください。');
            })}
          >
            {progress
              ? `写真を送信中 ${progress.done}/${progress.total}（画面を開いたままお待ちください）`
              : 'このアルバムを共有する'}
          </button>
        </>
      )}

      {message && <p className="share__message">{message}</p>}
      {error && <p className="share__error">{error}</p>}
    </div>
  );
}
