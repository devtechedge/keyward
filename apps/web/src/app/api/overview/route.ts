import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getOverview } from "../../../lib/overview";

export const dynamic = "force-dynamic";

/**
 * The overview endpoint.
 *
 * It is the same read the dashboard does, so anything the CLI or a scan pushes
 * is visible here immediately. Values are masked before they leave the server.
 */
export async function GET() {
  const store = await cookies();
  const accountRef = store.get("kw_account")?.value ?? null;
  const overview = await getOverview(accountRef);
  return NextResponse.json(overview, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
