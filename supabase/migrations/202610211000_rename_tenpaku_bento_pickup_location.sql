-- お弁当受取場所の表示名を「天白オフィス」に統一する。
-- 旧マイグレーション適用済み・未適用のどちらでも重複しないようにする。
UPDATE public.bento_pickup_locations
SET is_active = false
WHERE name = '天白事務所'
  AND EXISTS (
    SELECT 1
    FROM public.bento_pickup_locations
    WHERE name = '天白オフィス'
  );

UPDATE public.bento_pickup_locations
SET name = '天白オフィス',
    is_active = true
WHERE name = '天白事務所'
  AND NOT EXISTS (
    SELECT 1
    FROM public.bento_pickup_locations
    WHERE name = '天白オフィス'
  );

INSERT INTO public.bento_pickup_locations (name, sort_order, is_active)
SELECT
  '天白オフィス',
  COALESCE(MAX(sort_order), -1) + 1,
  true
FROM public.bento_pickup_locations
WHERE NOT EXISTS (
  SELECT 1
  FROM public.bento_pickup_locations
  WHERE name = '天白オフィス'
);
