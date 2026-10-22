import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Billing for the hosted control plane.
 *
 * Only the parts that are pure protocol live here: creating a Stripe Checkout
 * Session and verifying a Stripe webhook signature. Persistence is the web app's
 * job, so this module stays free of a database and can be tested in isolation.
 *
 * Nothing here ever handles a card. Stripe Checkout does that.
 */

const STRIPE_API_BASE = "https://api.stripe.com/v1";

export class StripeNotConfiguredError extends Error {
  constructor(message = "Stripe is not configured") {
    super(message);
    this.name = "StripeNotConfiguredError";
  }
}

export class StripeApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "StripeApiError";
  }
}

export type SubscriptionPlan = "monthly" | "annual";
export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "unpaid";

export interface StripeConfig {
  readonly secretKey: string;
  /** Price id for the monthly plan. */
  readonly priceMonthly: string;
  /** Price id for the annual plan. */
  readonly priceAnnual?: string;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): StripeConfig {
  const secretKey = env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new StripeNotConfiguredError("STRIPE_SECRET_KEY is not set");
  }
  const priceMonthly = env.STRIPE_PRICE_MONTHLY;
  if (!priceMonthly) {
    throw new StripeNotConfiguredError("STRIPE_PRICE_MONTHLY is not set");
  }
  return {
    secretKey,
    priceMonthly,
    ...(env.STRIPE_PRICE_ANNUAL ? { priceAnnual: env.STRIPE_PRICE_ANNUAL } : {}),
  };
}

function priceForPlan(config: StripeConfig, plan: SubscriptionPlan): string {
  if (plan === "annual") {
    if (!config.priceAnnual) {
      throw new StripeNotConfiguredError("STRIPE_PRICE_ANNUAL is not set");
    }
    return config.priceAnnual;
  }
  return config.priceMonthly;
}

/**
 * A minimal Stripe API call. POST bodies are form encoded, which is what the
 * Stripe REST API expects.
 */
