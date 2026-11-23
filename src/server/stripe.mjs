// Intégration Stripe (API REST, sans SDK)
import crypto from "node:crypto";
import { env, getJSON, setJSON, getUser, saveUser, grantUnlock, grantSubscription, recordPayment, now } from "./core.mjs";

const flatten = (obj, prefix = "", out = []) => {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") flatten(v, key, out);
    else out.push([key, String(v)]);
  }
  return out;
};

export const stripe = async (method, path, params) => {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}` },
  };
  if (params) {
    opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
    opts.body = new URLSearchParams(flatten(params)).toString();
  }
  const r = await fetch(`https://api.stripe.com/v1${path}`, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `Erreur Stripe ${r.status}`);
  return data;
};

export const createCheckout = async ({ origin, user, type, chantier, amount, settings }) => {
  const cents = Math.round(amount * 100);
  const base = {
    customer_email: user.subscription?.stripeCustomerId ? undefined : user.email,
    customer: user.subscription?.stripeCustomerId || undefined,
    client_reference_id: user.id,
    locale: "fr",
    success_url: `${origin}/#/paiement-ok?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/#/${type === "unlock" ? "chantier/" + chantier.id : "tarifs"}`,
    metadata: { type, userId: user.id, chantierId: chantier?.id || "", amount: String(amount) },
  };
  if (type === "subscription") {
    return stripe("POST", "/checkout/sessions", {
      ...base,
      mode: "subscription",
      line_items: { 0: { quantity: 1, price_data: { currency: "eur", unit_amount: cents, recurring: { interval: "month" }, product_data: { name: `Abonnement Pro – ${settings.siteName}` } } } },
      subscription_data: { metadata: { userId: user.id } },
    });
  }
  return stripe("POST", "/checkout/sessions", {
    ...base,
    mode: "payment",
    line_items: { 0: { quantity: 1, price_data: { currency: "eur", unit_amount: cents, product_data: { name: `Accès au chantier : ${chantier.titre}`.slice(0, 120) } } } },
  });
};

// Applique une session Checkout payée (idempotent)
export const applySession = async (session) => {
  if (!session || session.status !== "complete") return { applied: false, reason: "incomplete" };
  if (session.mode === "payment" && session.payment_status !== "paid") return { applied: false, reason: "unpaid" };
  const flag = await setJSON(`stripe-session:${session.id}`, { at: now() }, { onlyIfNew: true });
  if (flag && flag.modified === false) return { applied: false, reason: "already" };
  const md = session.metadata || {};
  const amount = (session.amount_total || 0) / 100;
  if (md.type === "unlock") {
    await grantUnlock({ userId: md.userId, chantierId: md.chantierId, amount, method: "carte (Stripe)", ref: session.id });
  } else if (md.type === "subscription") {
    await grantSubscription({
      userId: md.userId,
      months: 1,
      amount,
      method: "carte (Stripe)",
      ref: session.id,
      stripe: { stripeCustomerId: session.customer, stripeSubscriptionId: session.subscription },
    });
    if (session.customer) await setJSON(`cust:${session.customer}`, { userId: md.userId });
  }
  return { applied: true, type: md.type, chantierId: md.chantierId };
};

const verifySig = (raw, header, secret) => {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) return false;
  const exp = crypto.createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  return sigs.some((s) => s.length === exp.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(exp)));
};

export const handleWebhook = async (req) => {
  const raw = await req.text();
  const secret = env("STRIPE_WEBHOOK_SECRET");
  if (!secret || !verifySig(raw, req.headers.get("stripe-signature") || "", secret)) {
    return new Response("Signature invalide", { status: 400 });
  }
  const evt = JSON.parse(raw);
  const first = await setJSON(`stripe-evt:${evt.id}`, { at: now(), type: evt.type }, { onlyIfNew: true });
  if (first && first.modified === false) return Response.json({ received: true, duplicate: true });
  const obj = evt.data.object;
  if (evt.type === "checkout.session.completed" || evt.type === "checkout.session.async_payment_succeeded") {
    await applySession(obj);
  } else if (evt.type === "invoice.paid" && obj.billing_reason === "subscription_cycle") {
    const map = await getJSON(`cust:${obj.customer}`);
    if (map?.userId) {
      const u = await getUser(map.userId);
      const end = obj.lines?.data?.[0]?.period?.end;
      if (u) {
        u.subscription = { ...(u.subscription || {}), status: "active", until: end ? end * 1000 + 864e5 : now() + 31 * 864e5 };
        await saveUser(u);
        await recordPayment({ userId: u.id, type: "subscription", amount: (obj.amount_paid || 0) / 100, method: "carte (Stripe)", ref: obj.id, months: 1 });
      }
    }
  } else if (evt.type === "customer.subscription.deleted") {
    const map = await getJSON(`cust:${obj.customer}`);
    if (map?.userId) {
      const u = await getUser(map.userId);
      if (u?.subscription) {
        u.subscription.autoRenew = false;
        u.subscription.status = "canceled";
        u.subscription.until = Math.min(Number(u.subscription.until) || now(), (obj.current_period_end || obj.ended_at || now() / 1000) * 1000);
        await saveUser(u);
      }
    }
  }
  return Response.json({ received: true });
};
