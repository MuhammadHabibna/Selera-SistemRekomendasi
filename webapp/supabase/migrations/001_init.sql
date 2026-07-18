-- Schema sistem rekomendasi (Fase 2)
-- Jalankan di Supabase SQL Editor atau via `supabase db push`.

create table if not exists public.items (
  item_idx integer primary key,
  product_title text not null,
  product_category text
);

create table if not exists public.item_similarity (
  item_idx integer not null references public.items(item_idx),
  similar_item_idx integer not null references public.items(item_idx),
  rank integer not null,
  similarity_score double precision not null,
  primary key (item_idx, rank)
);

create table if not exists public.item_popularity (
  item_idx integer primary key references public.items(item_idx),
  popularity_rank integer not null,
  popularity_score double precision not null
);

create table if not exists public.user_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_idx integer not null references public.items(item_idx),
  interaction_type text not null
    check (interaction_type in ('view', 'click', 'like', 'rate')),
  rating_value integer check (rating_value between 1 and 5),
  created_at timestamptz not null default now(),
  constraint rating_required_for_rate
    check (interaction_type <> 'rate' or rating_value is not null)
);

-- Index supaya query rekomendasi tetap cepat
create index if not exists idx_item_similarity_item
  on public.item_similarity (item_idx);
create index if not exists idx_item_popularity_rank
  on public.item_popularity (popularity_rank);
create index if not exists idx_user_interactions_user
  on public.user_interactions (user_id, created_at desc);
create index if not exists idx_user_interactions_item
  on public.user_interactions (item_idx);

-- Row Level Security
alter table public.items enable row level security;
alter table public.item_similarity enable row level security;
alter table public.item_popularity enable row level security;
alter table public.user_interactions enable row level security;

-- Katalog boleh dibaca semua user yang login
create policy "items_read" on public.items
  for select to authenticated using (true);
create policy "item_similarity_read" on public.item_similarity
  for select to authenticated using (true);
create policy "item_popularity_read" on public.item_popularity
  for select to authenticated using (true);

-- Interaksi: tiap user hanya bisa membaca/menulis miliknya sendiri
create policy "interactions_select_own" on public.user_interactions
  for select to authenticated using (auth.uid() = user_id);
create policy "interactions_insert_own" on public.user_interactions
  for insert to authenticated with check (auth.uid() = user_id);
