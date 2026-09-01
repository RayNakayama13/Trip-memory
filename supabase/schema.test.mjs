/**
 * schema.sql のアクセス制御（RLS）を、実際の Postgres で検証するテスト。
 *
 *   node supabase/schema.test.mjs
 *
 * Supabase 本体は使わず、PGlite（Postgres の WebAssembly 版）に
 * auth / storage スキーマの必要最小限を用意して schema.sql を流し込む。
 * 「他人のアルバムが見えない」「招待リンクなしでは入れない」といった
 * 壊れると危ない部分を、思い込みではなく実際の挙動で確かめるのが目的。
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(path.join(here, 'schema.sql'), 'utf8');

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';
const USER_C = '33333333-3333-3333-3333-333333333333';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

process.on('uncaughtException', (error) => {
  console.error(`\n想定外のエラー: ${error.message}`);
  process.exit(1);
});

const db = await new PGlite();

/** Supabase 側で用意されている部分のうち、ポリシーが依存するものだけを再現する。 */
await db.exec(`
  create schema if not exists auth;
  create schema if not exists storage;

  create table auth.users (id uuid primary key);
  insert into auth.users (id) values ('${USER_A}'), ('${USER_B}'), ('${USER_C}');

  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::json->>'sub', '')::uuid
  $$;

  create table storage.buckets (id text primary key, name text, public boolean default false);
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null
  );
  create or replace function storage.foldername(name text) returns text[] language plpgsql as $$
  declare parts text[];
  begin
    select string_to_array(name, '/') into parts;
    return parts[1:array_length(parts, 1) - 1];
  end $$;

  alter table storage.objects enable row level security;

  create role anon nologin;
  create role authenticated nologin;
`);

await db.exec(schema);

// Supabase が既定で行っている、ロールへの権限付与を再現する
await db.exec(`
  grant usage on schema public, auth, storage to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  grant select on storage.buckets to anon, authenticated;
  grant execute on all functions in schema public, auth, storage to anon, authenticated;
`);

/** 指定した利用者としてクエリを実行する。 */
async function as(userId, sql, params = []) {
  await db.exec('reset role;');
  await db.query('select set_config($1, $2, false)', [
    'request.jwt.claims',
    userId ? JSON.stringify({ sub: userId, role: 'authenticated' }) : '',
  ]);
  await db.exec(`set role ${userId ? 'authenticated' : 'anon'};`);
  return db.query(sql, params);
}

async function denied(userId, sql, params = []) {
  try {
    await as(userId, sql, params);
    return false;
  } catch {
    return true;
  }
}

console.log('\n■ アルバムの作成と参加');

await as(USER_A, `insert into shared_albums (title, owner_id, invite_token, view_token) values ('京都旅行', $1, 'token-kyoto', 'token-view')`, [USER_A]);
const albumRow = await as(USER_A, `select id from shared_albums where invite_token = 'token-kyoto'`);
const albumId = albumRow.rows[0]?.id;
check('作った本人はアルバムを読める', albumRow.rows.length === 1);

// アプリは insert ... returning id で作るため、登録と同時に閲覧の許可も評価される。
// 参加者の登録は作成直後に走るので、持ち主を条件に入れておかないとここで弾かれる。
check('作成と同時に ID を受け取れる（insert ... returning）', await (async () => {
  try {
    const created = await as(
      USER_A,
      `insert into shared_albums (title, owner_id, invite_token, view_token)
       values ('returning の確認', $1, 'token-returning', 'view-returning') returning id`,
      [USER_A],
    );
    const newId = created.rows[0]?.id;
    if (newId) await as(USER_A, `delete from shared_albums where id = $1`, [newId]);
    return Boolean(newId);
  } catch {
    return false;
  }
})());

const membersOfA = await as(USER_A, `select user_id, role from album_members`);
check('作った本人が自動で参加者になる', membersOfA.rows.length === 1 && membersOfA.rows[0].user_id === USER_A);
check('作った本人の立場は owner', membersOfA.rows[0]?.role === 'owner');

const pathA = `${albumId}/photo-a.jpg`;
const pathB = `${albumId}/photo-b.jpg`;
await as(USER_A, `insert into shared_photos (id, album_id, uploader_id, storage_path) values ('photo-a', $1, $2, $3)`, [albumId, USER_A, pathA]);
await as(USER_A, `insert into storage.objects (bucket_id, name) values ('trip-photos', $1)`, [pathA]);
check('作った本人は写真を追加できる', (await as(USER_A, `select id from shared_photos`)).rows.length === 1);

console.log('\n■ 招待されていない人からは見えない');

check('他人のアルバムは一覧に出ない', (await as(USER_B, `select id from shared_albums`)).rows.length === 0);
check('ID を知っていても読めない', (await as(USER_B, `select id from shared_albums where id = $1`, [albumId])).rows.length === 0);
check('他人の写真は読めない', (await as(USER_B, `select id from shared_photos`)).rows.length === 0);
check('他人の参加者一覧は読めない', (await as(USER_B, `select user_id from album_members`)).rows.length === 0);
check('他人のアルバムに写真を入れられない',
  await denied(USER_B, `insert into shared_photos (id, album_id, uploader_id, storage_path) values ('x', $1, $2, 'x')`, [albumId, USER_B]));
