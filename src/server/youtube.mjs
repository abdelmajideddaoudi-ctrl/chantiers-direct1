// Chantiers Direct — agent YouTube
// Rédige titre / description / tags d'un Short pour chaque chantier et l'envoie via l'API YouTube Data v3.
// Ne publie JAMAIS les coordonnées du client : uniquement les infos publiques du chantier.
import { env, getJSON, setJSON, departement, now } from "./core.mjs";
import { hashtagsFor, budgetLabel, slugTag } from "./instagram.mjs";

export const youtubeEnabled = () =>
  !!(env("YOUTUBE_CLIENT_ID") && env("YOUTUBE_CLIENT_SECRET") && env("YOUTUBE_REFRESH_TOKEN"));

const noAngle = (s) => String(s || "").replace(/[<>]/g, ""); // YouTube refuse < et >

// ---------- Textes ----------
export const buildTitle = (c) => {
  const dep = departement(c.codePostal);
  const suffix = ` – ${c.ville || "France"}${dep ? ` (${dep})` : ""} #Shorts`;
  const max = 100 - suffix.length;
  let t = noAngle(c.titre);
  if (t.length > max) t = t.slice(0, max - 1).trimEnd() + "…";
  return (t + suffix).slice(0, 100);
};

export const buildDescription = (c, { siteName = "Chantiers Direct", siteUrl = "", placesRestantes } = {}) => {
  const dep = departement(c.codePostal);
  const lines = [
    `Nouveau chantier disponible pour les professionnels : ${c.titre}`,
    "",
    `📍 Lieu : ${c.ville || "France"}${dep ? ` (${dep})` : ""}`,
    `🛠️ Métier : ${c.metier}`,
  ];
  const b = budgetLabel(c.budget);
  if (b) lines.push(`💶 Budget estimé : ${b}`);
  if (c.delai) lines.push(`⏱️ Délai : ${c.delai}`);
  if (Number.isFinite(placesRestantes)) {
    lines.push(placesRestantes > 0 ? `👷 Places restantes : ${placesRestantes}` : "👷 Complet");
  }
  if (c.resume) lines.push("", c.resume);
  lines.push(
    "",
    `Artisans, entreprises du bâtiment et prestataires : recevez des chantiers qualifiés près de chez vous avec ${siteName}.`,
  );
  if (siteUrl) lines.push(`👉 Voir le chantier : ${siteUrl}/#/chantier/${c.id}`, `👉 Tous les chantiers : ${siteUrl}/#/chantiers`);
  lines.push("", ["#Shorts", ...hashtagsFor(c).slice(0, 12)].join(" "));
  return noAngle(lines.join("\n")).slice(0, 5000);
};

export const buildTags = (c, siteName = "Chantiers Direct") => {
  const raw = [
    c.metier?.split("/")[0]?.trim(), c.ville, `travaux ${c.ville || ""}`.trim(), `artisan ${c.ville || ""}`.trim(),
    "chantier", "artisan", "BTP", "travaux", "devis travaux", "trouver des chantiers", "apporteur d'affaires", siteName,
    ...hashtagsFor(c).map((h) => h.slice(1)),
  ].filter(Boolean).map((t) => noAngle(t).replace(/,/g, " ").trim());
  const out = []; const seen = new Set(); let len = 0;
  for (const t of raw) {
    const k = slugTag(t);
    if (!k || seen.has(k)) continue;
    const cost = t.length + (t.includes(" ") ? 2 : 0) + (out.length ? 1 : 0); // règle YouTube : 500 caractères max
    if (len + cost > 480) break;
    seen.add(k); out.push(t); len += cost;
  }
  return out;
};

// ---------- Suivi ----------
export const getYtPost = (id) => getJSON(`ytpost:${id}`);
export const saveYtDraft = async (id, d) => {
  const rec = { ...((await getYtPost(id)) || { chantierId: id }), ...d, draftAt: now() };
  await setJSON(`ytpost:${id}`, rec);
  return rec;
};
export const markYtPublished = async (id, extra = {}) => {
  const rec = { ...((await getYtPost(id)) || { chantierId: id }), ...extra, publishedAt: now() };
  await setJSON(`ytpost:${id}`, rec);
  return rec;
};

// ---------- API YouTube ----------
async function accessToken() {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: env("YOUTUBE_CLIENT_ID"),
      client_secret: env("YOUTUBE_CLIENT_SECRET"),
      refresh_token: env("YOUTUBE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error("YouTube : connexion refusée (" + (d.error_description || d.error || r.status) + "). Vérifiez le jeton de rafraîchissement.");
  return d.access_token;
}

const ytError = async (r) => {
  const d = await r.json().catch(() => ({}));
  return new Error("YouTube : " + (d.error?.message || `erreur ${r.status}`));
};

export const uploadVideo = async ({ id, bytes, mime, title, description, tags, privacy = "public" }) => {
  if (!youtubeEnabled()) throw new Error("YouTube n'est pas configuré (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN).");
  const token = await accessToken();
  const meta = {
    snippet: { title, description, tags, categoryId: "22", defaultLanguage: "fr", defaultAudioLanguage: "fr" },
    status: { privacyStatus: ["public", "unlisted", "private"].includes(privacy) ? privacy : "public", selfDeclaredMadeForKids: false },
  };
  // Envoi « reprenable » en deux temps : métadonnées, puis la vidéo
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": mime,
      "x-upload-content-length": String(bytes.byteLength),
    },
    body: JSON.stringify(meta),
  });
  if (!init.ok) throw await ytError(init);
  const location = init.headers.get("location");
  if (!location) throw new Error("YouTube : adresse d'envoi manquante.");
  const up = await fetch(location, { method: "PUT", headers: { "content-type": mime }, body: bytes });
  if (!up.ok) throw await ytError(up);
  const video = await up.json();
  return markYtPublished(id, {
    videoId: video.id,
    url: `https://youtube.com/shorts/${video.id}`,
    title, description, privacy: meta.status.privacyStatus,
  });
};
