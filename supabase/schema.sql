-- =====================================================================
-- Trip Memory 共有アルバム用のスキーマ
--
-- Supabase の SQL Editor にこのファイルの内容を貼り付けて実行してください。
-- 何度実行しても同じ状態になります（作り直しても既存データは消しません）。
--
-- 設計の要点
--   * ログイン不要にするため、参加者は匿名サインインで識別する
--   * アルバムを見られるのは「参加者」だけ。参加は招待リンクの合言葉でのみ増える
--   * 写真の本体は Storage に置き、メタデータだけこのテーブルに入れる
-- =====================================================================

-- ---------------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------------

create table if not exists public.shared_albums (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  note text not null default '',
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- 招待リンクに載せる合言葉。これを知っている人だけが参加できる
  invite_token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.album_members (
  album_id uuid not null references public.shared_albums (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null default '',
  joined_at timestamptz not null default now(),
  primary key (album_id, user_id)
);

create table if not exists public.shared_photos (
  -- 端末側と同じ内容ハッシュ。同じ写真を二重に上げないための ID
  id text not null,
  album_id uuid not null references public.shared_albums (id) on delete cascade,
  uploader_id uuid not null references auth.users (id) on delete cascade,
  file_name text not null default '',
  taken_at timestamptz,
  lat double precision,
  lon double precision,
  width integer not null default 0,
  height integer not null default 0,
  -- Storage 上の位置。<album_id>/<photo_id>.jpg
  storage_path text not null,
  created_at timestamptz not null default now(),
  primary key (album_id, id)
);

create index if not exists shared_photos_album_idx on public.shared_photos (album_id);
create index if not exists album_members_user_idx on public.album_members (user_id);

-- ---------------------------------------------------------------------
-- 参加者かどうかの判定
--
-- album_members 自身のポリシーから参照するため security definer にする。
-- そうしないとポリシーの評価が自分自身を呼び続けて無限再帰になる。
-- ---------------------------------------------------------------------

create or replace function public.is_album_member(target_album uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.album_members
    where album_id = target_album and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- アルバムを作った人を、そのまま参加者にする
-- ---------------------------------------------------------------------

create or replace function public.add_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.album_members (album_id, user_id, display_name)
  values (new.id, new.owner_id, '')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists shared_albums_add_owner on public.shared_albums;
create trigger shared_albums_add_owner
after insert on public.shared_albums
for each row execute function public.add_owner_as_member();

-- ---------------------------------------------------------------------
-- 招待リンクから参加する
--
-- 合言葉が合っているときだけ参加者を増やす。テーブルへの直接 insert は
-- 許可していないので、参加経路はこの関数だけになる。
-- ---------------------------------------------------------------------

create or replace function public.join_album(token text, display_name text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  select id into target from public.shared_albums where invite_token = token;
  if target is null then
    raise exception 'invalid_token';
  end if;

  insert into public.album_members (album_id, user_id, display_name)
  values (target, auth.uid(), left(coalesce(display_name, ''), 40))
  on conflict (album_id, user_id) do update set display_name = excluded.display_name;

  return target;
end;
$$;

revoke all on function public.join_album(text, text) from public;
grant execute on function public.join_album(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 行レベルセキュリティ
-- ---------------------------------------------------------------------

alter table public.shared_albums enable row level security;
alter table public.album_members enable row level security;
alter table public.shared_photos enable row level security;

-- アルバム: 参加者だけが読める。作成は自分が持ち主のときだけ。
-- 名前とメモは参加者みんなが直せる（共同編集）。削除は持ち主だけ。
drop policy if exists shared_albums_select on public.shared_albums;
create policy shared_albums_select on public.shared_albums
  for select using (public.is_album_member(id));

drop policy if exists shared_albums_insert on public.shared_albums;
create policy shared_albums_insert on public.shared_albums
  for insert with check (owner_id = auth.uid());

drop policy if exists shared_albums_update on public.shared_albums;
create policy shared_albums_update on public.shared_albums
  for update using (public.is_album_member(id)) with check (public.is_album_member(id));

drop policy if exists shared_albums_delete on public.shared_albums;
create policy shared_albums_delete on public.shared_albums
  for delete using (owner_id = auth.uid());

-- 参加者: 同じアルバムの参加者だけが一覧を見られる。
-- 追加は join_album 経由だけ（insert のポリシーを作らない＝拒否）。
-- 自分の参加は自分で取り消せる。持ち主は誰でも外せる。
drop policy if exists album_members_select on public.album_members;
create policy album_members_select on public.album_members
  for select using (public.is_album_member(album_id));

drop policy if exists album_members_delete on public.album_members;
create policy album_members_delete on public.album_members
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.shared_albums a
      where a.id = album_id and a.owner_id = auth.uid()
    )
  );

-- 写真: 参加者だけが読める。追加は参加者が自分名義でのみ。
-- 消せるのは上げた本人か、アルバムの持ち主。
drop policy if exists shared_photos_select on public.shared_photos;
create policy shared_photos_select on public.shared_photos
  for select using (public.is_album_member(album_id));

drop policy if exists shared_photos_insert on public.shared_photos;
create policy shared_photos_insert on public.shared_photos
  for insert with check (public.is_album_member(album_id) and uploader_id = auth.uid());

drop policy if exists shared_photos_delete on public.shared_photos;
create policy shared_photos_delete on public.shared_photos
  for delete using (
    uploader_id = auth.uid()
    or exists (
      select 1 from public.shared_albums a
      where a.id = album_id and a.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- 写真本体の置き場（非公開バケット）
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('trip-photos', 'trip-photos', false)
on conflict (id) do nothing;

-- パスの先頭がアルバム ID。そのアルバムの参加者だけが読み書きできる。
drop policy if exists trip_photos_select on storage.objects;
create policy trip_photos_select on storage.objects
  for select using (
    bucket_id = 'trip-photos'
    and public.is_album_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists trip_photos_insert on storage.objects;
create policy trip_photos_insert on storage.objects
  for insert with check (
    bucket_id = 'trip-photos'
    and public.is_album_member(((storage.foldername(name))[1])::uuid)
  );

-- 消せるのは、その写真を上げた本人かアルバムの持ち主。
-- storage.objects の所有者列は Supabase のバージョンで名前が変わるため、
-- 自分たちの shared_photos を見て判断する（先にファイル、次に行の順で消すこと）。
drop policy if exists trip_photos_delete on storage.objects;
create policy trip_photos_delete on storage.objects
  for delete using (
    bucket_id = 'trip-photos'
    and exists (
      select 1
      from public.shared_photos p
      join public.shared_albums a on a.id = p.album_id
      where p.storage_path = storage.objects.name
        and (p.uploader_id = auth.uid() or a.owner_id = auth.uid())
    )
  );