check('参加者テーブルに直接自分を入れられない',
  await denied(USER_B, `insert into album_members (album_id, user_id) values ($1, $2)`, [albumId, USER_B]));
check('他人のアルバムの写真ファイルは読めない',
  (await as(USER_B, `select name from storage.objects`)).rows.length === 0);
check('他人のアルバムにファイルを置けない',
  await denied(USER_B, `insert into storage.objects (bucket_id, name) values ('trip-photos', $1)`, [`${albumId}/evil.jpg`]));
check('ログインしていない人には何も見えない', (await as(null, `select id from shared_albums`)).rows.length === 0);

console.log('\n■ 招待リンクでの参加');

check('間違った合言葉では参加できない', await denied(USER_B, `select join_album('wrong-token')`));
check('参加できていないままである', (await as(USER_B, `select id from shared_albums`)).rows.length === 0);

await as(USER_B, `select join_album('token-kyoto', 'ゆうこ')`);
check('正しい合言葉で参加できる', (await as(USER_B, `select id from shared_albums`)).rows.length === 1);
check('参加後は写真が見える', (await as(USER_B, `select id from shared_photos`)).rows.length === 1);
check('参加後は写真ファイルも読める', (await as(USER_B, `select name from storage.objects`)).rows.length === 1);

await as(USER_B, `insert into shared_photos (id, album_id, uploader_id, storage_path) values ('photo-b', $1, $2, $3)`, [albumId, USER_B, pathB]);
await as(USER_B, `insert into storage.objects (bucket_id, name) values ('trip-photos', $1)`, [pathB]);
check('参加者は自分の写真を追加できる', (await as(USER_B, `select id from shared_photos`)).rows.length === 2);
check('他人になりすまして写真を追加できない',
  await denied(USER_B, `insert into shared_photos (id, album_id, uploader_id, storage_path) values ('fake', $1, $2, 'f')`, [albumId, USER_A]));

console.log('\n■ 見るだけのリンク');

check('見るだけの合言葉では、写真を足せるリンクとして参加できない',
  await denied(USER_C, `select join_album('token-view')`));
check('写真を足せる合言葉では、見るだけとして参加できない',
  await denied(USER_C, `select view_album('token-kyoto')`));

await as(USER_C, `select view_album('token-view')`);
check('見るだけのリンクで参加できる', (await as(USER_C, `select id from shared_albums`)).rows.length === 1);
check('立場は viewer になる',
  (await as(USER_C, `select role from album_members where user_id = $1`, [USER_C])).rows[0]?.role === 'viewer');
check('見るだけの人も写真を見られる', (await as(USER_C, `select id from shared_photos`)).rows.length === 2);
check('見るだけの人も写真ファイルを読める', (await as(USER_C, `select name from storage.objects`)).rows.length === 2);

check('見るだけの人は写真を追加できない',
  await denied(USER_C, `insert into shared_photos (id, album_id, uploader_id, storage_path) values ('c1', $1, $2, $3)`,
    [albumId, USER_C, `${albumId}/c1.jpg`]));
check('見るだけの人は写真ファイルを置けない',
  await denied(USER_C, `insert into storage.objects (bucket_id, name) values ('trip-photos', $1)`, [`${albumId}/c1.jpg`]));

await as(USER_C, `update shared_albums set title = '乗っ取り' where id = $1`, [albumId]);
check('見るだけの人はアルバム名を書き換えられない',
  (await as(USER_A, `select title from shared_albums where id = $1`, [albumId])).rows[0].title !== '乗っ取り');

await as(USER_C, `delete from shared_photos where album_id = $1`, [albumId]);
check('見るだけの人は写真を消せない', (await as(USER_A, `select id from shared_photos`)).rows.length === 2);

await as(USER_C, `select view_album('token-view')`);
check('もう一度リンクを踏んでも立場は変わらない',
  (await as(USER_C, `select role from album_members where user_id = $1`, [USER_C])).rows[0]?.role === 'viewer');

// 以降のテストのために、いったん抜けてもらう
await as(USER_C, `delete from album_members where user_id = $1`, [USER_C]);

console.log('\n■ 共同編集と削除の範囲');

await as(USER_B, `update shared_albums set title = '京都ふたり旅' where id = $1`, [albumId]);
check('参加者はアルバム名を直せる（共同編集）',
  (await as(USER_A, `select title from shared_albums where id = $1`, [albumId])).rows[0].title === '京都ふたり旅');

await as(USER_B, `delete from shared_photos where id = 'photo-a' and album_id = $1`, [albumId]);
check('参加者は他人が上げた写真を消せない', (await as(USER_A, `select id from shared_photos`)).rows.length === 2);

await as(USER_B, `delete from shared_photos where id = 'photo-b' and album_id = $1`, [albumId]);
check('参加者は自分が上げた写真を消せる', (await as(USER_A, `select id from shared_photos`)).rows.length === 1);

