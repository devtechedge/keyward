import { NextResponse } from "next/server";
import { hasDatabase, query } from "../../../lib/db";

export const dynamic = "force-dynamic";

/**
 * Create the control plane tables, and bring an older deployment up to date.
 *
 * The setup route is safe to run repeatedly. It creates what is missing and
 * adds a column that a previous deployment did not have, so a database that
 * was created before account scoping keeps working.
 */
export async function POST() {
  if (!hasDatabase()) {
    return NextResponse.json(
      { ok: false, error: "No database configured. The app is running on demo data." },
      { status: 503 },
    );
  }

  const statements = [
    `create table if not exists keyward_keys (
      id text primary key,
      account_ref text not null default 'default',
      provider text not null,
      name text not null,
      masked text not null,
      fingerprint text not null,
      scope text,
      service_account text,
      created_at timestamptz not null default now(),
      last_used_at timestamptz,
      expires_at timestamptz,
      monthly_usd numeric(12, 2) not null default 0,
      state text not null default 'active',
      finding_id text
    )`,
    `create table if not exists keyward_spend_daily (
      bucket date not null,
      account_ref text not null default 'default',
      provider text not null,
      spend_usd numeric(12, 2) not null default 0,
      primary key (bucket, account_ref, provider)
    )`,
    `create table if not exists keyward_anomalies (
      id text primary key,
      account_ref text not null default 'default',
      provider text not null,
      severity text not null,
      title text not null,
      detail text not null,
      observed_usd numeric(12, 2) not null default 0,
      baseline_usd numeric(12, 2) not null default 0,
      ratio numeric(10, 3) not null default 0,
      scope text not null,
      detected_at timestamptz not null default now()
    )`,
    `create table if not exists keyward_runs (
      id text primary key,
      account_ref text not null default 'default',
      secret text not null,
      provider text not null,
      status text not null,
      started_at timestamptz not null default now(),
      duration_ms integer not null default 0,
      steps jsonb not null default '[]'::jsonb
    )`,
    `create table if not exists keyward_findings (
      id text primary key,
      account_ref text not null default 'default',
      provider text not null,
      pattern text not null,
      masked text not null,
      fingerprint text not null,
      severity text not null,
      location text not null,
      live boolean,
      detected_at timestamptz not null default now()
    )`,
    `create table if not exists keyward_policies (
      id text primary key,
      name text not null,
      providers text[] not null default '{}',
      rotate_after_days integer not null default 90,
      idle_after_days integer not null default 30,
      spend_spike_factor numeric(6, 2) not null default 2.5,
      spend_spike_floor numeric(12, 2) not null default 10,
      enabled boolean not null default true
    )`,
    `create table if not exists keyward_subscriptions (
      account_ref text primary key,
      stripe_customer_id text,
      stripe_subscription_id text,
      plan text not null default 'monthly',
      status text not null default 'none',
      current_period_end timestamptz,
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists keyward_connections (
      account_ref text not null,
      kind text not null,
      label text not null,
      token_encrypted text not null,
      token_fingerprint text not null,
      token_masked text not null,
      scope text,
      updated_at timestamptz not null default now(),
      primary key (account_ref, kind)
    )`,
  ];

  // Columns added after the first release. Adding one to an existing table
  // needs a default, and it is not null, so the default carries the rows
  // that were written before account scoping existed.
  const migrations: Array<{ table: string; column: string; type: string }> = [
    { table: "keyward_keys", column: "account_ref", type: "text not null default 'default'" },
    { table: "keyward_spend_daily", column: "account_ref", type: "text not null default 'default'" },
    { table: "keyward_anomalies", column: "account_ref", type: "text not null default 'default'" },
    { table: "keyward_runs", column: "account_ref", type: "text not null default 'default'" },
    { table: "keyward_findings", column: "account_ref", type: "text not null default 'default'" },
    { table: "keyward_findings", column: "fingerprint", type: "text not null default ''" },
    { table: "keyward_keys", column: "fingerprint", type: "text not null default ''" },
  ];

  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    for (const statement of statements) {
      await query(statement);
    }

    for (const migration of migrations) {
      const exists = await query<{ present: boolean }>(
        `select exists (
           select 1 from information_schema.columns
           where table_schema = 'public'
             and table_name = $1
             and column_name = $2
         ) as present`,
        [migration.table, migration.column],
      );
      if (exists[0]?.present) {
        skipped.push(`${migration.table}.${migration.column}`);
        continue;
      }
      await query(
        `alter table ${migration.table} add column if not exists ${migration.column} ${migration.type}`,
      );
      applied.push(`${migration.table}.${migration.column}`);
    }

    return NextResponse.json({
      ok: true,
      tables: statements.length,
      columnsAdded: applied,
      columnsAlreadyPresent: skipped.length,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
