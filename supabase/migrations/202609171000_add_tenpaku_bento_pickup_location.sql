-- お弁当受取場所に天白事務所を追加する。
-- 既に登録済みの環境で再実行しても重複しないようにする。
INSERT INTO public.bento_pickup_locations (name, sort_order, is_active)
SELECT
  '天白事務所',
  COALESCE(MAX(sort_order), -1) + 1,
  true
FROM public.bento_pickup_locations
WHERE NOT EXISTS (
  SELECT 1
  FROM public.bento_pickup_locations
  WHERE name = '天白事務所'
);
