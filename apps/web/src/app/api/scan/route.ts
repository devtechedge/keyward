import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { scanGitHubOwner, scanVercelEnv } from "@keyward/core";
import { hasDatabase, query } from "../../../lib/db";
import { decryptSecret } from "../../../lib/crypto";

export const dynamic = "force-dynamic";

/**
 * Scan a connected account and store the findings.
 *
 * The credential is decrypted here, used for the scan, and discarded. Only
 * fingerprints and masks are written.
 */
export async function POST(request: Request) {
  if (!hasDatabase()) {
    return NextResponse.json(
      { ok: false, error: "No database configured on this deployment." },
      { status: 503 },
    );
  }

  let body: { kind?: string; label?: string; teamId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const kind = (body.kind ?? "").trim();
  const store = await cookies();
  const accountRef = store.get("kw_account")?.value ?? null;
  if (!accountRef) {
    return NextResponse.json(
      { ok: false, error: "No account selected" },
      { status: 401 },
    );
  }

  let token: string;
  let scope: string | null = null;
  try {
    const rows = await query<{ token_encrypted: string; scope: string | null }>(
      "select token_encrypted, scope from keyward_connections where account_ref = $1 and kind = $2",
      [accountRef, kind],
    );
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { ok: false, error: "That account is not connected" },
        { status: 404 },
      );
    }
    token = decryptSecret(row.token_encrypted);
    scope = row.scope;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }

  const label = (body.label ?? kind).trim();

  try {
    const findings =
      kind === "github"
        ? (await scanGitHubOwner({ token, owner: label })).findings
        : kind === "vercel"
          ? (
              await scanVercelEnv({
                token,
                teamId: body.teamId ?? scope ?? "",
              })
            ).findings
          : [];

    const now = new Date().toISOString();
    for (const finding of findings) {
      await query(
        `insert into keyward_findings (id, account_ref, provider, pattern, masked, fingerprint, severity, location, live, detected_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (id) do update set
           account_ref = excluded.account_ref,
           provider = excluded.provider,
           pattern = excluded.pattern,
           masked = excluded.masked,
           fingerprint = excluded.fingerprint,
           severity = excluded.severity,
           location = excluded.location,
           live = excluded.live,
           detected_at = excluded.detected_at`,
        [
          finding.id,
          accountRef,
          finding.secret.provider,
          finding.id.split(":")[0] ?? "unknown",
          finding.secret.masked,
          finding.secret.fingerprint,
          finding.severity,
          finding.source.kind === "file" ? finding.source.path : "unknown",
          finding.live,
          now,
        ],
      );
    }

    return NextResponse.json({
      ok: true,
      kind,
      label,
      findings: findings.length,
      providers: [...new Set(findings.map((f) => f.secret.provider))],
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
