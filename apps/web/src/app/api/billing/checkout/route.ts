import { NextResponse } from "next/server";
import {
  createCheckoutSession,
  configFromEnv,
  StripeNotConfiguredError,
  StripeApiError,
} from "@keyward/core";

export const dynamic = "force-dynamic";

/**
 * Start a Stripe Checkout session for the hosted control plane.
 *
 * The body carries the plan and the account reference. The secret key never
 * comes from the client, only from the server environment.
 */
export async function POST(request: Request) {
  let body: { plan?: string; accountRef?: string; successUrl?: string; cancelUrl?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const plan = body.plan === "annual" ? "annual" : "monthly";
  const accountRef = (body.accountRef ?? "").trim();
  if (!accountRef) {
    return NextResponse.json(
      { ok: false, error: "accountRef is required" },
      { status: 400 },
    );
  }

  const origin = new URL(request.url).origin;

  try {
    const config = configFromEnv();
    const session = await createCheckoutSession({
      plan,
      accountRef,
      successUrl: body.successUrl ?? `${origin}/dashboard?checkout=success`,
      cancelUrl: body.cancelUrl ?? `${origin}/pricing?checkout=cancelled`,
      config,
    });
    return NextResponse.json({ ok: true, url: session.url, sessionId: session.sessionId });
  } catch (error) {
    if (error instanceof StripeNotConfiguredError) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Billing is not configured on this deployment. The CLI is free and needs no account.",
        },
        { status: 503 },
      );
    }
    if (error instanceof StripeApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
