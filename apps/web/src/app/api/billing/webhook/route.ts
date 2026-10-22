import { NextResponse } from "next/server";
import { readSubscriptionEvent, verifyWebhookSignature } from "@keyward/core";
import { hasDatabase, query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

/**
 * Receive Stripe subscription webhooks.
 *
 * The signature is verified before anything is read from the body. An event
 * that cannot be attributed to an account is dropped rather than guessed at.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "STRIPE_WEBHOOK_SECRET is not set" },
      { status: 503 },
    );
  }

  if (!verifyWebhookSignature(secret, raw, signature)) {
    return NextResponse.json(
      { ok: false, error: "Signature verification failed" },
      { status: 400 },
    );
  }

  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const state = readSubscriptionEvent(event as Parameters<typeof readSubscriptionEvent>[0]);
  if (!state.accountRef) {
    return NextResponse.json({ ok: true, stored: false, reason: "no account reference" });
  }

  if (!hasDatabase()) {
    return NextResponse.json({ ok: true, stored: false, reason: "no database configured" });
  }

  try {
    await query(
      `insert into keyward_subscriptions (account_ref, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, updated_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (account_ref) do update set
         stripe_customer_id = excluded.stripe_customer_id,
         stripe_subscription_id = excluded.stripe_subscription_id,
         plan = excluded.plan,
         status = excluded.status,
         current_period_end = excluded.current_period_end,
         updated_at = now()`,
      [
        state.accountRef,
        state.customerId,
        state.subscriptionId,
        state.plan,
        state.status,
        state.currentPeriodEnd?.toISOString() ?? null,
      ],
    );
    return NextResponse.json({ ok: true, stored: true, plan: state.plan, status: state.status });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