await as(USER_B, `delete from shared_albums where id = $1`, [albumId]);
check('参加者はアルバムごと消せない', (await as(USER_A, `select id from shared_albums`)).rows.length === 1);

console.log('\n■ 送信のやり直し（上書き）');

check('参加者は自分のアルバムの写真ファイルを上書きできる', await (async () => {
  try {
    await as(USER_A, `update storage.objects set name = $1 where name = $1`, [pathA]);
    return true;
  } catch {
    return false;
  }
})());
check('参加していない人は上書きできない', await (async () => {
  await as(USER_B, `delete from album_members where user_id = $1`, [USER_B]);
  const denied = await (async () => {
    const before = await as(USER_A, `select name from storage.objects where name = $1`, [pathA]);
    await as(USER_B, `update storage.objects set name = 'hacked' where name = $1`, [pathA]);
    const after = await as(USER_A, `select name from storage.objects where name = $1`, [pathA]);
    return before.rows.length === after.rows.length;
  })();
  await as(USER_B, `select join_album('token-kyoto', 'ゆうこ')`);
  return denied;
})());

console.log('\n■ サムネイルの扱い');

check('見るだけの人は写真の情報を書き換えられない', await (async () => {
  await as(USER_C, `select view_album('token-view')`);
  await as(USER_C, `update shared_photos set file_name = 'x' where album_id = $1`, [albumId]);
  const row = await as(USER_A, `select file_name from shared_photos where id = 'photo-a' and album_id = $1`, [albumId]);
  await as(USER_C, `delete from album_members where user_id = $1`, [USER_C]);
  return row.rows[0]?.file_name !== 'x';
})());

const thumbPath = `${albumId}/photo-a_t.jpg`;
await as(USER_A, `update shared_photos set thumb_path = $1 where id = 'photo-a' and album_id = $2`, [thumbPath, albumId]);
await as(USER_A, `insert into storage.objects (bucket_id, name) values ('trip-photos', $1)`, [thumbPath]);
await as(USER_C, `select view_album('token-view')`);
check('見るだけの人はサムネイルも読める',
  (await as(USER_C, `select name from storage.objects where name = $1`, [thumbPath])).rows.length === 1);
check('見るだけの人はサムネイルを消せない',
  ((await as(USER_C, `delete from storage.objects where name = $1`, [thumbPath])), 
   (await as(USER_A, `select name from storage.objects where name = $1`, [thumbPath])).rows.length === 1));
await as(USER_A, `delete from storage.objects where name = $1`, [thumbPath]);
check('持ち主はサムネイルを消せる',
  (await as(USER_A, `select name from storage.objects where name = $1`, [thumbPath])).rows.length === 0);
await as(USER_C, `delete from album_members where user_id = $1`, [USER_C]);

console.log('\n■ 参加の取り消し');

await as(USER_B, `delete from album_members where user_id = $1`, [USER_B]);
check('自分の参加は自分で取り消せる', (await as(USER_B, `select id from shared_albums`)).rows.length === 0);

await as(USER_C, `select join_album('token-kyoto', 'たろう')`);
check('招待リンクからの参加は editor', 
  (await as(USER_C, `select role from album_members where user_id = $1`, [USER_C])).rows[0]?.role === 'editor');
await as(USER_A, `delete from album_members where album_id = $1 and user_id = $2`, [albumId, USER_C]);
check('持ち主は参加者を外せる', (await as(USER_C, `select id from shared_albums`)).rows.length === 0);

await as(USER_A, `delete from shared_albums where id = $1`, [albumId]);
check('持ち主はアルバムを消せる', (await as(USER_A, `select id from shared_albums`)).rows.length === 0);
check('アルバムを消すと写真の記録も消える', (await as(USER_A, `select id from shared_photos`)).rows.length === 0);

console.log('\n■ 適用の確認クエリ');

// schema.sql の末尾に付けた確認クエリが、期待どおりの数を返すか
await db.exec('reset role;');
const summary = await db.query(`
  select
    (select count(*) from pg_tables
      where schemaname = 'public'
        and tablename in ('shared_albums', 'album_members', 'shared_photos')) as tables,
    (select count(*) from pg_policies
      where schemaname = 'public'
        and tablename in ('shared_albums', 'album_members', 'shared_photos')) as policies,
    (select count(*) from pg_policies
      where schemaname = 'storage' and policyname like 'trip_photos%') as storage_policies,
    (select count(*) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'is_album_member', 'can_edit_album', 'add_owner_as_member', 'join_album', 'view_album'
        )) as functions;
`);
const row = summary.rows[0];
console.log('  返る値:', row);
check('tables が 3', Number(row.tables) === 3, String(row.tables));
check('policies が 10', Number(row.policies) === 10, String(row.policies));
check('storage_policies が 4', Number(row.storage_policies) === 4, String(row.storage_policies));
check('functions が 5', Number(row.functions) === 5, String(row.functions));

console.log(`\n結果: ${passed} 件成功 / ${failed} 件失敗\n`);
process.exit(failed === 0 ? 0 : 1);
