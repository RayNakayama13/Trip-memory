import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * 共有機能の接続先。ビルド時に埋め込まれる。
 * 未設定でもアプリは動き、共有だけが使えない状態になる。
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

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
    throw new Error(
      '共有用のサインインに失敗しました。Supabase の Authentication で匿名サインインが有効か確認してください。',
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
