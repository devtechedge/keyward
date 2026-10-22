import { NextResponse } from "next/server";
import { fingerprint, mask } from "@keyward/core";
import { hasDatabase, query } from "../../../lib/db";
import { encryptSecret, secretFingerprint } from "../../../lib/crypto";

export const dynamic = "force-dynamic";

/**
 * Connect a provider or a GitHub account to the hosted control plane.
 *
 * The credential is encrypted before it is written. The response carries a
 * fingerprint and a mask, never the value.
 */
export async function POST(request: Request) {
  if (!hasDatabase()) {
    return NextResponse.json(
      { ok: false, error: "No database configured on this deployment." },
      { status: 503 },
    );
  }

  let body: {
    kind?: string;
    label?: string;
    token?: string;
    teamId?: string;
    accountRef?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const kind = (body.kind ?? "").trim();
  const token = (body.token ?? "").trim();
  if (!kind || !token) {
    return NextResponse.json(
      { ok: false, error: "kind and token are required" },
      { status: 400 },
    );
  }

  const accountRef = (body.accountRef ?? "default").trim();
  const label = (body.label ?? kind).trim();

  try {
    const encrypted = encryptSecret(token);
    await query(
      `insert into keyward_connections (account_ref, kind, label, token_encrypted, token_fingerprint, token_masked, scope, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (account_ref, kind) do update set
         label = excluded.label,
         token_encrypted = excluded.token_encrypted,
         token_fingerprint = excluded.token_fingerprint,
         token_masked = excluded.token_masked,
         scope = excluded.scope,
         updated_at = now()`,
      [
        accountRef,
        kind,
        label,
        encrypted,
        secretFingerprint(token),
        mask(token),
        (body.teamId ?? "").trim() || null,
      ],
    );

    return NextResponse.json({
      ok: true,
      kind,
      label,
      fingerprint: fingerprint(token),
      masked: mask(token),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/** List the connections. Only metadata, never a token. */
export async function GET() {
  if (!hasDatabase()) {
    return NextResponse.json({ ok: true, connections: [] });
  }
  try {
    const rows = await query<{
      kind: string;
      label: string;
      token_fingerprint: string;
      token_masked: string;
      scope: string | null;
      updated_at: string;
    }>(
      "select kind, label, token_fingerprint, token_masked, scope, updated_at from keyward_connections order by updated_at desc",
    );
    return NextResponse.json({ ok: true, connections: rows });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