export async function stripeCall<T>(
  path: string,
  config: StripeConfig,
  body?: Record<string, string>,
  doFetch: typeof fetch = fetch,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.secretKey}`,
  };
  const init: RequestInit = { method: body ? "POST" : "GET", headers };
  if (body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(body).toString();
  }

  let res: Response;
  try {
    res = await doFetch(`${STRIPE_API_BASE}${path}`, init);
  } catch (err) {
    throw new StripeApiError(`stripe network error: ${(err as Error).message}`);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const message =
      json && typeof json === "object" && "error" in json
        ? String((json as { error: { message?: string } }).error?.message ?? "")
        : text;
    throw new StripeApiError(`stripe API error ${res.status}: ${message}`, res.status);
  }
  return json as T;
}

export interface CheckoutSessionResult {
  readonly url: string;
  readonly sessionId: string;
}

export interface CreateCheckoutSessionArgs {
  /** Identifies the customer. Reused across sessions so the org sees one Stripe customer. */
  readonly customerId?: string;
  readonly plan: SubscriptionPlan;
  readonly successUrl: string;
  readonly cancelUrl: string;
  /** Opaque reference back to the account, stored on the session. */
  readonly accountRef: string;
  readonly config: StripeConfig;
  readonly doFetch?: typeof fetch;
}

/**
 * Create a Stripe Checkout Session in subscription mode.
 *
 * The session carries the account reference in both `client_reference_id` and
 * the metadata, so a webhook can be matched back to the account even if the
 * customer row is missing.
 */
export async function createCheckoutSession(
  args: CreateCheckoutSessionArgs,
): Promise<CheckoutSessionResult> {
  const price = priceForPlan(args.config, args.plan);
  const doFetch = args.doFetch ?? fetch;

  const customerId =
    args.customerId ??
    (
      await stripeCall<{ id?: string }>(
        "/v1/customers",
        args.config,
        { description: `keyward account ${args.accountRef}`, metadata: JSON.stringify({ accountRef: args.accountRef }) },
        doFetch,
      )
    ).id;

  if (!customerId) {
    throw new StripeApiError("stripe customer response missing id");
  }

  const session = await stripeCall<{ id?: string; url?: string }>(
    "/v1/checkout/sessions",
    args.config,
    {
      mode: "subscription",
      customer: customerId,
      line_items: JSON.stringify([{ quantity: 1, price }]),
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      client_reference_id: args.accountRef,
      metadata: JSON.stringify({ accountRef: args.accountRef, plan: args.plan }),
    },
    doFetch,
  );

  if (typeof session.id !== "string" || typeof session.url !== "string") {
    throw new StripeApiError("stripe checkout session response missing id or url");
  }
  return { url: session.url, sessionId: session.id };
}

/**
 * Verify a Stripe webhook signature.
 *
 * The header carries a timestamp and one or more HMAC signatures. The signature
 * is recomputed over `${timestamp}.${body}` and compared in constant time. A
 * timestamp older than the tolerance is rejected, so a captured signature cannot
 * be replayed later.
 */
export function verifyWebhookSignature(
  secret: string,
  payload: string | Buffer,
  signatureHeader: string,
  toleranceMs = 300_000,
  now: number = Date.now(),
): boolean {
  try {
    let timestamp: number | null = null;
    let signature: string | null = null;

    for (const part of signatureHeader.split(",")) {
      const separator = part.indexOf("=");
      if (separator < 0) continue;
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (key === "t") timestamp = Number(value);
      if (key === "v1") signature = value;
    }
    if (timestamp === null || !signature || !Number.isFinite(timestamp)) return false;
    if (Math.abs(now / 1000 - timestamp) * 1000 > toleranceMs) return false;

    const body = typeof payload === "string" ? payload : payload.toString("utf8");
    const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signature, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export interface StripeEventLike {
  readonly type?: string;
  readonly data?: { readonly object?: Record<string, unknown> };
  readonly metadata?: Record<string, string>;
}

export interface SubscriptionState {
  readonly accountRef: string | null;
  readonly customerId: string | null;
  readonly subscriptionId: string | null;
  readonly plan: SubscriptionPlan;
  readonly status: SubscriptionStatus;
  readonly currentPeriodEnd: Date | null;
}

const VALID_STATUSES: readonly SubscriptionStatus[] = [
  "none",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "unpaid",
];

export function mapStatus(status: string): SubscriptionStatus {
  const lowered = status.toLowerCase() as SubscriptionStatus;
  return VALID_STATUSES.includes(lowered) ? lowered : "none";
}

/**
 * Read a Stripe event into the subscription state it implies.
 *
 * The account reference is taken from the event metadata, the client reference
 * or the subscription object, in that order, so a webhook can be attributed
 * even when the local customer row is not yet present.
 */
export function readSubscriptionEvent(event: StripeEventLike): SubscriptionState {
  const object = (event.data?.object ?? {}) as Record<string, unknown>;
  const metadata = {
    ...(event.metadata ?? {}),
    ...((object.metadata as Record<string, string> | undefined) ?? {}),
  };

  const accountRef =
    metadata.accountRef ??
    metadata.orgId ??
    (typeof object.client_reference_id === "string" ? object.client_reference_id : null);

  const customerId = typeof object.customer === "string" ? object.customer : null;
  const subscriptionId =
    typeof object.subscription === "string"
      ? object.subscription
      : typeof object.id === "string" && (event.type ?? "").startsWith("customer.subscription")
        ? object.id
        : null;

  const interval =
    (object.items as { data?: Array<{ price?: { interval?: string } }> } | undefined)?.data?.[0]?.price
      ?.interval ??
    (object.plan as { interval?: string } | undefined)?.interval ??
    (object.price as { interval?: string } | undefined)?.interval;

  const plan: SubscriptionPlan =
    metadata.plan === "annual" || interval === "year" ? "annual" : "monthly";
  const status = mapStatus(typeof object.status === "string" ? object.status : "none");
  const currentPeriodEnd =
    typeof object.current_period_end === "number"
      ? new Date(object.current_period_end * 1000)
      : null;

  return {
    accountRef,
    customerId,
    subscriptionId,
    plan,
    status,
    currentPeriodEnd,
  };
}
