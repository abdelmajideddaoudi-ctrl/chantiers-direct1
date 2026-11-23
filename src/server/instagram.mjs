// Chantiers Direct — agent Instagram
// Rédige la légende d'un chantier, stocke son visuel et le publie via l'API Instagram (Graph API).
// Ne publie JAMAIS les coordonnées du client : uniquement les infos publiques du chantier.
import { env, store, getJSON, setJSON, departement, now } from "./core.mjs";

const GRAPH_VERSION = "v21.0";

// "graph.instagram.com" (Instagram API avec connexion Instagram) ou "graph.facebook.com" (via une Page Facebook)
const graphHost = () => env("INSTAGRAM_GRAPH_HOST") || "graph.instagram.com";
export const instagramEnabled = () => !!(env("INSTAGRAM_USER_ID") && env("INSTAGRAM_ACCESS_TOKEN"));

// ---------- Hashtags ----------
const METIER_TAGS = {
  "Maçonnerie / Gros œuvre": ["maconnerie", "grosoeuvre", "macon"],
  "Plomberie": ["plomberie", "plombier", "sanitaire"],
  "Électricité": ["electricite", "electricien", "renovationelectrique"],
  "Peinture / Décoration": ["peinture", "peintre", "decoration"],
  "Menuiserie": ["menuiserie", "menuisier", "bois"],
  "Carrelage / Sols": ["carrelage", "carreleur", "revetementdesol"],
  "Toiture / Couverture": ["toiture", "couvreur", "charpente"],
  "Chauffage / Climatisation": ["chauffage", "climatisation", "pompeachaleur"],
  "Isolation": ["isolation", "renovationenergetique", "isolationthermique"],
  "Rénovation complète": ["renovation", "renovationmaison", "travauxmaison"],
  "Cuisine / Salle de bain": ["salledebain", "cuisine", "renovationsalledebain"],
  "Jardin / Paysagisme": ["paysagiste", "jardin", "amenagementexterieur"],
  "Serrurerie": ["serrurerie", "serrurier", "metallerie"],
  "Façade / Ravalement": ["facade", "ravalement", "ravalementdefacade"],
  "Nettoyage": ["nettoyage", "proprete", "entreprisedenettoyage"],
  "Informatique / Réseaux": ["informatique", "reseau", "depannageinformatique"],
  "Déménagement": ["demenagement", "demenageur", "transport"],
};
const BASE_TAGS = ["chantier", "artisan", "artisanat", "btp", "travaux", "devis", "entrepreneur", "batiment"];

export const slugTag = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/gi, "oe").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

export const hashtagsFor = (c) => {
  const dep = departement(c.codePostal);
  const tags = [
    ...(METIER_TAGS[c.metier] || []),
    ...BASE_TAGS,
    c.ville ? slugTag(c.ville) : "",
    c.ville ? "artisan" + slugTag(c.ville) : "",
    dep && /^\d/.test(dep) ? "travaux" + dep : "",
  ].filter(Boolean);
  return [...new Set(tags)].slice(0, 20).map((t) => "#" + t); // Instagram autorise 30 hashtags max
};

// Budget arrondi pour ne pas révéler le montant exact
export const budgetLabel = (b) => {
  const n = Number(b) || 0;
  if (n <= 0) return "";
  const step = n < 2000 ? 100 : n < 20000 ? 500 : 1000;
  return "≈ " + (Math.round(n / step) * step).toLocaleString("fr-FR").replace(/ | /g, " ") + " €";
};

// ---------- Légende ----------
export const buildCaption = (c, { siteName = "Chantiers Direct", placesRestantes } = {}) => {
  const dep = departement(c.codePostal);
  const lines = [
    `🚧 NOUVEAU CHANTIER : ${c.titre}`,
    "",
    `📍 ${c.ville || "France"}${dep ? ` (${dep})` : ""}`,
    `🛠️ ${c.metier}`,
  ];
  const b = budgetLabel(c.budget);
  if (b) lines.push(`💶 Budget estimé : ${b}`);
  if (c.delai) lines.push(`⏱️ Délai : ${c.delai}`);
  if (Number.isFinite(placesRestantes)) {
    lines.push(placesRestantes > 0
      ? `👷 Seulement ${placesRestantes} place${placesRestantes > 1 ? "s" : ""} pour les pros`
      : "👷 Complet");
  }
  if (c.resume) lines.push("", c.resume);
  lines.push(
    "",
    `Vous êtes artisan ou entreprise dans le secteur ? Récupérez les coordonnées du client sur ${siteName} avant les autres.`,
    "👉 Lien en bio",
    "",
    hashtagsFor(c).join(" "),
  );
  return lines.join("\n").slice(0, 2200); // limite Instagram
};

// ---------- Visuel (JPEG fourni par le navigateur, servi publiquement pour l'API Instagram) ----------
export const imageKey = (id) => `igimg:${id}`;

export const saveImage = async (id, dataUrl) => {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) throw new Error("Image JPEG invalide.");
  const buf = Buffer.from(m[1], "base64");
  if (buf.length > 4 * 1024 * 1024) throw new Error("Image trop lourde (4 Mo max).");
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error("Image JPEG invalide.");
  await store().set(imageKey(id), buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  const rec = { ...((await getPost(id)) || { chantierId: id }), imageAt: now() };
  await setJSON(`igpost:${id}`, rec);
  return rec;
};

export const getImage = (id) => store().get(imageKey(id), { type: "arrayBuffer" });

export const getPost = (id) => getJSON(`igpost:${id}`);

// ---------- Publication ----------
async function graph(method, path, params = {}) {
  const url = new URL(`https://${graphHost()}/${GRAPH_VERSION}/${path}`);
  const form = new URLSearchParams({ ...params, access_token: env("INSTAGRAM_ACCESS_TOKEN") });
  let r;
  if (method === "GET") {
    for (const [k, v] of form) url.searchParams.set(k, v);
    r = await fetch(url);
  } else {
    r = await fetch(url, { method, body: form });
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error("Instagram : " + (data.error?.message || `erreur ${r.status}`));
  return data;
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

export const publishPost = async ({ id, caption, imageUrl }) => {
  if (!instagramEnabled()) throw new Error("Instagram n'est pas configuré (INSTAGRAM_USER_ID et INSTAGRAM_ACCESS_TOKEN).");
  const igUser = env("INSTAGRAM_USER_ID");
  const container = await graph("POST", `${igUser}/media`, { image_url: imageUrl, caption });
  // Attendre que le conteneur soit prêt (généralement immédiat pour une image)
  for (let i = 0; i < 8; i++) {
    const s = await graph("GET", container.id, { fields: "status_code" });
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error("Instagram a refusé l'image (" + s.status_code + ").");
    await sleep(1500);
  }
  const pub = await graph("POST", `${igUser}/media_publish`, { creation_id: container.id });
  let permalink = "";
  try { permalink = (await graph("GET", pub.id, { fields: "permalink" })).permalink || ""; } catch {}
  const rec = { ...((await getPost(id)) || { chantierId: id }), mediaId: pub.id, permalink, caption, publishedAt: now() };
  await setJSON(`igpost:${id}`, rec);
  return rec;
};

export const markPublished = async (id, caption) => {
  const rec = { ...((await getPost(id)) || { chantierId: id }), caption, publishedAt: now(), manual: true };
  await setJSON(`igpost:${id}`, rec);
  return rec;
};
