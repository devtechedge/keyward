-- keyward control plane schema
--
-- The dashboard reads from these tables. The CLI pushes rows into them, so the
-- hosted view reflects what a real scan and rotation produced.
--
-- No column here ever stores a secret value. Keys are stored masked, with a
-- fingerprint that is not reversible.

create table if not exists keyward_keys (
  id              text primary key,
  provider        text not null,
  name            text not null,
  masked          text not null,
  fingerprint     text not null,
  scope           text,
  service_account text,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz,
  expires_at      timestamptz,
  monthly_usd     numeric(12, 2) not null default 0,
  state           text not null default 'active',
  finding_id      text
);

create index if not exists keyward_keys_provider_idx on keyward_keys (provider);
create index if not exists keyward_keys_created_idx on keyward_keys (created_at desc);

create table if not exists keyward_spend_daily (
  bucket   date not null,
  provider text not null,
  spend_usd numeric(12, 2) not null default 0,
  primary key (bucket, provider)
);

create table if not exists keyward_anomalies (
  id           text primary key,
  provider     text not null,
  severity     text not null,
  title        text not null,
  detail       text not null,
  observed_usd numeric(12, 2) not null default 0,
  baseline_usd numeric(12, 2) not null default 0,
  ratio        numeric(10, 3) not null default 0,
  scope        text not null,
  detected_at  timestamptz not null default now()
);

create index if not exists keyward_anomalies_detected_idx
  on keyward_anomalies (detected_at desc);

create table if not exists keyward_runs (
  id          text primary key,
  secret      text not null,
  provider    text not null,
  status      text not null,
  started_at  timestamptz not null default now(),
  duration_ms integer not null default 0,
  steps       jsonb not null default '[]'::jsonb
);

create index if not exists keyward_runs_started_idx on keyward_runs (started_at desc);

create table if not exists keyward_findings (
  id          text primary key,
  provider    text not null,
  pattern     text not null,
  masked      text not null,
  fingerprint text not null,
  severity    text not null,
  location    text not null,
  live        boolean,
  detected_at timestamptz not null default now()
);

create index if not exists keyward_findings_detected_idx
  on keyward_findings (detected_at desc);

create table if not exists keyward_policies (
  id                  text primary key,
  name                text not null,
  providers           text[] not null default '{}',
  rotate_after_days   integer not null default 90,
  idle_after_days     integer not null default 30,
  spend_spike_factor  numeric(6, 2) not null default 2.5,
  spend_spike_floor   numeric(12, 2) not null default 10,
  enabled             boolean not null default true
);

create table if not exists keyward_subscriptions (
  account_ref             text primary key,
  stripe_customer_id      text,
  stripe_subscription_id  text,
  plan                    text not null default 'monthly',
  status                  text not null default 'none',
  current_period_end      timestamptz,
  updated_at              timestamptz not null default now()
);
