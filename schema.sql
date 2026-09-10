-- ANTEROOM lead capture. Run this once in the Neon SQL editor.
-- One table, because a basic CRM wants one list. `kind` tells the two
-- entry points apart: a full brief, or a free-demo photograph.

create table if not exists leads (
  id             bigserial primary key,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  kind           text not null check (kind in ('brief', 'photo')),

  -- who
  property       text,
  contact_name   text,
  email          text not null,
  phone          text,

  -- what they asked for (brief only)
  audience       text,
  plan           text,
  languages      text,
  message        text,

  -- the free demo (photo only).
  -- The store is private, so what is kept here is the path inside it, never a
  -- URL anyone could open. /api/photo-view serves the bytes, and only to
  -- someone holding the admin token.
  photo_path     text,
  photo_bytes    integer,

  -- context captured at submit time, useful when you follow up
  source_country text,
  currency       text,
  user_agent     text,
  ip_hash        text,

  -- your side of it
  status         text not null default 'new'
                 check (status in ('new', 'contacted', 'quoted', 'won', 'lost')),
  notes          text
);

create index if not exists leads_created_idx on leads (created_at desc);
create index if not exists leads_status_idx  on leads (status);
create index if not exists leads_iphash_idx  on leads (ip_hash, created_at desc);

-- keep updated_at honest
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists leads_touch on leads;
create trigger leads_touch before update on leads
  for each row execute function touch_updated_at();
