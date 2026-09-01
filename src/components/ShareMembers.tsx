import { useCallback, useEffect, useState } from 'react';
import type { Album } from '../lib/types';
import type { ShareMember } from '../lib/sharing';
import { useLibrary } from '../lib/store';
import { formatShortDate } from '../lib/format';

const ROLE_LABEL: Record<ShareMember['role'], string> = {
  owner: '作成者',
  editor: '写真を追加できる',
  viewer: '見るだけ',
};

/** 誰に共有しているかの一覧と、相手ごとの停止／再開。 */
export function ShareMembers({ album }: { album: Album }): JSX.Element | null {
  const { listMembers, setMemberRevoked } = useLibrary();
  const [members, setMembers] = useState<ShareMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyUser, setBusyUser] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setMembers(await listMembers(album.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : '取得できませんでした');
    }
  }, [album.id, listMembers]);

  useEffect(() => {
    void load();
  }, [load]);

  // 相手を管理できるのは持ち主だけ
  if (album.shareRole !== 'owner') return null;

  const toggle = async (member: ShareMember): Promise<void> => {
    setBusyUser(member.userId);
    setError(null);
    try {
      await setMemberRevoked(album.id, member.userId, !member.revoked);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '変更できませんでした');
    } finally {
      setBusyUser(null);
    }
  };

  const others = (members ?? []).filter((m) => m.role !== 'owner');

  return (
    <div className="share__group">
      <span className="share__label">このアルバムを開いた人</span>

      {members === null ? (
        <p className="faint">読み込んでいます…</p>
      ) : others.length === 0 ? (
        <p className="faint">
          まだ誰も開いていません。リンクを渡すと、開いた人がここに並びます。
        </p>
      ) : (
        <ul className="members">
          {others.map((member) => (
            <li key={member.userId} className={`member ${member.revoked ? 'member--revoked' : ''}`}>
              <div className="member__body">
                <span className="member__name">
                  {member.displayName || '名前なしの人'}
                  {member.isMe && '（自分）'}
                </span>
                <span className="member__meta">
                  {ROLE_LABEL[member.role]} ・ {formatShortDate(member.joinedAt)}から
                  {member.revoked && ' ・ 停止中'}
                </span>
              </div>
              <button
                type="button"
                className={`btn ${member.revoked ? '' : 'btn--danger'}`}
                disabled={busyUser === member.userId}
                onClick={() => void toggle(member)}
              >
                {member.revoked ? '再開' : '共有を止める'}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="faint">
        止めるとその人はアルバムを開けなくなり、リンクを開き直しても戻れません。
        名前は、相手がリンクを開いたときに入力したものです。
      </p>
      {error && <p className="share__error">{error}</p>}
    </div>
  );
}
