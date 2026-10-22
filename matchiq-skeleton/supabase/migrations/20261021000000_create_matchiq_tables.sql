-- MatchIQ initial schema
-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run: everything uses IF NOT EXISTS.
--
-- Design note: live rooms stay in-memory on the game server. Supabase only
-- stores finished matches, their final standings, prediction rounds, and
-- individual answers — the data worth keeping after a room closes.

-- ---------------------------------------------------------------------------
-- matches: one row per finished game
-- ---------------------------------------------------------------------------
create table if not exists public.matches (
  id          uuid primary key default gen_random_uuid(),
  room_code   text not null,
  source      text not null check (source in ('simulated', 'live')),
  fixture_id  bigint, -- API-Football fixture id, live mode only
  home_team   text not null,
  away_team   text not null,
  home_score  int  not null default 0 check (home_score >= 0),
  away_score  int  not null default 0 check (away_score >= 0),
  events      jsonb not null default '[]'::jsonb, -- full match event log
  stats       jsonb not null default '{}'::jsonb, -- final per-team stats
  started_at  timestamptz,
  finished_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- match_players: final standings for a match
-- ---------------------------------------------------------------------------
create table if not exists public.match_players (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches (id) on delete cascade,
  player_name text not null,
  is_bot      boolean not null default false,
  score       int not null default 0,
  correct     int not null default 0,
  answered    int not null default 0,
  best_streak int not null default 0,
  rank        int not null check (rank >= 1)
);

-- ---------------------------------------------------------------------------
-- prediction_rounds: every prediction asked in a match, and its outcome
-- ---------------------------------------------------------------------------
create table if not exists public.prediction_rounds (
  id             uuid primary key default gen_random_uuid(),
  match_id       uuid not null references public.matches (id) on delete cascade,
  question       text not null,
  team_name      text, -- null for match-wide questions (e.g. "Will there be a goal?")
  window_minutes int  not null check (window_minutes > 0),
  start_minute   int  not null,
  end_minute     int  not null,
  outcome        text not null check (outcome in ('Yes', 'No'))
);

-- ---------------------------------------------------------------------------
-- player_answers: how each player answered each round (scoring detail)
-- ---------------------------------------------------------------------------
create table if not exists public.player_answers (
  id           uuid primary key default gen_random_uuid(),
  round_id     uuid not null references public.prediction_rounds (id) on delete cascade,
  player_name  text not null,
  is_bot       boolean not null default false,
  answer       text check (answer in ('Yes', 'No')), -- null = did not answer
  correct      boolean not null default false,
  points       int not null default 0,
  speed_bonus  int not null default 0,
  streak_bonus int not null default 0,
  elapsed_ms   int -- time from question opening to answering
);

create index if not exists idx_match_players_match  on public.match_players (match_id);
create index if not exists idx_rounds_match         on public.prediction_rounds (match_id);
create index if not exists idx_answers_round        on public.player_answers (round_id);
create index if not exists idx_matches_finished     on public.matches (finished_at desc);
create index if not exists idx_players_name         on public.match_players (player_name);

-- ---------------------------------------------------------------------------
-- Security: RLS on, no public policies.
-- The browser can never touch these tables directly; the game server writes
-- with its secret key, which bypasses RLS. Add SELECT policies later only if
-- the frontend needs to read history directly.
-- ---------------------------------------------------------------------------
alter table public.matches           enable row level security;
alter table public.match_players     enable row level security;
alter table public.prediction_rounds enable row level security;
alter table public.player_answers    enable row level security;

grant select, insert, update, delete on public.matches           to service_role;
grant select, insert, update, delete on public.match_players     to service_role;
grant select, insert, update, delete on public.prediction_rounds to service_role;
grant select, insert, update, delete on public.player_answers    to service_role;

-- ---------------------------------------------------------------------------
-- all_time_leaderboard: career totals per human player (handy for a UI page)
-- ---------------------------------------------------------------------------
create or replace view public.all_time_leaderboard as
select
  player_name,
  count(*)                    as matches_played,
  sum(score)                  as total_score,
  sum(correct)                as total_correct,
  sum(answered)               as total_answered,
  max(best_streak)            as best_streak,
  count(*) filter (where rank = 1) as wins
from public.match_players
where not is_bot
group by player_name
order by total_score desc;

grant select on public.all_time_leaderboard to service_role;
