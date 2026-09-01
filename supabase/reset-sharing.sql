-- =====================================================================
-- 共有をすべて白紙に戻す
--
-- 【注意】このスクリプトは、サーバーに置いた共有アルバムと写真、
-- これまでに参加した人の記録を「すべて」消します。元に戻せません。
--
-- 消えないもの: 各自の端末（ブラウザ）に保存されている写真とアルバム。
--               自分の iPhone の思い出はそのまま残ります。
--
-- 使いどころ: 誰にどこまで共有したか分からなくなったときに、
--             一度きれいにして共有をやり直す。
--
-- 実行したあと、アプリ側で改めて「このアルバムを共有する」を押すと、
-- 押した端末が唯一の持ち主になります。
-- =====================================================================

-- 写真ファイルの実体も消す（先にファイル、次に記録の順で消す）
delete from storage.objects where bucket_id = 'trip-photos';

-- アルバムを消すと、参加者と写真の記録も一緒に消える
delete from public.shared_albums;

-- 使われなくなった匿名の利用者も片付ける（誰の記録でもない人だけ）
delete from auth.users u
where not exists (select 1 from public.shared_albums a where a.owner_id = u.id)
  and not exists (select 1 from public.album_members m where m.user_id = u.id);

-- 結果の確認。すべて 0 なら白紙になっている。
select
  (select count(*) from public.shared_albums) as albums,
  (select count(*) from public.album_members) as members,
  (select count(*) from public.shared_photos) as photos,
  (select count(*) from storage.objects where bucket_id = 'trip-photos') as files;
