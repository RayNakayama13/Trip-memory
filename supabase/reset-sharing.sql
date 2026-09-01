-- =====================================================================
-- 共有をすべて白紙に戻す（データベース側）
--
-- 【注意】サーバーに置いた共有アルバム・写真の記録・参加者の記録を
-- 「すべて」消します。元に戻せません。
--
-- 消えないもの: 各自の端末（ブラウザ）に保存されている写真とアルバム。
--               自分の iPhone の思い出はそのまま残ります。
--
-- ★ 実行する前に ★
--   アプリで各アルバムの「共有をやめる」を押してください。
--   写真ファイルの実体は Storage API 経由でしか消せず、アプリの
--   「共有をやめる」がそれを行います。SQL から直接は消せません
--   （Supabase が誤削除防止のために禁止しています）。
--
--   アプリから消せない状態になっている場合は、このスクリプトを実行したあと、
--   ダッシュボードの Storage > trip-photos を開いて中身を手で削除してください。
-- =====================================================================

-- アルバムを消すと、参加者と写真の記録も一緒に消える
delete from public.shared_albums;

-- 結果の確認。albums / members / photos が 0 なら記録は白紙。
-- files が残っている場合は、Storage > trip-photos の中身を手で削除する。
select
  (select count(*) from public.shared_albums) as albums,
  (select count(*) from public.album_members) as members,
  (select count(*) from public.shared_photos) as photos,
  (select count(*) from storage.objects where bucket_id = 'trip-photos') as files;
