import { NextResponse } from "next/server";
import { hasDatabase, query } from "../../../lib/db";

export const dynamic = "force-dynamic";

/**
 * Create the control plane tables.
 *
 * The hosted app runs this once on first boot so a fresh database works without
 * a manual migration step. It is safe to run repeatedly.
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
      provider text not null,
      spend_usd numeric(12, 2) not null default 0,
      primary key (bucket, provider)
    )`,
    `create table if not exists keyward_anomalies (
      id text primary key,
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
      secret text not null,
      provider text not null,
      status text not null,
      started_at timestamptz not null default now(),
      duration_ms integer not null default 0,
      steps jsonb not null default '[]'::jsonb
    )`,
    `create table if not exists keyward_findings (
      id text primary key,
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
  ];

  try {
    for (const statement of statements) {
      await query(statement);
    }
    return NextResponse.json({ ok: true, tables: statements.length });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
