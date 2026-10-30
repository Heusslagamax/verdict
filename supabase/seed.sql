-- Données de départ : tes deux boutiques et tes trois concurrents suivis dans TrendTrack.
-- Seuils Norveline repris du fichier « Calcul ROAS BE & TARGET » (ligne Norveline).
-- Movesana : seuils à saisir dans Réglages (la ligne du fichier n'est pas encore nommée).

insert into public.shops (slug, name, market, meta_ad_account_id, thresholds, pnl, sort) values
(
  'norveline', 'Norveline', 'IT', '1560693355769124',
  '{"be":1.83,"targetLow":2.52,"target":2.88,"loss20":1.34,"jump":4.05,"atcTarget":11.09,"aov":55.45}',
  '{"dateColumn":"A","spendColumn":"F","salesColumn":"J","roasColumn":"M"}',
  0
),
(
  'movesana', 'Movesana', 'IT', '1643188013858255',
  null,
  '{"dateColumn":"A","spendColumn":"W","salesColumn":"AA","roasColumn":"AD"}',
  1
)
on conflict (slug) do nothing;

insert into public.competitors (shop_id, name, brandtracker_id)
select s.id, c.name, c.bt from public.shops s
join (values
  ('norveline', 'BagIt', 'b624f76d-5a4d-4db5-9af3-a383b1ba269b'),
  ('movesana', 'Inolyo', '7440a8b7-4c8c-4b3a-b96b-e6854a843870'),
  ('movesana', 'Stryde', '2145394e-cd25-49f7-b390-dfaa450299b6')
) as c(slug, name, bt) on c.slug = s.slug
on conflict (shop_id, brandtracker_id) do nothing;
