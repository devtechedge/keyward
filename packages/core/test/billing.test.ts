import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  createCheckoutSession,
  readSubscriptionEvent,
  verifyWebhookSignature,
  type StripeConfig,
} from "../dist/index.js";

const config: StripeConfig = {
  secretKey: "sk_test_123",
  priceMonthly: "price_monthly_123",
  priceAnnual: "price_annual_123",
};

const payload = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated" });

function sign(body: string, secret: string, timestamp: number): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

test("a valid webhook signature is accepted", () => {
  const now = 1_700_000_000_000;
  const timestamp = Math.floor(now / 1000);
  const header = sign(payload, "whsec_test", timestamp);
  assert.equal(verifyWebhookSignature("whsec_test", payload, header, 300_000, now), true);
});

test("a signature made with the wrong secret is rejected", () => {
  const now = 1_700_000_000_000;
  const timestamp = Math.floor(now / 1000);
  const header = sign(payload, "whsec_wrong", timestamp);
  assert.equal(verifyWebhookSignature("whsec_test", payload, header, 300_000, now), false);
});

test("a signature over a different body is rejected", () => {
  const now = 1_700_000_000_000;
  const timestamp = Math.floor(now / 1000);
  const header = sign(payload, "whsec_test", timestamp);
  assert.equal(
    verifyWebhookSignature("whsec_test", `${payload} tampered`, header, 300_000, now),
    false,
  );
});

test("a signature older than the tolerance is rejected", () => {
  const now = 1_700_000_000_000;
  const timestamp = Math.floor(now / 1000) - 3600;
  const header = sign(payload, "whsec_test", timestamp);
  assert.equal(verifyWebhookSignature("whsec_test", payload, header, 300_000, now), false);
});

test("a malformed header is rejected without throwing", () => {
  assert.equal(verifyWebhookSignature("whsec_test", payload, "garbage", 300_000), false);
  assert.equal(verifyWebhookSignature("whsec_test", payload, "", 300_000), false);
});

test("a checkout session is created in subscription mode with the account reference", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const fakeFetch = (async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body ?? "") });
    if (String(input).includes("/v1/customers")) {
      return new Response(JSON.stringify({ id: "cus_123" }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ id: "cs_123", url: "https://checkout.stripe.test/cs_123" }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;

  const result = await createCheckoutSession({
    plan: "monthly",
    successUrl: "https://keyward.test/dashboard",
    cancelUrl: "https://keyward.test/pricing",
    accountRef: "acct_42",
    config,
    doFetch: fakeFetch,
  });

  assert.equal(result.sessionId, "cs_123");
  assert.match(result.url, /checkout\.stripe\.test/);
  const checkout = calls.find((c) => c.url.includes("/v1/checkout/sessions"));
  const body = new URLSearchParams(checkout?.body ?? "");
  assert.equal(body.get("mode"), "subscription");
  assert.equal(body.get("client_reference_id"), "acct_42");
  assert.equal(body.get("customer"), "cus_123");
  assert.match(body.get("line_items") ?? "", /price_monthly_123/);
});

test("a subscription event is read into a state", () => {
  const state = readSubscriptionEvent({
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_123",
        customer: "cus_123",
        status: "active",
        current_period_end: 1_800_000_000,
        metadata: { accountRef: "acct_42" },
        items: { data: [{ price: { interval: "month" } }] },
      },
    },
  });

  assert.equal(state.accountRef, "acct_42");
  assert.equal(state.customerId, "cus_123");
  assert.equal(state.subscriptionId, "sub_123");
  assert.equal(state.status, "active");
  assert.equal(state.plan, "monthly");
  assert.equal(state.currentPeriodEnd?.toISOString(), "2027-01-15T08:00:00.000Z");
});

test("an unknown status maps to none rather than throwing", () => {
  const state = readSubscriptionEvent({
    type: "customer.subscription.updated",
    data: { object: { status: "something_new" } },
  });
  assert.equal(state.status, "none");
});
