import { NextResponse } from "next/server";
import { getOverview } from "../../../lib/overview";

export const dynamic = "force-dynamic";

/**
 * The overview endpoint.
 *
 * It is the same read the dashboard does, so anything the CLI pushes is visible
 * here immediately. Values are masked before they leave the server.
 */
export async function GET() {
  const overview = await getOverview();
  return NextResponse.json(overview, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
