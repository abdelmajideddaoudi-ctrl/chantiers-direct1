// Chantiers Direct — logique serveur (stockage, sessions, mots de passe, tarifs)
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const env = (k) => {
  try {
    if (globalThis.Netlify?.env?.get) return globalThis.Netlify.env.get(k) || "";
  } catch {}
  return process.env[k] || "";
};

let _store;
export const store = () => (_store ||= getStore({ name: "chantiers-direct", consistency: "strong" }));

export const getJSON = (key) => store().get(key, { type: "json" });
export const setJSON = (key, val, opts) => store().setJSON(key, val, opts);
export const del = (key) => store().delete(key);
export const listKeys = async (prefix) => {
  const { blobs } = await store().list({ prefix });
  return blobs.map((b) => b.key);
};
export const listJSON = async (prefix) => {
  const keys = await listKeys(prefix);
  const out = await Promise.all(keys.map((k) => getJSON(k)));
  return out.filter(Boolean);
};

export const uid = (n = 10) => crypto.randomBytes(n).toString("base64url").replace(/[-_]/g, "").slice(0, n + 4);
export const now = () => Date.now();

// ---------- Réglages ----------
export const DEFAULT_SETTINGS = {
  siteName: "Chantiers Direct",
  subscriptionPrice: 49, // € TTC / mois
  commissionPercent: 3, // % du budget estimé du chantier
  minUnlock: 15, // € minimum par chantier
  maxUnlock: 150, // € maximum par chantier
  subscriberDiscount: 50, // % de remise sur le déblocage pour les abonnés
  defaultPlaces: 3, // nombre de professionnels max par chantier
  testMode: true, // paiements simulés tant que Stripe n'est pas branché
  contactEmail: "",
  contactPhone: "",
};
export const getSettings = async () => ({ ...DEFAULT_SETTINGS, ...((await getJSON("settings")) || {}) });

export const stripeEnabled = () => !!env("STRIPE_SECRET_KEY");

export const round2 = (x) => Math.round(x * 100) / 100;
export const unlockPrice = (chantier, settings, isSubscriber) => {
  let base = Number(chantier.fixedPrice) > 0
    ? Number(chantier.fixedPrice)
    : (Number(chantier.budget) || 0) * (Number(settings.commissionPercent) || 0) / 100;
  if (!(Number(chantier.fixedPrice) > 0)) {
    base = Math.max(Number(settings.minUnlock) || 0, base);
    if (Number(settings.maxUnlock) > 0) base = Math.min(Number(settings.maxUnlock), base);
  }
  const disc = isSubscriber ? (Number(settings.subscriberDiscount) || 0) / 100 : 0;
  return round2(base * (1 - disc));
};

// ---------- Mots de passe ----------
export const hashPassword = (pw, salt = crypto.randomBytes(16).toString("hex")) => {
  const hash = crypto.scryptSync(String(pw), salt, 64).toString("hex");
  return { salt, hash };
};
export const checkPassword = (pw, salt, hash) => {
  const h = crypto.scryptSync(String(pw), salt, 64);
  const ref = Buffer.from(hash, "hex");
  return ref.length === h.length && crypto.timingSafeEqual(h, ref);
};

// ---------- Sessions (jeton signé HMAC dans un cookie HttpOnly) ----------
const secret = () => env("SESSION_SECRET") || "dev-secret-a-changer";
const sign = (data) => crypto.createHmac("sha256", secret()).update(data).digest("base64url");
export const makeToken = (userId, days = 30) => {
  const body = Buffer.from(JSON.stringify({ u: userId, e: now() + days * 864e5 })).toString("base64url");
  return `${body}.${sign(body)}`;
};
export const readToken = (tok) => {
  if (!tok || !tok.includes(".")) return null;
  const [body, sig] = tok.split(".");
  const good = sign(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(body, "base64url").toString());
    return e > now() ? u : null;
  } catch {
    return null;
  }
};
export const COOKIE = "cd_session";
export const cookieHeader = (token, maxAgeSec) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
export const readCookie = (req, name = COOKIE) => {
  const c = req.headers.get("cookie") || "";
  const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
};

