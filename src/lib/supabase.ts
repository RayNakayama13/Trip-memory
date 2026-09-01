import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * 設定値から接続先を組み立てる。
 *
 * 貼り付けた URL には、末尾のスラッシュや前後の空白、`/rest/v1` のような
 * 余計なパスが混ざりやすい。そのまま使うと `//auth/v1/signup` のような
 * 二重スラッシュになり「Invalid path specified in request URL」で失敗するため、
 * ホスト部分だけを取り出して使う。
 */
function normalizeUrl(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed).origin;
  } catch {
    return undefined;
  }
}

/**
 * 共有機能の接続先。ビルド時に埋め込まれる。
 * 未設定でもアプリは動き、共有だけが使えない状態になる。
 */
const url = normalizeUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);
// キーも、貼り付けたときに紛れ込む改行や空白を落としておく
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || undefined;

export const sharingConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error('共有機能が設定されていません（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）');
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

/**
 * 匿名サインインで利用者 ID を得る。
 * 共有アルバムの参加者を見分けるためだけのもので、メールアドレスなどは要らない。
 * 同じブラウザなら同じ ID が使い回される。
 */
export async function ensureSignedIn(): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id) return data.session.user.id;

  const { data: created, error } = await supabase.auth.signInAnonymously();
  if (error || !created.user) {
    // 原因の切り分けができるよう、Supabase が返した理由もそのまま見せる
    // 接続先も添える。設定を貼り間違えたときに、ここを見れば分かる
    const reason = error?.message ? `（${error.message}）` : '';
    throw new Error(
      `共有用のサインインに失敗しました${reason}。接続先: ${url}。` +
        'Supabase の Authentication > Sign In / Providers で「Anonymous sign-ins」が' +
        '有効か、接続先が自分のプロジェクトの URL と一致しているか確認してください。',
    );
  }
  return created.user.id;
}

/** 招待リンクに載せる合言葉を作る。 */
export function makeInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
