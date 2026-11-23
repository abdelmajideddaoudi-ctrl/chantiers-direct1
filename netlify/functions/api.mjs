// API de Chantiers Direct — toutes les routes /api/*
import {
  env, getJSON, setJSON, del, listJSON, listKeys, uid, now,
  getSettings, DEFAULT_SETTINGS, stripeEnabled, unlockPrice,
  hashPassword, checkPassword, makeToken, readToken, cookieHeader, readCookie,
  ADMIN_ID, isAdminConfigured, adminUser, getUser, saveUser, subActive, publicUser,
  chantierView, countUnlocks, grantUnlock, grantSubscription, recordPayment,
} from "../../src/server/core.mjs";
import { stripe, createCheckout, applySession, handleWebhook } from "../../src/server/stripe.mjs";
import {
  instagramEnabled, buildCaption, hashtagsFor, budgetLabel, saveImage, getImage, getPost, publishPost, markPublished,
} from "../../src/server/instagram.mjs";
import {
  youtubeEnabled, buildTitle, buildDescription, buildTags, getYtPost, saveYtDraft, markYtPublished, uploadVideo,
} from "../../src/server/youtube.mjs";

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const err = (message, status = 400) => json({ error: message }, status);

const METIERS = [
  "Maçonnerie / Gros œuvre", "Plomberie", "Électricité", "Peinture / Décoration", "Menuiserie",
  "Carrelage / Sols", "Toiture / Couverture", "Chauffage / Climatisation", "Isolation",
  "Rénovation complète", "Cuisine / Salle de bain", "Jardin / Paysagisme", "Serrurerie",
  "Façade / Ravalement", "Nettoyage", "Informatique / Réseaux", "Déménagement", "Autre",
];

const clean = (s, max = 2000) => String(s ?? "").trim().slice(0, max);
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

async function currentUser(req) {
  const id = readToken(readCookie(req));
  if (!id) return null;
  return getUser(id);
}

async function body(req) {
  try { return await req.json(); } catch { return {}; }
}