// ---------- Utilisateurs ----------
export const ADMIN_ID = "admin";
export const isAdminConfigured = () => !!(env("ADMIN_EMAIL") && env("ADMIN_PASSWORD"));
export const adminUser = () => ({ id: ADMIN_ID, role: "admin", email: env("ADMIN_EMAIL"), name: "Administrateur" });

export const getUser = async (id) => (id === ADMIN_ID ? adminUser() : await getJSON(`user:${id}`));
export const saveUser = (u) => setJSON(`user:${u.id}`, u);

export const subActive = (u) =>
  !!u?.subscription && u.subscription.status !== "none" && Number(u.subscription.until) > now();

export const publicUser = (u) => {
  if (!u) return null;
  const { pw, ...rest } = u;
  return { ...rest, subscriber: subActive(u) };
};

// ---------- Chantiers ----------
export const departement = (cp) => {
  const s = String(cp || "").trim();
  if (s.startsWith("97") || s.startsWith("98")) return s.slice(0, 3);
  if (s.startsWith("20")) return "2A/2B";
  return s.slice(0, 2);
};

export const countUnlocks = async (chantierId) => (await listKeys(`unlock:${chantierId}:`)).length;

export const chantierView = (c, { subscriber = false, unlocked = false, admin = false, taken = 0, settings }) => {
  const places = Number(c.places) || Number(settings.defaultPlaces) || 3;
  const view = {
    id: c.id,
    titre: c.titre,
    metier: c.metier,
    ville: c.ville,
    departement: departement(c.codePostal),
    budget: Number(c.budget) || 0,
    delai: c.delai || "",
    resume: c.resume || "",
    status: c.status,
    createdAt: c.createdAt,
    places,
    placesRestantes: Math.max(0, places - taken),
    prix: unlockPrice(c, settings, false),
    prixAbonne: unlockPrice(c, settings, true),
    unlocked,
  };
  if (subscriber || unlocked || admin) view.description = c.description || "";
  if (unlocked || admin) {
    view.client = {
      nom: c.clientNom || "",
      telephone: c.clientTelephone || "",
      email: c.clientEmail || "",
      adresse: c.clientAdresse || "",
      codePostal: c.codePostal || "",
    };
  }
  if (admin) {
    view.fixedPrice = c.fixedPrice || "";
    view.consentement = !!c.consentement;
    view.codePostal = c.codePostal || "";
    view.notes = c.notes || "";
  }
  return view;
};

// ---------- Paiements ----------
export const recordPayment = async (p) => {
  const id = `${new Date().toISOString()}-${uid(6)}`;
  const rec = { id, createdAt: now(), ...p };
  await setJSON(`payment:${id}`, rec);
  return rec;
};

export const grantUnlock = async ({ userId, chantierId, amount, method, ref }) => {
  const key = `unlock:${chantierId}:${userId}`;
  const res = await setJSON(key, { userId, chantierId, amount, method, ref: ref || "", at: now() }, { onlyIfNew: true });
  if (res && res.modified === false) return false; // déjà débloqué
  await setJSON(`ux:${userId}:${chantierId}`, { chantierId, at: now() });
  await recordPayment({ userId, type: "unlock", chantierId, amount, method, ref: ref || "" });
  return true;
};

export const grantSubscription = async ({ userId, months = 1, amount, method, ref, stripe }) => {
  const u = await getUser(userId);
  if (!u || u.id === ADMIN_ID) return null;
  const start = subActive(u) ? Number(u.subscription.until) : now();
  const until = start + months * 31 * 864e5;
  u.subscription = {
    ...(u.subscription || {}),
    status: "active",
    provider: stripe ? "stripe" : method,
    until,
    autoRenew: !!stripe,
    ...(stripe || {}),
  };
  await saveUser(u);
  if (amount !== undefined) await recordPayment({ userId, type: "subscription", amount, method, ref: ref || "", months });
  return u;
};
