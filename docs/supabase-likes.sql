create table if not exists public.post_likes (
	slug text primary key,
	count integer not null default 520,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

alter table public.post_likes enable row level security;
