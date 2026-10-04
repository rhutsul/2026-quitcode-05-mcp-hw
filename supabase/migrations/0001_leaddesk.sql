-- LeadDesk: leads table. Statuses are exactly LEAD_STATUSES (lib/types.ts),
-- sources are LEAD_SOURCES, ids follow leadId() in lib/db.ts.
create table public.leads (
  id          text        primary key check (id ~ '^lead_[0-9]{4}$'),
  full_name   text        not null,
  company     text        not null,
  email       text        not null,
  source      text        not null check (source in ('website', 'google-ads', 'facebook-ads', 'linkedin', 'referral', 'webinar')),
  status      text        not null default 'new' check (status in ('new', 'contacted', 'qualified', 'won', 'lost')),
  budget      integer     check (budget is null or budget >= 0),
  message     text        not null,
  created_at  timestamptz not null default now()
);

create index leads_status_created_at_idx on public.leads (status, created_at desc);

-- No policies: the table is closed to the anon and authenticated API roles.
alter table public.leads enable row level security;
