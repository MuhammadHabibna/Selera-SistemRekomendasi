-- Fitur tambahan: statistik rating per item + association rules
-- Jalankan di Supabase SQL Editor setelah 001_init.sql.

create table if not exists public.item_stats (
  item_idx integer primary key references public.items(item_idx),
  avg_rating double precision not null,
  review_count integer not null
);

create table if not exists public.item_assoc (
  item_idx integer not null references public.items(item_idx),
  assoc_item_idx integer not null references public.items(item_idx),
  rank integer not null,
  support_count integer not null,
  confidence double precision not null,
  lift double precision not null,
  primary key (item_idx, rank)
);

create index if not exists idx_item_assoc_item on public.item_assoc (item_idx);

alter table public.item_stats enable row level security;
alter table public.item_assoc enable row level security;

create policy "item_stats_read" on public.item_stats
  for select to authenticated using (true);
create policy "item_assoc_read" on public.item_assoc
  for select to authenticated using (true);