export default async (req, context) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
  const m = req.method;
  const seg = path.split("/").filter(Boolean);

  try {
    // ---------- Webhook Stripe ----------
    if (path === "/stripe/webhook" && m === "POST") return handleWebhook(req);

    // ---------- Visuel Instagram (public : l'API Instagram doit pouvoir le télécharger) ----------
    if (seg[0] === "ig" && seg[1] && seg.length === 2 && m === "GET") {
      const id = seg[1].replace(/\.jpe?g$/i, "");
      const img = /^[A-Za-z0-9]{1,40}$/.test(id) ? await getImage(id) : null;
      if (!img) return new Response("Introuvable", { status: 404 });
      return new Response(img, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=300" } });
    }

    const settings = await getSettings();
    const user = await currentUser(req);
    const isAdmin = user?.role === "admin";

    // ---------- Configuration publique ----------
    if (path === "/config" && m === "GET") {
      return json({
        siteName: settings.siteName,
        subscriptionPrice: settings.subscriptionPrice,
        commissionPercent: settings.commissionPercent,
        minUnlock: settings.minUnlock,
        maxUnlock: settings.maxUnlock,
        subscriberDiscount: settings.subscriberDiscount,
        contactEmail: settings.contactEmail,
        contactPhone: settings.contactPhone,
        stripe: stripeEnabled(),
        testMode: !stripeEnabled() && !!settings.testMode,
        metiers: METIERS,
      });
    }

    // ---------- Authentification ----------
    if (path === "/auth/register" && m === "POST") {
      const b = await body(req);
      const email = clean(b.email, 200).toLowerCase();
      if (!emailOk(email)) return err("Adresse e-mail invalide.");
      if (String(b.password || "").length < 8) return err("Le mot de passe doit contenir au moins 8 caractères.");
      if (!clean(b.nom)) return err("Indiquez votre nom.");
      if (!b.cgu) return err("Vous devez accepter les conditions générales.");
      if (email === env("ADMIN_EMAIL").toLowerCase()) return err("Cette adresse est réservée.");
      const id = uid(10);
      const claim = await setJSON(`email:${email}`, { id }, { onlyIfNew: true });
      if (claim && claim.modified === false) return err("Un compte existe déjà avec cette adresse.");
      const u = {
        id, email, role: "pro",
        nom: clean(b.nom, 120), entreprise: clean(b.entreprise, 160), siret: clean(b.siret, 20),
        telephone: clean(b.telephone, 30), metiers: Array.isArray(b.metiers) ? b.metiers.filter((x) => METIERS.includes(x)) : [],
        zone: clean(b.zone, 200), createdAt: now(),
        pw: hashPassword(b.password), subscription: { status: "none", until: 0 },
      };
      await saveUser(u);
      return json({ user: publicUser(u) }, 200, { "set-cookie": cookieHeader(makeToken(id), 30 * 86400) });
    }

    if (path === "/auth/login" && m === "POST") {
      const b = await body(req);
      const email = clean(b.email, 200).toLowerCase();
      const pw = String(b.password || "");
      if (isAdminConfigured() && email === env("ADMIN_EMAIL").toLowerCase()) {
        if (pw !== env("ADMIN_PASSWORD")) return err("E-mail ou mot de passe incorrect.", 401);
        return json({ user: adminUser() }, 200, { "set-cookie": cookieHeader(makeToken(ADMIN_ID, 7), 7 * 86400) });
      }
      const map = await getJSON(`email:${email}`);
      const u = map && (await getUser(map.id));
      if (!u || !checkPassword(pw, u.pw.salt, u.pw.hash)) return err("E-mail ou mot de passe incorrect.", 401);
      return json({ user: publicUser(u) }, 200, { "set-cookie": cookieHeader(makeToken(u.id), 30 * 86400) });
    }

    if (path === "/auth/logout" && m === "POST") return json({ ok: true }, 200, { "set-cookie": cookieHeader("x", 0) });

    if (path === "/auth/me" && m === "GET") return json({ user: user ? (isAdmin ? user : publicUser(user)) : null });

    if (path === "/me" && m === "PUT") {
      if (!user || isAdmin) return err("Connexion requise.", 401);
      const b = await body(req);
      for (const k of ["nom", "entreprise", "siret", "telephone", "zone"]) if (k in b) user[k] = clean(b[k], 200);
      if (Array.isArray(b.metiers)) user.metiers = b.metiers.filter((x) => METIERS.includes(x));
      if (b.newPassword) {
        if (!checkPassword(String(b.currentPassword || ""), user.pw.salt, user.pw.hash)) return err("Mot de passe actuel incorrect.");
        if (String(b.newPassword).length < 8) return err("Le nouveau mot de passe doit contenir au moins 8 caractères.");
        user.pw = hashPassword(b.newPassword);
      }
      await saveUser(user);
      return json({ user: publicUser(user) });
    }

    // ---------- Chantiers (public / pros) ----------
    if (path === "/chantiers" && m === "GET") {
      const all = await listJSON("chantier:");
      const q = clean(url.searchParams.get("q"), 100).toLowerCase();
      const metier = url.searchParams.get("metier") || "";
      const dep = clean(url.searchParams.get("dep"), 3);
      const sub = subActive(user);
      const mine = user && !isAdmin ? new Set((await listKeys(`ux:${user.id}:`)).map((k) => k.split(":")[2])) : new Set();
      let list = all.filter((c) => c.status === "ouvert");
      if (metier) list = list.filter((c) => c.metier === metier);
      if (q) list = list.filter((c) => `${c.titre} ${c.resume} ${c.ville}`.toLowerCase().includes(q));
      list.sort((a, b) => b.createdAt - a.createdAt);
      const views = await Promise.all(list.map(async (c) =>
        chantierView(c, { subscriber: sub, unlocked: mine.has(c.id), taken: await countUnlocks(c.id), settings })));
      return json({ chantiers: dep ? views.filter((v) => v.departement === dep || v.departement.startsWith(dep)) : views });
    }

    if (seg[0] === "chantiers" && seg[1] && seg.length === 2 && m === "GET") {
      const c = await getJSON(`chantier:${seg[1]}`);
      if (!c || (c.status === "archive" && !isAdmin)) return err("Chantier introuvable.", 404);
      const unlocked = !!(user && !isAdmin && (await getJSON(`unlock:${c.id}:${user.id}`)));
      return json({ chantier: chantierView(c, { subscriber: subActive(user), unlocked, admin: isAdmin, taken: await countUnlocks(c.id), settings }) });
    }

    if (path === "/me/unlocks" && m === "GET") {
      if (!user || isAdmin) return err("Connexion requise.", 401);
      const ids = (await listKeys(`ux:${user.id}:`)).map((k) => k.split(":")[2]);
      const cs = (await Promise.all(ids.map((id) => getJSON(`chantier:${id}`)))).filter(Boolean);
      return json({ chantiers: cs.map((c) => chantierView(c, { unlocked: true, subscriber: subActive(user), taken: 0, settings })) });
    }

    // ---------- Paiements ----------
    if (path === "/pay" && m === "POST") {
      if (!user || isAdmin) return err("Créez un compte professionnel ou connectez-vous pour continuer.", 401);
      const b = await body(req);
      let amount, chantier = null;
      if (b.type === "subscription") {
        if (subActive(user) && user.subscription.autoRenew) return err("Votre abonnement est déjà actif.");
        amount = Number(settings.subscriptionPrice);
      } else if (b.type === "unlock") {
        chantier = await getJSON(`chantier:${clean(b.chantierId, 40)}`);
        if (!chantier || chantier.status !== "ouvert") return err("Ce chantier n'est plus disponible.");
        if (await getJSON(`unlock:${chantier.id}:${user.id}`)) return err("Vous avez déjà accès à ce chantier.");
        const places = Number(chantier.places) || Number(settings.defaultPlaces) || 3;
        if ((await countUnlocks(chantier.id)) >= places) return err("Toutes les places de ce chantier ont été prises.");
        amount = unlockPrice(chantier, settings, subActive(user));
      } else return err("Type de paiement inconnu.");

      if (stripeEnabled()) {
        const session = await createCheckout({ origin: url.origin, user, type: b.type, chantier, amount, settings });
        return json({ url: session.url });
      }
      if (settings.testMode) {
        if (b.type === "unlock") await grantUnlock({ userId: user.id, chantierId: chantier.id, amount, method: "test (aucun paiement réel)" });
        else await grantSubscription({ userId: user.id, months: 1, amount, method: "test (aucun paiement réel)" });
        return json({ ok: true, test: true, type: b.type, chantierId: chantier?.id });
      }
      return err(`Le paiement en ligne n'est pas encore activé. Contactez-nous${settings.contactPhone ? " au " + settings.contactPhone : ""}${settings.contactEmail ? " ou à " + settings.contactEmail : ""} pour régler par virement ou autre moyen.`);
    }

    if (path === "/pay/confirm" && m === "GET") {
      if (!stripeEnabled()) return err("Stripe n'est pas configuré.");
      const sid = clean(url.searchParams.get("session_id"), 200);
      const s = await stripe("GET", `/checkout/sessions/${encodeURIComponent(sid)}`);
      if (!user || s.metadata?.userId !== user.id) return err("Session de paiement inconnue.", 403);
      const r = await applySession(s);
      return json({ ok: s.status === "complete", type: s.metadata?.type, chantierId: s.metadata?.chantierId, ...r });
    }

    if (path === "/subscription/cancel" && m === "POST") {
      if (!user || isAdmin) return err("Connexion requise.", 401);
      const s = user.subscription || {};
      if (s.stripeSubscriptionId && stripeEnabled()) {
        await stripe("POST", `/subscriptions/${s.stripeSubscriptionId}`, { cancel_at_period_end: "true" });
      }
      user.subscription = { ...s, autoRenew: false };
      await saveUser(user);
      return json({ user: publicUser(user) });
    }

    // ---------- Administration ----------
    if (seg[0] === "admin") {
      if (!isAdmin) return err("Accès réservé à l'administrateur.", 403);

      if (path === "/admin/chantiers" && m === "GET") {
        const all = await listJSON("chantier:");
        all.sort((a, b) => b.createdAt - a.createdAt);
        const views = await Promise.all(all.map(async (c) => chantierView(c, { admin: true, taken: await countUnlocks(c.id), settings })));
        return json({ chantiers: views });
      }

      if ((path === "/admin/chantiers" && m === "POST") || (seg[1] === "chantiers" && seg[2] && m === "PUT")) {
        const b = await body(req);
        const existing = seg[2] ? await getJSON(`chantier:${seg[2]}`) : null;
        if (seg[2] && !existing) return err("Chantier introuvable.", 404);
        if (!clean(b.titre)) return err("Le titre est obligatoire.");
        if (!METIERS.includes(b.metier)) return err("Choisissez un métier.");
        if (!b.consentement) return err("Confirmez que le client a accepté que ses coordonnées soient transmises à des professionnels.");
        const c = {
          ...(existing || { id: uid(8), createdAt: now() }),
          titre: clean(b.titre, 140), metier: b.metier, ville: clean(b.ville, 80), codePostal: clean(b.codePostal, 10),
          budget: Math.max(0, Number(b.budget) || 0), fixedPrice: Math.max(0, Number(b.fixedPrice) || 0) || "",
          delai: clean(b.delai, 80), resume: clean(b.resume, 300), description: clean(b.description, 5000),
          clientNom: clean(b.clientNom, 120), clientTelephone: clean(b.clientTelephone, 30), clientEmail: clean(b.clientEmail, 200),
          clientAdresse: clean(b.clientAdresse, 300), places: Math.max(1, Math.min(20, Number(b.places) || settings.defaultPlaces)),
          consentement: true, notes: clean(b.notes, 2000), status: ["ouvert", "pourvu", "archive"].includes(b.status) ? b.status : "ouvert",
          updatedAt: now(),
        };
        await setJSON(`chantier:${c.id}`, c);
        return json({ chantier: chantierView(c, { admin: true, taken: await countUnlocks(c.id), settings }) });
      }

      if (seg[1] === "chantiers" && seg[2] && m === "DELETE") {
        const c = await getJSON(`chantier:${seg[2]}`);
        if (!c) return err("Chantier introuvable.", 404);
        if ((await countUnlocks(c.id)) > 0) { c.status = "archive"; await setJSON(`chantier:${c.id}`, c); return json({ archived: true }); }
        await del(`chantier:${c.id}`);
        return json({ deleted: true });
      }

      if (path === "/admin/settings" && m === "GET") return json({ settings, stripe: stripeEnabled(), webhook: !!env("STRIPE_WEBHOOK_SECRET") });
      if (path === "/admin/settings" && m === "PUT") {
        const b = await body(req);
        const next = { ...settings };
        for (const k of ["subscriptionPrice", "commissionPercent", "minUnlock", "maxUnlock", "subscriberDiscount", "defaultPlaces"]) {
          if (k in b) next[k] = Math.max(0, Number(b[k]) || 0);
        }
        next.subscriberDiscount = Math.min(100, next.subscriberDiscount);
        for (const k of ["siteName", "contactEmail", "contactPhone"]) if (k in b) next[k] = clean(b[k], 120) || DEFAULT_SETTINGS[k];
        if ("testMode" in b) next.testMode = !!b.testMode;
        await setJSON("settings", next);
        return json({ settings: next });
      }

      if (path === "/admin/users" && m === "GET") {
        const users = (await listJSON("user:")).map(publicUser).sort((a, b) => b.createdAt - a.createdAt);
        return json({ users });
      }

      if (seg[1] === "users" && seg[2] && seg[3] === "grant" && m === "POST") {
        const b = await body(req);
        const target = await getUser(seg[2]);
        if (!target || target.id === ADMIN_ID) return err("Professionnel introuvable.", 404);
        const method = clean(b.method, 60) || "manuel";
        const amount = Math.max(0, Number(b.amount) || 0);
        if (b.type === "subscription") {
          const u = await grantSubscription({ userId: target.id, months: Math.max(1, Math.min(24, Number(b.months) || 1)), amount, method, ref: clean(b.ref, 100) });
          return json({ user: publicUser(u) });
        }
        if (b.type === "unlock") {
          const c = await getJSON(`chantier:${clean(b.chantierId, 40)}`);
          if (!c) return err("Chantier introuvable.", 404);
          const ok = await grantUnlock({ userId: target.id, chantierId: c.id, amount, method, ref: clean(b.ref, 100) });
          return ok ? json({ ok: true }) : err("Ce professionnel a déjà accès à ce chantier.");
        }
        if (b.type === "revoke-subscription") {
          target.subscription = { ...(target.subscription || {}), status: "none", until: 0, autoRenew: false };
          await saveUser(target);
          return json({ user: publicUser(target) });
        }
        return err("Action inconnue.");
      }

      if (path === "/admin/payments" && m === "GET") {
        const pays = (await listJSON("payment:")).sort((a, b) => b.createdAt - a.createdAt);
        const users = Object.fromEntries((await listJSON("user:")).map((u) => [u.id, u]));
        const chantiers = Object.fromEntries((await listJSON("chantier:")).map((c) => [c.id, c]));
        return json({
          payments: pays.map((p) => ({
            ...p,
            userLabel: users[p.userId] ? `${users[p.userId].nom}${users[p.userId].entreprise ? " – " + users[p.userId].entreprise : ""}` : p.userId,
            chantierLabel: p.chantierId ? chantiers[p.chantierId]?.titre || p.chantierId : "",
          })),
        });
      }

      // ---------- Agent Instagram ----------
      if (path === "/admin/instagram" && m === "GET") {
        const all = (await listJSON("chantier:")).filter((c) => c.status === "ouvert").sort((a, b) => b.createdAt - a.createdAt);
        const items = await Promise.all(all.map(async (c) => {
          const v = chantierView(c, { taken: await countUnlocks(c.id), settings });
          delete v.description; // jamais de description complète ni de coordonnées dans un post public
          return {
            chantier: { ...v, budgetLabel: budgetLabel(c.budget) },
            caption: buildCaption(c, { siteName: settings.siteName, placesRestantes: v.placesRestantes }),
            hashtags: hashtagsFor(c),
            post: await getPost(c.id),
          };
        }));
        return json({ items, enabled: instagramEnabled(), siteName: settings.siteName, siteUrl: url.origin });
      }

      if (seg[1] === "instagram" && seg[2] && seg[3] === "image" && m === "POST") {
        const c = await getJSON(`chantier:${seg[2]}`);
        if (!c) return err("Chantier introuvable.", 404);
        const b = await body(req);
        try { return json({ post: await saveImage(c.id, b.image) }); }
        catch (e) { return err(e.message); }
      }

      if (seg[1] === "instagram" && seg[2] && seg[3] === "publish" && m === "POST") {
        const c = await getJSON(`chantier:${seg[2]}`);
        if (!c) return err("Chantier introuvable.", 404);
        const b = await body(req);
        const caption = clean(b.caption, 2200) || buildCaption(c, { siteName: settings.siteName });
        if (b.manual) return json({ post: await markPublished(c.id, caption) });
        const p = await getPost(c.id);
        if (!p?.imageAt) return err("Générez d'abord le visuel du chantier.");
        if (p.publishedAt && !b.force) return err("Ce chantier a déjà été publié sur Instagram.");
        const imageUrl = `${url.origin}/api/ig/${c.id}.jpg?v=${p.imageAt}`;
        try { return json({ post: await publishPost({ id: c.id, caption, imageUrl }) }); }
        catch (e) { return err(e.message, 502); }
      }

      // ---------- Agent YouTube ----------
      if (path === "/admin/youtube" && m === "GET") {
        const all = (await listJSON("chantier:")).filter((c) => c.status === "ouvert").sort((a, b) => b.createdAt - a.createdAt);
        const items = await Promise.all(all.map(async (c) => {
          const v = chantierView(c, { taken: await countUnlocks(c.id), settings });
          delete v.description;
          return {
            chantier: { ...v, budgetLabel: budgetLabel(c.budget) },
            title: buildTitle(c),
            description: buildDescription(c, { siteName: settings.siteName, siteUrl: url.origin, placesRestantes: v.placesRestantes }),
            tags: buildTags(c, settings.siteName),
            post: await getYtPost(c.id),
          };
        }));
        return json({ items, enabled: youtubeEnabled(), siteName: settings.siteName });
      }

      if (seg[1] === "youtube" && seg[2] && ["draft", "upload", "manual"].includes(seg[3]) && m === "POST") {
        const c = await getJSON(`chantier:${seg[2]}`);
        if (!c) return err("Chantier introuvable.", 404);
        if (seg[3] === "draft") {
          // Textes choisis par l'administrateur, utilisés lors de l'envoi de la vidéo
          const b = await body(req);
          const title = clean(b.title, 100).replace(/[<>]/g, "") || buildTitle(c);
          const description = clean(b.description, 5000).replace(/[<>]/g, "");
          const tags = Array.isArray(b.tags) ? b.tags.map((t) => clean(t, 60).replace(/[<>,]/g, "")).filter(Boolean).slice(0, 40) : buildTags(c, settings.siteName);
          const privacy = ["public", "unlisted", "private"].includes(b.privacy) ? b.privacy : "public";
          return json({ post: await saveYtDraft(c.id, { title, description, tags, privacy }) });
        }
        if (seg[3] === "manual") return json({ post: await markYtPublished(c.id, { manual: true }) });
        // upload : corps = la vidéo brute (WebM ou MP4)
        const d = await getYtPost(c.id);
        if (!d?.draftAt) return err("Enregistrez d'abord le titre et la description.");
        if (d.publishedAt && url.searchParams.get("force") !== "1") return err("Ce chantier a déjà été publié sur YouTube.");
        const mime = (req.headers.get("content-type") || "").split(";")[0].trim();
        if (!["video/webm", "video/mp4"].includes(mime)) return err("Format vidéo non pris en charge (WebM ou MP4).");
        const bytes = await req.arrayBuffer();
        if (!bytes.byteLength) return err("Vidéo vide.");
        if (bytes.byteLength > 5.5 * 1024 * 1024) return err("Vidéo trop lourde (5,5 Mo max).");
        try {
          return json({ post: await uploadVideo({ id: c.id, bytes, mime, title: d.title, description: d.description, tags: d.tags, privacy: d.privacy }) });
        } catch (e) { return err(e.message, 502); }
      }

      if (path === "/admin/stats" && m === "GET") {
        const [pays, users, chantiers] = await Promise.all([listJSON("payment:"), listJSON("user:"), listJSON("chantier:")]);
        const d = new Date();
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
        const real = pays.filter((p) => !String(p.method).startsWith("test"));
        const sum = (arr) => Math.round(arr.reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100;
        const subscribers = users.filter(subActive);
        return json({
          revenueMonth: sum(real.filter((p) => p.createdAt >= monthStart)),
          revenueTotal: sum(real),
          revenueTestTotal: sum(pays.filter((p) => String(p.method).startsWith("test"))),
          mrr: Math.round(subscribers.filter((u) => u.subscription.autoRenew).length * Number(settings.subscriptionPrice) * 100) / 100,
          subscribers: subscribers.length,
          pros: users.length,
          chantiersOuverts: chantiers.filter((c) => c.status === "ouvert").length,
          chantiersTotal: chantiers.length,
          unlocks: pays.filter((p) => p.type === "unlock").length,
        });
      }
    }

    return err("Route inconnue.", 404);
  } catch (e) {
    console.error(e);
    return err("Erreur serveur : " + (e?.message || "inconnue"), 500);
  }
};

export const config = { path: "/api/*" };
