/* Chantiers Direct — application (page unique) */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const app = $("#app");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const eur = (n) => Number(n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: Number(n) % 1 ? 2 : 0 });
  const dateFr = (t) => (t ? new Date(Number(t)).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "");
  const state = { user: null, config: null };

  async function api(path, opts = {}) {
    const r = await fetch("/api" + path, {
      method: opts.method || "GET",
      headers: opts.body ? { "content-type": "application/json" } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    });
    let data = {};
    try { data = await r.json(); } catch {}
    if (!r.ok) throw new Error(data.error || "Une erreur est survenue.");
    return data;
  }

  function toast(msg, error = false) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "toast" + (error ? " error" : "");
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.hidden = true), 4200);
  }

  const formData = (form) => {
    const o = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === "checkbox" && el.dataset.multi) { (o[el.name] ||= []); if (el.checked) o[el.name].push(el.value); }
      else if (el.type === "checkbox") o[el.name] = el.checked;
      else o[el.name] = el.value;
    }
    return o;
  };

  function bindForm(form, handler) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("[type=submit]");
      if (btn) btn.disabled = true;
      try { await handler(formData(form)); }
      catch (er) { toast(er.message, true); }
      finally { if (btn) btn.disabled = false; }
    });
  }

  // ---------- Navigation ----------
  function renderNav() {
    const u = state.user;
    const route = location.hash || "#/";
    const link = (href, label, cls = "") => `<a href="${href}" class="${cls} ${route.startsWith(href) && href !== "#/" ? "active" : ""}">${label}</a>`;
    let html = link("#/chantiers", "Chantiers") + link("#/tarifs", "Tarifs");
    if (!u) html += link("#/connexion", "Connexion") + link("#/inscription", "Je suis professionnel", "cta");
    else if (u.role === "admin") html += link("#/admin", "Administration", "cta") + `<button class="linklike" id="logout">Déconnexion</button>`;
    else html += link("#/compte", "Mon compte", "cta") + `<button class="linklike" id="logout">Déconnexion</button>`;
    $("#nav").innerHTML = html;
    $("#logout")?.addEventListener("click", async () => { await api("/auth/logout", { method: "POST" }); state.user = null; location.hash = "#/"; renderNav(); toast("Vous êtes déconnecté."); });
  }
  $("#burger").addEventListener("click", () => $("#nav").classList.toggle("open"));

  // ---------- Pages ----------
  const metierOptions = (sel = "", all = true) =>
    (all ? `<option value="">Tous les métiers</option>` : `<option value="">Choisir…</option>`) +
    state.config.metiers.map((m) => `<option ${m === sel ? "selected" : ""}>${esc(m)}</option>`).join("");

  function jobCard(c) {
    const sub = state.user?.subscriber;
    const price = sub ? c.prixAbonne : c.prix;
    return `<a class="card job" href="#/chantier/${c.id}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
        <span class="badge orange">${esc(c.metier)}</span>
        ${c.unlocked ? `<span class="badge green">Débloqué</span>` : c.placesRestantes === 0 ? `<span class="badge red">Complet</span>` : `<span class="badge gray">${c.placesRestantes} place${c.placesRestantes > 1 ? "s" : ""} restante${c.placesRestantes > 1 ? "s" : ""}</span>`}
      </div>
      <h3>${esc(c.titre)}</h3>
      <div class="meta"><span>📍 ${esc(c.ville)} (${esc(c.departement)})</span>${c.budget ? `<span>💶 Budget estimé ${eur(c.budget)}</span>` : ""}${c.delai ? `<span>⏱ ${esc(c.delai)}</span>` : ""}</div>
      <p class="muted small" style="margin:0">${esc(c.resume)}</p>
      <div class="foot"><span class="muted small">Publié le ${dateFr(c.createdAt)}</span><span class="price">${c.unlocked ? "Voir le contact" : eur(price)}</span></div>
    </a>`;
  }

  async function pageHome() {
    const cfg = state.config;
    let latest = [];
    try { latest = (await api("/chantiers")).chantiers.slice(0, 3); } catch {}
    app.innerHTML = `
      <section class="hero">
        <div>
          <h1>Des chantiers qualifiés, prêts à être signés.</h1>
          <p>Artisans, entreprises du bâtiment et prestataires de services : accédez à des demandes de travaux vérifiées près de chez vous, avec les coordonnées directes du client.</p>
          <div class="actions">
            <a class="btn" href="#/chantiers">Voir les chantiers disponibles</a>
            <a class="btn secondary" href="#/tarifs">Découvrir les tarifs</a>
          </div>
        </div>
        <div class="hero-panel">
          ${(latest.length ? latest : [{ titre: "Vos prochains chantiers apparaîtront ici", ville: "Île-de-France", departement: "", metier: "Tous métiers" }]).map((c) => `
            <div class="mini"><div><strong>${esc(c.titre)}</strong><span class="muted small">${esc(c.metier)} · ${esc(c.ville)}</span></div>${c.budget ? `<span class="badge orange">${eur(c.budget)}</span>` : ""}</div>`).join("")}
        </div>
      </section>
      <h2>Comment ça marche ?</h2>
      <div class="steps">
        <div class="card step"><div class="num">1</div><h3>Créez votre compte pro</h3><p class="muted">Inscription gratuite en 1 minute : votre métier, votre zone d'intervention, vos coordonnées.</p></div>
        <div class="card step"><div class="num">2</div><h3>Choisissez vos chantiers</h3><p class="muted">Parcourez les demandes par métier et par département. Chaque chantier est limité à quelques professionnels.</p></div>
        <div class="card step"><div class="num">3</div><h3>Contactez le client</h3><p class="muted">Réglez l'accès par carte bancaire et obtenez immédiatement le nom, le téléphone et l'adresse du client.</p></div>
      </div>
      <div class="section-title"><h2 style="margin:0">Tous les métiers</h2><a href="#/chantiers">Voir tous les chantiers →</a></div>
      <div class="cats">${cfg.metiers.map((m) => `<a href="#/chantiers?metier=${encodeURIComponent(m)}">${esc(m)}</a>`).join("")}</div>
      <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
        <div><h3 style="margin:0 0 4px">Abonnement Pro : ${eur(cfg.subscriptionPrice)} / mois</h3><p class="muted" style="margin:0">Descriptions complètes de tous les chantiers et ${cfg.subscriberDiscount} % de remise sur chaque accès.</p></div>
        <a class="btn dark" href="#/tarifs">Voir les formules</a>
      </div>`;
  }

  async function pageList(params) {
    const metier = params.get("metier") || "";
    app.innerHTML = `
      <div class="section-title"><div><h1 style="margin:0">Chantiers disponibles</h1><p class="muted" style="margin:.3em 0 0">Les coordonnées du client sont visibles après déblocage du chantier.</p></div></div>
      <form class="filters" id="f">
        <input type="search" name="q" placeholder="Rechercher (ville, type de travaux…)" value="${esc(params.get("q") || "")}">
        <select name="metier">${metierOptions(metier)}</select>
        <input name="dep" placeholder="Département (ex. 92)" maxlength="3" value="${esc(params.get("dep") || "")}">
        <button class="btn" type="submit">Filtrer</button>
      </form>
      <div id="results" class="list"><p class="muted">Chargement…</p></div>`;
    $("#f").addEventListener("submit", (e) => {
      e.preventDefault();
      const d = formData(e.target);
      const p = new URLSearchParams(Object.entries(d).filter(([, v]) => v));
      location.hash = "#/chantiers" + (p.toString() ? "?" + p : "");
    });
    const q = new URLSearchParams();
    for (const k of ["q", "metier", "dep"]) if (params.get(k)) q.set(k, params.get(k));
    const { chantiers } = await api("/chantiers?" + q);
    $("#results").innerHTML = chantiers.length ? chantiers.map(jobCard).join("") :
      `<div class="card empty" style="grid-column:1/-1"><h3>Aucun chantier ne correspond pour le moment</h3><p>De nouveaux chantiers sont ajoutés régulièrement. ${state.user ? "" : `<a href="#/inscription">Créez votre compte</a> pour ne rien manquer.`}</p></div>`;
  }

  async function pageDetail(id) {
    const { chantier: c } = await api("/chantiers/" + id);
    const u = state.user;
    const sub = !!u?.subscriber;
    const price = sub ? c.prixAbonne : c.prix;
    const full = c.placesRestantes === 0 && !c.unlocked;
    let action;
    if (c.unlocked) {
      action = `<h3>Coordonnées du client</h3><div class="contact"><dl class="kv">
        <dt>Nom</dt><dd>${esc(c.client.nom) || "—"}</dd>
        <dt>Téléphone</dt><dd>${c.client.telephone ? `<a href="tel:${esc(c.client.telephone)}">${esc(c.client.telephone)}</a>` : "—"}</dd>
        <dt>E-mail</dt><dd>${c.client.email ? `<a href="mailto:${esc(c.client.email)}">${esc(c.client.email)}</a>` : "—"}</dd>
        <dt>Adresse</dt><dd>${esc(c.client.adresse)} ${esc(c.client.codePostal)} ${esc(c.ville)}</dd></dl></div>
        <p class="muted small" style="margin-top:12px">Contactez le client rapidement : les premiers professionnels à rappeler signent le plus souvent.</p>`;
    } else if (u?.role === "admin") {
      action = `<p>Vous êtes administrateur.</p><a class="btn" href="#/admin/chantier/${c.id}">Modifier ce chantier</a>`;
    } else {
      action = `<h3>Accéder au chantier</h3>
        <p class="price" style="font-size:30px;margin:0">${eur(price)}</p>
        <p class="muted small">${sub ? `Tarif abonné (−${state.config.subscriberDiscount} %). Prix sans abonnement : ${eur(c.prix)}.` : `Abonnés Pro : ${eur(c.prixAbonne)} seulement.`}</p>
        <button class="btn" style="width:100%" id="unlock" ${full ? "disabled" : ""}>${full ? "Chantier complet" : u ? "Débloquer les coordonnées" : "Se connecter pour débloquer"}</button>
        <p class="muted small" style="margin-top:12px">${c.placesRestantes} place${c.placesRestantes > 1 ? "s" : ""} restante${c.placesRestantes > 1 ? "s" : ""} sur ${c.places}. Paiement sécurisé par carte bancaire.</p>
        ${!sub ? `<a href="#/tarifs" class="small">Économisez avec l'abonnement Pro →</a>` : ""}`;
    }
    app.innerHTML = `
      <p><a href="#/chantiers">← Retour aux chantiers</a></p>
      <div class="detail">
        <div class="card">
          <span class="badge orange">${esc(c.metier)}</span>
          <h1 style="font-size:30px;margin-top:12px">${esc(c.titre)}</h1>
          <dl class="kv" style="margin-bottom:20px">
            <dt>Localisation</dt><dd>${esc(c.ville)} (${esc(c.departement)})</dd>
            ${c.budget ? `<dt>Budget estimé</dt><dd>${eur(c.budget)}</dd>` : ""}
            ${c.delai ? `<dt>Délai souhaité</dt><dd>${esc(c.delai)}</dd>` : ""}
            <dt>Publié le</dt><dd>${dateFr(c.createdAt)}</dd>
          </dl>
          <h3>Résumé</h3><p>${esc(c.resume)}</p>
          <h3>Description complète</h3>
          ${c.description !== undefined ? `<p style="white-space:pre-line">${esc(c.description) || "—"}</p>` :
            `<div class="locked">🔒 La description complète est réservée aux abonnés Pro et aux professionnels qui ont débloqué ce chantier.<br><a href="#/tarifs">Voir l'abonnement Pro</a></div>`}
        </div>
        <div class="card sticky">${action}</div>
      </div>`;
    $("#unlock")?.addEventListener("click", async () => {
      if (!state.user) { sessionStorage.setItem("after", location.hash); location.hash = "#/connexion"; return; }
      confirmPay(`Débloquer « ${c.titre} » pour ${eur(price)} ?`, () => pay({ type: "unlock", chantierId: c.id }));
    });
  }

  function confirmPay(text, onOk) {
    const testMode = state.config.testMode;
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<div class="card modal"><h3>Confirmer le paiement</h3><p>${esc(text)}</p>
      ${testMode ? `<div class="notice">Mode test : aucun paiement réel ne sera effectué.</div>` : state.config.stripe ? `<p class="muted small">Vous allez être redirigé vers la page de paiement sécurisée Stripe (carte bancaire, Apple Pay, Google Pay…).</p>` : ""}
      <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn secondary" data-x>Annuler</button><button class="btn" data-ok>Continuer</button></div></div>`;
    document.body.appendChild(bg);
    bg.addEventListener("click", (e) => { if (e.target === bg || e.target.dataset.x !== undefined) bg.remove(); });
    bg.querySelector("[data-ok]").addEventListener("click", async (e) => { e.target.disabled = true; try { await onOk(); } finally { bg.remove(); } });
  }

  async function pay(payload) {
    try {
      const r = await api("/pay", { method: "POST", body: payload });
      if (r.url) { location.href = r.url; return; }
      await refreshMe();
      toast(payload.type === "unlock" ? "Chantier débloqué !" : "Abonnement Pro activé !");
      location.hash = payload.type === "unlock" ? "#/chantier/" + payload.chantierId : "#/compte";
      route();
    } catch (e) { toast(e.message, true); }
  }

  async function pagePaymentOk(params) {
    app.innerHTML = `<div class="card narrow"><h2>Validation du paiement…</h2><p class="muted">Merci de patienter quelques secondes.</p></div>`;
    try {
      const r = await api("/pay/confirm?session_id=" + encodeURIComponent(params.get("session_id") || ""));
      await refreshMe();
      if (r.ok) {
        app.innerHTML = `<div class="card narrow"><h2>Paiement confirmé ✅</h2><p>${r.type === "unlock" ? "Les coordonnées du client sont maintenant disponibles." : "Votre abonnement Pro est actif."}</p>
          <a class="btn" href="${r.type === "unlock" ? "#/chantier/" + r.chantierId : "#/compte"}">${r.type === "unlock" ? "Voir le chantier" : "Aller à mon compte"}</a></div>`;
      } else throw new Error("Le paiement n'a pas été finalisé.");
    } catch (e) {
      app.innerHTML = `<div class="card narrow"><h2>Paiement non confirmé</h2><p>${esc(e.message)}</p><a class="btn" href="#/compte">Mon compte</a></div>`;
    }
  }

  function pagePricing() {
    const c = state.config;
    const sub = state.user?.subscriber;
    app.innerHTML = `
      <div style="text-align:center;margin-bottom:28px"><h1>Des tarifs simples, sans engagement</h1><p class="muted">Inscription gratuite. Vous ne payez que pour les chantiers qui vous intéressent, ou vous choisissez l'abonnement.</p></div>
      <div class="plans">
        <div class="card plan"><h3>Découverte</h3><div class="amount">0 €</div><p class="muted">Pour essayer</p>
          <ul><li>Accès à la liste des chantiers</li><li>Résumé, ville et budget estimé</li><li>Déblocage à l'unité : ${c.commissionPercent} % du budget estimé (de ${eur(c.minUnlock)} à ${eur(c.maxUnlock)})</li></ul>
          <a class="btn secondary" href="${state.user ? "#/chantiers" : "#/inscription"}">${state.user ? "Voir les chantiers" : "Créer mon compte gratuit"}</a></div>
        <div class="card plan featured"><h3>Pro</h3><div class="amount">${eur(c.subscriptionPrice)}<span class="muted" style="font-size:16px;font-weight:500"> / mois</span></div><p class="muted">Pour les professionnels actifs</p>
          <ul><li>Description complète de tous les chantiers</li><li><strong>−${c.subscriberDiscount} %</strong> sur chaque déblocage</li><li>Paiement mensuel par carte, résiliable à tout moment</li></ul>
          <button class="btn" id="subscribe" ${sub ? "disabled" : ""}>${sub ? "Abonnement actif" : "Je m'abonne"}</button></div>
        <div class="card plan"><h3>À l'unité</h3><div class="amount">${c.commissionPercent} %</div><p class="muted">du budget estimé du chantier</p>
          <ul><li>Sans abonnement</li><li>Prix affiché avant chaque achat</li><li>Coordonnées complètes du client immédiatement</li></ul>
          <a class="btn secondary" href="#/chantiers">Choisir un chantier</a></div>
      </div>
      <div class="card medium"><h3>Questions fréquentes</h3>
        <p><strong>Combien de professionnels reçoivent le même chantier ?</strong><br>Chaque chantier est limité à un petit nombre de professionnels (indiqué sur la fiche) pour vous laisser une vraie chance de le signer.</p>
        <p><strong>Comment se fait le paiement ?</strong><br>Par carte bancaire sur une page sécurisée. ${c.contactEmail || c.contactPhone ? `Pour un règlement par virement ou autre moyen, contactez-nous${c.contactPhone ? " au " + esc(c.contactPhone) : ""}${c.contactEmail ? " ou à " + esc(c.contactEmail) : ""}.` : "Un règlement par virement est possible sur demande."}</p>
        <p style="margin:0"><strong>Puis-je résilier l'abonnement ?</strong><br>Oui, depuis votre compte, en un clic. Il reste actif jusqu'à la fin de la période payée.</p></div>`;
    $("#subscribe")?.addEventListener("click", () => {
      if (!state.user) { sessionStorage.setItem("after", "#/tarifs"); location.hash = "#/inscription"; return; }
      if (state.user.role === "admin") return toast("L'administrateur n'a pas besoin d'abonnement.", true);
      confirmPay(`Souscrire à l'abonnement Pro pour ${eur(c.subscriptionPrice)} par mois ?`, () => pay({ type: "subscription" }));
    });
  }

  function afterLogin() {
    const next = sessionStorage.getItem("after");
    sessionStorage.removeItem("after");
    location.hash = next || (state.user.role === "admin" ? "#/admin" : "#/compte");
  }

  function pageLogin() {
    app.innerHTML = `<div class="card narrow"><h2>Connexion</h2>
      <form id="f"><div class="field"><label>E-mail</label><input name="email" type="email" required autocomplete="email"></div>
      <div class="field"><label>Mot de passe</label><input name="password" type="password" required autocomplete="current-password"></div>
      <button class="btn" type="submit" style="width:100%">Se connecter</button></form>
      <p class="muted small" style="margin-top:16px">Pas encore de compte ? <a href="#/inscription">Inscription gratuite</a></p></div>`;
    bindForm($("#f"), async (d) => { const r = await api("/auth/login", { method: "POST", body: d }); state.user = r.user; renderNav(); toast("Bienvenue !"); afterLogin(); });
  }

  function pageRegister() {
    app.innerHTML = `<div class="card medium"><h2>Créer mon compte professionnel</h2><p class="muted">Gratuit et sans engagement.</p>
      <form id="f">
        <div class="grid2">
          <div class="field"><label>Nom et prénom *</label><input name="nom" required></div>
          <div class="field"><label>Entreprise</label><input name="entreprise"></div>
          <div class="field"><label>E-mail *</label><input name="email" type="email" required autocomplete="email"></div>
          <div class="field"><label>Téléphone</label><input name="telephone" type="tel"></div>
          <div class="field"><label>SIRET</label><input name="siret" inputmode="numeric"></div>
          <div class="field"><label>Zone d'intervention</label><input name="zone" placeholder="ex. Hauts-de-Seine, Paris"></div>
        </div>
        <div class="field"><label>Vos métiers</label><div class="chips">${state.config.metiers.map((m) => `<label><input type="checkbox" name="metiers" data-multi="1" value="${esc(m)}">${esc(m)}</label>`).join("")}</div></div>
        <div class="field"><label>Mot de passe * (8 caractères minimum)</label><input name="password" type="password" minlength="8" required autocomplete="new-password"></div>
        <div class="field"><label class="check"><input type="checkbox" name="cgu" required> J'accepte les <a href="#/legal/cgv" target="_blank">conditions générales</a> et la <a href="#/legal/confidentialite" target="_blank">politique de confidentialité</a>.</label></div>
        <button class="btn" type="submit">Créer mon compte</button>
      </form></div>`;
    bindForm($("#f"), async (d) => { const r = await api("/auth/register", { method: "POST", body: d }); state.user = r.user; renderNav(); toast("Compte créé, bienvenue !"); afterLogin(); });
  }

  async function pageAccount() {
    if (!state.user) { location.hash = "#/connexion"; return; }
    if (state.user.role === "admin") { location.hash = "#/admin"; return; }
    await refreshMe();
    const u = state.user;
    const s = u.subscription || {};
    const { chantiers } = await api("/me/unlocks");
    app.innerHTML = `
      <h1>Bonjour ${esc(u.nom)}</h1>
      <div class="grid2" style="gap:18px;align-items:start">
        <div class="card"><h3>Mon abonnement</h3>
          ${u.subscriber ? `<p><span class="badge green">Pro actif</span></p><p>${s.autoRenew ? "Renouvellement automatique le" : "Actif jusqu'au"} <strong>${dateFr(s.until)}</strong>.</p>
            ${s.autoRenew ? `<button class="btn danger sm" id="cancel">Résilier l'abonnement</button>` : `<p class="muted small">Le renouvellement automatique est désactivé.</p><button class="btn sm" id="resub">Réactiver l'abonnement</button>`}`
          : `<p><span class="badge gray">Formule Découverte</span></p><p class="muted">Passez Pro pour voir toutes les descriptions et payer −${state.config.subscriberDiscount} % sur chaque chantier.</p><a class="btn" href="#/tarifs">Passer Pro – ${eur(state.config.subscriptionPrice)}/mois</a>`}
        </div>
        <div class="card"><h3>Mes informations</h3>
          <form id="f">
            <div class="field"><label>Nom</label><input name="nom" value="${esc(u.nom)}"></div>
            <div class="field"><label>Entreprise</label><input name="entreprise" value="${esc(u.entreprise)}"></div>
            <div class="grid2"><div class="field"><label>Téléphone</label><input name="telephone" value="${esc(u.telephone)}"></div><div class="field"><label>SIRET</label><input name="siret" value="${esc(u.siret)}"></div></div>
            <div class="field"><label>Zone d'intervention</label><input name="zone" value="${esc(u.zone)}"></div>
            <details style="margin-bottom:14px"><summary class="small">Changer de mot de passe</summary>
              <div class="field" style="margin-top:10px"><label>Mot de passe actuel</label><input type="password" name="currentPassword"></div>
              <div class="field"><label>Nouveau mot de passe</label><input type="password" name="newPassword" minlength="8"></div></details>
            <button class="btn sm" type="submit">Enregistrer</button>
          </form>
        </div>
      </div>
      <h2 style="margin-top:32px">Mes chantiers débloqués (${chantiers.length})</h2>
      <div class="list">${chantiers.length ? chantiers.map(jobCard).join("") : `<div class="card empty" style="grid-column:1/-1">Vous n'avez encore débloqué aucun chantier. <a href="#/chantiers">Voir les chantiers</a></div>`}</div>`;
    bindForm($("#f"), async (d) => { const r = await api("/me", { method: "PUT", body: d }); state.user = r.user; toast("Informations enregistrées."); });
    $("#cancel")?.addEventListener("click", async () => {
      if (!confirm("Résilier l'abonnement ? Il restera actif jusqu'à la fin de la période payée.")) return;
      try { await api("/subscription/cancel", { method: "POST" }); toast("Abonnement résilié."); pageAccount(); } catch (e) { toast(e.message, true); }
    });
    $("#resub")?.addEventListener("click", () => confirmPay(`Réactiver l'abonnement Pro pour ${eur(state.config.subscriptionPrice)} par mois ?`, () => pay({ type: "subscription" })));
  }

  // ---------- Administration ----------
  function adminTabs(active) {
    const t = [["#/admin", "Tableau de bord"], ["#/admin/chantiers", "Chantiers"], ["#/admin/pros", "Professionnels"], ["#/admin/paiements", "Paiements"], ["#/admin/instagram", "Instagram"], ["#/admin/youtube", "YouTube"], ["#/admin/reglages", "Réglages"]];
    return `<h1>Administration</h1><nav class="tabs">${t.map(([h, l]) => `<a href="${h}" class="${h === active ? "active" : ""}">${l}</a>`).join("")}</nav>`;
  }
  const requireAdmin = () => { if (state.user?.role !== "admin") { location.hash = "#/connexion"; return false; } return true; };

  async function adminDashboard() {
    if (!requireAdmin()) return;
    const [s, set] = await Promise.all([api("/admin/stats"), api("/admin/settings")]);
    app.innerHTML = adminTabs("#/admin") + `
      ${!set.stripe ? `<div class="notice"><strong>Paiement par carte non activé.</strong> ${set.settings.testMode ? "Le mode test est actif : les pros peuvent simuler un paiement (aucun argent encaissé)." : "Le mode test est désactivé : les pros sont invités à vous contacter pour payer."} Ajoutez vos clés Stripe dans Netlify pour encaisser de vrais paiements.</div>` : !set.webhook ? `<div class="notice">Stripe est branché. Ajoutez aussi le secret du webhook (STRIPE_WEBHOOK_SECRET) pour suivre automatiquement les renouvellements d'abonnement.</div>` : ""}
      <div class="stats">
        <div class="card stat"><div class="v">${eur(s.revenueMonth)}</div><div class="l">Encaissé ce mois-ci</div></div>
        <div class="card stat"><div class="v">${eur(s.mrr)}</div><div class="l">Revenu mensuel récurrent (abonnements)</div></div>
        <div class="card stat"><div class="v">${s.subscribers}</div><div class="l">Abonnés Pro actifs / ${s.pros} pros inscrits</div></div>
        <div class="card stat"><div class="v">${s.chantiersOuverts}</div><div class="l">Chantiers ouverts / ${s.chantiersTotal} au total</div></div>
      </div>
      <div class="grid2" style="gap:18px">
        <div class="card"><h3>Total encaissé</h3><p class="price" style="font-size:28px;margin:0">${eur(s.revenueTotal)}</p><p class="muted small">${s.unlocks} déblocage(s) de chantier. ${s.revenueTestTotal ? `Paiements de test (non comptés) : ${eur(s.revenueTestTotal)}.` : ""}</p></div>
        <div class="card"><h3>Ajouter un chantier</h3><p class="muted">Publiez un chantier issu de votre prospection commerciale.</p><a class="btn" href="#/admin/chantier/new">+ Nouveau chantier</a></div>
      </div>`;
  }

  async function adminChantiers() {
    if (!requireAdmin()) return;
    const { chantiers } = await api("/admin/chantiers");
    const st = { ouvert: "green", pourvu: "gray", archive: "red" };
    app.innerHTML = adminTabs("#/admin/chantiers") + `
      <div class="section-title"><h2 style="margin:0">${chantiers.length} chantier(s)</h2><a class="btn" href="#/admin/chantier/new">+ Nouveau chantier</a></div>
      <div class="table-wrap"><table><thead><tr><th>Chantier</th><th>Métier</th><th>Ville</th><th>Budget</th><th>Prix / Abonné</th><th>Places</th><th>Statut</th><th></th></tr></thead><tbody>
      ${chantiers.map((c) => `<tr><td><a href="#/chantier/${c.id}">${esc(c.titre)}</a><div class="muted small">${dateFr(c.createdAt)} · ${esc(c.client?.nom)}</div></td><td>${esc(c.metier)}</td><td>${esc(c.ville)} (${esc(c.departement)})</td><td>${eur(c.budget)}</td><td>${eur(c.prix)} / ${eur(c.prixAbonne)}</td><td>${c.places - c.placesRestantes}/${c.places}</td><td><span class="badge ${st[c.status]}">${c.status}</span></td>
        <td class="row-actions"><a class="btn secondary sm" href="#/admin/chantier/${c.id}">Modifier</a><button class="btn danger sm" data-del="${c.id}">Supprimer</button></td></tr>`).join("") || `<tr><td colspan="8" class="empty">Aucun chantier. Ajoutez votre premier chantier.</td></tr>`}
      </tbody></table></div>`;
    app.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Supprimer ce chantier ? (S'il a déjà été acheté, il sera archivé.)")) return;
      try { const r = await api("/admin/chantiers/" + b.dataset.del, { method: "DELETE" }); toast(r.archived ? "Chantier archivé." : "Chantier supprimé."); adminChantiers(); } catch (e) { toast(e.message, true); }
    }));
  }

  async function adminChantierForm(id) {
    if (!requireAdmin()) return;
    const set = (await api("/admin/settings")).settings;
    const c = id && id !== "new" ? (await api("/chantiers/" + id)).chantier : { places: set.defaultPlaces, status: "ouvert", client: {} };
    const v = (k) => esc(c[k] ?? "");
    app.innerHTML = adminTabs("#/admin/chantiers") + `
      <div class="card medium"><h2>${c.id ? "Modifier le chantier" : "Nouveau chantier"}</h2>
      <form id="f">
        <h3>Ce que voient les professionnels</h3>
        <div class="field"><label>Titre *</label><input name="titre" required maxlength="140" value="${v("titre")}" placeholder="ex. Rénovation complète d'une salle de bain de 6 m²"></div>
        <div class="grid3">
          <div class="field"><label>Métier *</label><select name="metier" required>${metierOptions(c.metier, false)}</select></div>
          <div class="field"><label>Ville *</label><input name="ville" required value="${v("ville")}"></div>
          <div class="field"><label>Code postal *</label><input name="codePostal" required value="${v("codePostal")}"></div>
        </div>
        <div class="grid3">
          <div class="field"><label>Budget estimé (€)</label><input name="budget" type="number" min="0" step="1" value="${v("budget")}"></div>
          <div class="field"><label>Délai souhaité</label><input name="delai" value="${v("delai")}" placeholder="ex. Sous 1 mois"></div>
          <div class="field"><label>Places (pros max)</label><input name="places" type="number" min="1" max="20" value="${v("places")}"></div>
        </div>
        <div class="field"><label>Résumé public (visible par tous)</label><textarea name="resume" maxlength="300" style="min-height:70px">${v("resume")}</textarea></div>
        <div class="field"><label>Description complète (abonnés et acheteurs)</label><textarea name="description" maxlength="5000">${v("description")}</textarea></div>
        <h3 style="margin-top:8px">Coordonnées du client (visibles après paiement)</h3>
        <div class="grid2">
          <div class="field"><label>Nom du client</label><input name="clientNom" value="${esc(c.client?.nom)}"></div>
          <div class="field"><label>Téléphone</label><input name="clientTelephone" value="${esc(c.client?.telephone)}"></div>
          <div class="field"><label>E-mail</label><input name="clientEmail" type="email" value="${esc(c.client?.email)}"></div>
          <div class="field"><label>Adresse</label><input name="clientAdresse" value="${esc(c.client?.adresse)}"></div>
        </div>
        <h3 style="margin-top:8px">Prix et suivi</h3>
        <div class="grid2">
          <div class="field"><label>Prix fixe d'accès (€, optionnel)</label><input name="fixedPrice" type="number" min="0" step="0.5" value="${v("fixedPrice")}" placeholder="Vide = ${set.commissionPercent} % du budget"></div>
          <div class="field"><label>Statut</label><select name="status">${["ouvert", "pourvu", "archive"].map((s) => `<option ${c.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        </div>
        <div class="field"><label>Notes internes (jamais affichées)</label><textarea name="notes" style="min-height:70px">${v("notes")}</textarea></div>
        <div class="field"><label class="check"><input type="checkbox" name="consentement" ${c.consentement ? "checked" : ""} required> Le client a accepté que ses coordonnées soient transmises à des professionnels pour recevoir des devis (obligatoire, RGPD).</label></div>
        <div style="display:flex;gap:10px"><button class="btn" type="submit">Enregistrer</button><a class="btn secondary" href="#/admin/chantiers">Annuler</a></div>
      </form></div>`;
    bindForm($("#f"), async (d) => {
      await api("/admin/chantiers" + (c.id ? "/" + c.id : ""), { method: c.id ? "PUT" : "POST", body: d });
      toast("Chantier enregistré."); location.hash = "#/admin/chantiers";
    });
  }

  async function adminPros() {
    if (!requireAdmin()) return;
    const [{ users }, { chantiers }] = await Promise.all([api("/admin/users"), api("/admin/chantiers")]);
    app.innerHTML = adminTabs("#/admin/pros") + `
      <h2>${users.length} professionnel(s) inscrit(s)</h2>
      <div class="table-wrap"><table><thead><tr><th>Professionnel</th><th>Contact</th><th>Métiers / zone</th><th>Abonnement</th><th>Inscrit le</th><th></th></tr></thead><tbody>
      ${users.map((u) => `<tr><td><strong>${esc(u.nom)}</strong><div class="muted small">${esc(u.entreprise)} ${u.siret ? "· SIRET " + esc(u.siret) : ""}</div></td>
        <td>${esc(u.email)}<div class="muted small">${esc(u.telephone)}</div></td>
        <td class="small">${esc((u.metiers || []).join(", "))}<div class="muted">${esc(u.zone)}</div></td>
        <td>${u.subscriber ? `<span class="badge green">Pro</span><div class="muted small">jusqu'au ${dateFr(u.subscription.until)}</div>` : `<span class="badge gray">Découverte</span>`}</td>
        <td class="small">${dateFr(u.createdAt)}</td>
        <td class="row-actions"><button class="btn secondary sm" data-grant="${u.id}">Enregistrer un paiement</button>${u.subscriber ? `<button class="btn danger sm" data-revoke="${u.id}">Retirer l'abonnement</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Aucun professionnel inscrit pour le moment.</td></tr>`}
      </tbody></table></div>`;
    app.querySelectorAll("[data-revoke]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Retirer l'abonnement de ce professionnel ?")) return;
      await api(`/admin/users/${b.dataset.revoke}/grant`, { method: "POST", body: { type: "revoke-subscription" } }); toast("Abonnement retiré."); adminPros();
    }));
    app.querySelectorAll("[data-grant]").forEach((b) => b.addEventListener("click", () => {
      const bg = document.createElement("div");
      bg.className = "modal-bg";
      bg.innerHTML = `<div class="card modal"><h3>Paiement reçu hors ligne</h3><p class="muted small">Virement, espèces, chèque, lien de paiement… Enregistrez-le pour donner l'accès.</p>
        <form id="g"><div class="field"><label>Type</label><select name="type" id="gtype"><option value="subscription">Abonnement Pro</option><option value="unlock">Accès à un chantier</option></select></div>
        <div class="field" id="gmonths"><label>Nombre de mois</label><input name="months" type="number" min="1" max="24" value="1"></div>
        <div class="field" id="gchantier" hidden><label>Chantier</label><select name="chantierId">${chantiers.map((c) => `<option value="${c.id}">${esc(c.titre)} – ${esc(c.ville)}</option>`).join("")}</select></div>
        <div class="grid2"><div class="field"><label>Montant reçu (€)</label><input name="amount" type="number" min="0" step="0.01" required></div>
        <div class="field"><label>Moyen de paiement</label><select name="method"><option>virement</option><option>espèces</option><option>chèque</option><option>lien de paiement</option><option>offert</option></select></div></div>
        <div class="field"><label>Référence (optionnel)</label><input name="ref"></div>
        <div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" class="btn secondary" data-x>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form></div>`;
      document.body.appendChild(bg);
      const sel = bg.querySelector("#gtype");
      sel.addEventListener("change", () => { bg.querySelector("#gmonths").hidden = sel.value !== "subscription"; bg.querySelector("#gchantier").hidden = sel.value !== "unlock"; });
      bg.querySelector("[data-x]").addEventListener("click", () => bg.remove());
      bindForm(bg.querySelector("#g"), async (d) => { await api(`/admin/users/${b.dataset.grant}/grant`, { method: "POST", body: d }); bg.remove(); toast("Paiement enregistré, accès donné."); adminPros(); });
    }));
  }

  async function adminPayments() {
    if (!requireAdmin()) return;
    const { payments } = await api("/admin/payments");
    app.innerHTML = adminTabs("#/admin/paiements") + `
      <h2>${payments.length} paiement(s)</h2>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Professionnel</th><th>Objet</th><th>Montant</th><th>Moyen</th><th>Référence</th></tr></thead><tbody>
      ${payments.map((p) => `<tr><td class="small">${new Date(p.createdAt).toLocaleString("fr-FR")}</td><td>${esc(p.userLabel)}</td><td>${p.type === "subscription" ? `Abonnement Pro${p.months > 1 ? " (" + p.months + " mois)" : ""}` : "Chantier : " + esc(p.chantierLabel)}</td><td><strong>${eur(p.amount)}</strong></td><td>${String(p.method).startsWith("test") ? `<span class="badge gray">test</span>` : esc(p.method)}</td><td class="small muted">${esc(p.ref)}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Aucun paiement pour le moment.</td></tr>`}
      </tbody></table></div>`;
  }

  async function adminSettings() {
    if (!requireAdmin()) return;
    const { settings: s, stripe, webhook } = await api("/admin/settings");
    app.innerHTML = adminTabs("#/admin/reglages") + `
      <div class="card medium"><h2>Réglages</h2>
      <form id="f">
        <div class="field"><label>Nom de la plateforme</label><input name="siteName" value="${esc(s.siteName)}"></div>
        <div class="grid2">
          <div class="field"><label>Abonnement Pro (€ / mois)</label><input name="subscriptionPrice" type="number" min="0" step="0.5" value="${s.subscriptionPrice}"></div>
          <div class="field"><label>Remise abonnés sur les chantiers (%)</label><input name="subscriberDiscount" type="number" min="0" max="100" value="${s.subscriberDiscount}"></div>
          <div class="field"><label>Prix d'accès : % du budget estimé</label><input name="commissionPercent" type="number" min="0" step="0.1" value="${s.commissionPercent}"></div>
          <div class="field"><label>Places par chantier (par défaut)</label><input name="defaultPlaces" type="number" min="1" max="20" value="${s.defaultPlaces}"></div>
          <div class="field"><label>Prix d'accès minimum (€)</label><input name="minUnlock" type="number" min="0" step="0.5" value="${s.minUnlock}"></div>
          <div class="field"><label>Prix d'accès maximum (€)</label><input name="maxUnlock" type="number" min="0" step="0.5" value="${s.maxUnlock}"></div>
          <div class="field"><label>Téléphone de contact (affiché)</label><input name="contactPhone" value="${esc(s.contactPhone)}"></div>
          <div class="field"><label>E-mail de contact (affiché)</label><input name="contactEmail" value="${esc(s.contactEmail)}"></div>
        </div>
        <div class="field"><label class="check"><input type="checkbox" name="testMode" ${s.testMode ? "checked" : ""}> Mode test : tant que Stripe n'est pas branché, les paiements sont simulés (aucun argent encaissé). Décochez avant d'ouvrir la plateforme au public.</label></div>
        <p class="small">Paiement par carte (Stripe) : ${stripe ? `<span class="badge green">activé</span>` : `<span class="badge red">non configuré</span>`} · Webhook : ${webhook ? `<span class="badge green">activé</span>` : `<span class="badge gray">non configuré</span>`}</p>
        <button class="btn" type="submit">Enregistrer</button>
      </form></div>`;
    bindForm($("#f"), async (d) => { await api("/admin/settings", { method: "PUT", body: d }); await loadConfig(); toast("Réglages enregistrés."); });
  }


  // ---------- Agent Instagram ----------
  // Dessine le visuel du post (1080 x 1350, format portrait conseillé par Instagram)
  function wrapLines(ctx, text, maxW, maxLines) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (ctx.measureText(t).width <= maxW) cur = t;
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let last = lines[maxLines - 1];
      while (ctx.measureText(last + "…").width > maxW && last.length) last = last.slice(0, -1);
      lines[maxLines - 1] = last.trimEnd() + "…";
    }
    return lines;
  }

  function drawPostImage(canvas, c, siteName) {
    const W = 1080, H = 1350, P = 80;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    const font = (w, px) => `${w} ${px}px Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    // Fond
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#0f1f3a"); g.addColorStop(1, "#22406f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Bandes de chantier
    ctx.save(); ctx.translate(W - 260, -60); ctx.rotate(Math.PI / 4);
    for (let i = 0; i < 7; i++) { ctx.fillStyle = i % 2 ? "#0f1f3a" : "#f26b1d"; ctx.fillRect(i * 46 - 160, 0, 46, 120); }
    ctx.restore();
    // Logo + nom
    ctx.fillStyle = "#f26b1d"; ctx.beginPath(); ctx.roundRect(P, P, 84, 84, 18); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillRect(P + 18, P + 58, 48, 8);
    ctx.beginPath(); ctx.moveTo(P + 26, P + 30); ctx.lineTo(P + 42, P + 18); ctx.lineTo(P + 58, P + 30); ctx.lineTo(P + 58, P + 53); ctx.lineTo(P + 26, P + 53); ctx.closePath(); ctx.fill();
    ctx.font = font(800, 40); ctx.textBaseline = "middle"; ctx.fillText(siteName, P + 108, P + 44);
    // Étiquette
    ctx.textBaseline = "alphabetic";
    let y = 330;
    ctx.font = font(800, 34);
    const tag = "NOUVEAU CHANTIER";
    const tw = ctx.measureText(tag).width;
    ctx.fillStyle = "#f26b1d"; ctx.beginPath(); ctx.roundRect(P, y - 50, tw + 48, 68, 34); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillText(tag, P + 24, y - 4);
    // Métier
    y += 90;
    ctx.fillStyle = "#ffb88a"; ctx.font = font(700, 40); ctx.fillText(c.metier || "", P, y);
    // Titre
    ctx.fillStyle = "#fff"; ctx.font = font(800, 74);
    const tl = wrapLines(ctx, c.titre, W - 2 * P, 4);
    y += 30;
    for (const l of tl) { y += 88; ctx.fillText(l, P, y); }
    // Infos
    y += 95;
    const info = [["📍", `${c.ville || ""}${c.departement ? ` (${c.departement})` : ""}`]];
    if (c.budgetLabel) info.push(["💶", `Budget ${c.budgetLabel}`]);
    if (c.delai) info.push(["⏱️", c.delai]);
    info.push(["👷", c.placesRestantes > 0 ? `${c.placesRestantes} place${c.placesRestantes > 1 ? "s" : ""} disponible${c.placesRestantes > 1 ? "s" : ""}` : "Complet"]);
    ctx.font = font(600, 44);
    for (const [ico, txt] of info) {
      if (y > H - 260) break;
      ctx.fillStyle = "#fff"; ctx.fillText(ico, P, y);
      ctx.fillStyle = "#dfe6f3"; ctx.fillText(wrapLines(ctx, txt, W - 2 * P - 80, 1)[0] || "", P + 80, y);
      y += 74;
    }
    // Bandeau bas
    ctx.fillStyle = "#f26b1d"; ctx.fillRect(0, H - 170, W, 170);
    ctx.fillStyle = "#fff"; ctx.font = font(800, 46); ctx.fillText("Coordonnées du client sur", P, H - 98);
    ctx.font = font(600, 36); ctx.fillText(`${siteName} · lien en bio`, P, H - 48);
  }

  async function adminInstagram() {
    if (!requireAdmin()) return;
    const data = await api("/admin/instagram");
    const { items, enabled, siteName } = data;
    app.innerHTML = adminTabs("#/admin/instagram") + `
      ${enabled ? "" : `<div class="notice"><strong>Publication automatique non configurée.</strong> Vous pouvez déjà télécharger le visuel et copier la légende pour publier à la main. Pour publier en un clic, ajoutez <code>INSTAGRAM_USER_ID</code> et <code>INSTAGRAM_ACCESS_TOKEN</code> dans Netlify (voir README).</div>`}
      <div class="section-title"><h2 style="margin:0">${items.length} chantier(s) ouvert(s)</h2>
        <span class="muted small">${items.filter((i) => !i.post?.publishedAt).length} à publier</span></div>
      <div class="ig-list">${items.map((it, i) => `
        <div class="card ig-item" data-i="${i}">
          <canvas class="ig-canvas"></canvas>
          <div class="ig-side">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:start">
              <div><h3 style="margin:0">${esc(it.chantier.titre)}</h3><div class="muted small">${esc(it.chantier.ville)} · ${dateFr(it.chantier.createdAt)}</div></div>
              ${it.post?.publishedAt ? `<span class="badge green">Publié le ${dateFr(it.post.publishedAt)}</span>` : `<span class="badge orange">À publier</span>`}
            </div>
            <div class="field" style="margin:12px 0"><label>Légende</label><textarea class="ig-caption" maxlength="2200">${esc(it.post?.caption || it.caption)}</textarea>
              <div class="muted small"><span class="ig-count"></span> / 2200 caractères</div></div>
            <div class="row-actions" style="flex-wrap:wrap">
              ${enabled ? `<button class="btn sm" data-act="publish">${it.post?.publishedAt ? "Republier" : "Publier sur Instagram"}</button>` : ""}
              <button class="btn secondary sm" data-act="copy">Copier la légende</button>
              <button class="btn secondary sm" data-act="download">Télécharger l'image</button>
              ${!it.post?.publishedAt ? `<button class="btn secondary sm" data-act="manual">Marquer comme publié</button>` : ""}
              <button class="btn secondary sm" data-act="reset">Légende par défaut</button>
              ${it.post?.permalink ? `<a class="btn secondary sm" href="${esc(it.post.permalink)}" target="_blank" rel="noopener">Voir le post</a>` : ""}
            </div>
          </div>
        </div>`).join("") || `<div class="card empty">Aucun chantier ouvert à publier.</div>`}</div>`;

    app.querySelectorAll(".ig-item").forEach((el) => {
      const it = items[Number(el.dataset.i)];
      const canvas = el.querySelector("canvas");
      const ta = el.querySelector(".ig-caption");
      const count = () => (el.querySelector(".ig-count").textContent = ta.value.length);
      ta.addEventListener("input", count); count();
      const draw = () => drawPostImage(canvas, it.chantier, siteName);
      draw();
      document.fonts?.ready.then(draw);
      el.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
        const act = b.dataset.act;
        b.disabled = true;
        try {
          if (act === "copy") { await navigator.clipboard.writeText(ta.value); toast("Légende copiée."); }
          else if (act === "download") {
            draw();
            const a = document.createElement("a");
            a.href = canvas.toDataURL("image/jpeg", 0.92);
            a.download = `chantier-${it.chantier.id}.jpg`; a.click();
          } else if (act === "reset") { ta.value = it.caption; count(); }
          else if (act === "manual") {
            await api(`/admin/instagram/${it.chantier.id}/publish`, { method: "POST", body: { manual: true, caption: ta.value } });
            toast("Marqué comme publié."); adminInstagram();
          } else if (act === "publish") {
            if (it.post?.publishedAt && !confirm("Ce chantier a déjà été publié. Le republier ?")) return;
            draw();
            await api(`/admin/instagram/${it.chantier.id}/image`, { method: "POST", body: { image: canvas.toDataURL("image/jpeg", 0.92) } });
            await api(`/admin/instagram/${it.chantier.id}/publish`, { method: "POST", body: { caption: ta.value, force: !!it.post?.publishedAt } });
            toast("Publié sur Instagram !"); adminInstagram();
          }
        } catch (e) { toast(e.message, true); }
        finally { b.disabled = false; }
      }));
    });
  }


  // ---------- Agent YouTube (Shorts) ----------
  const SHORT_SECONDS = 12;
  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

  // Dessine l'image n° t (en secondes) du Short vertical 1080 x 1920
  function drawShortFrame(ctx, c, siteName, t) {
    const W = 1080, H = 1920, P = 90;
    const font = (w, px) => `${w} ${px}px Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#0f1f3a"); g.addColorStop(1, "#22406f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1; ctx.textBaseline = "alphabetic";
    // Bandes de chantier qui défilent
    ctx.save(); ctx.translate(W - 300, -80); ctx.rotate(Math.PI / 4);
    const off = (t * 60) % 92;
    for (let i = -2; i < 9; i++) { ctx.fillStyle = i % 2 ? "#0f1f3a" : "#f26b1d"; ctx.fillRect(i * 46 - 160 + off, 0, 46, 130); }
    ctx.restore();
    // Logo + nom
    ctx.fillStyle = "#f26b1d"; ctx.beginPath(); ctx.roundRect(P, 150, 96, 96, 20); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillRect(P + 20, 150 + 66, 56, 9);
    ctx.beginPath(); ctx.moveTo(P + 29, 184); ctx.lineTo(P + 48, 170); ctx.lineTo(P + 67, 184); ctx.lineTo(P + 67, 210); ctx.lineTo(P + 29, 210); ctx.closePath(); ctx.fill();
    ctx.font = font(800, 46); ctx.textBaseline = "middle"; ctx.fillText(siteName, P + 122, 198); ctx.textBaseline = "alphabetic";

    const slide = (start, dur = 0.6) => { const k = ease((t - start) / dur); return { a: k, dx: (1 - k) * -120 }; };
    let y = 480;
    // Étiquette
    let s1 = slide(0.2);
    ctx.globalAlpha = s1.a;
    ctx.font = font(800, 44);
    const tag = "NOUVEAU CHANTIER"; const tw = ctx.measureText(tag).width;
    ctx.fillStyle = "#f26b1d"; ctx.beginPath(); ctx.roundRect(P + s1.dx, y - 62, tw + 60, 86, 43); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillText(tag, P + 30 + s1.dx, y - 4);
    // Métier
    y += 110; s1 = slide(0.7);
    ctx.globalAlpha = s1.a; ctx.fillStyle = "#ffb88a"; ctx.font = font(700, 50); ctx.fillText(c.metier || "", P + s1.dx, y);
    // Titre
    s1 = slide(1.4, 0.8);
    ctx.globalAlpha = s1.a; ctx.fillStyle = "#fff"; ctx.font = font(800, 86);
    y += 30;
    for (const l of wrapLines(ctx, c.titre, W - 2 * P, 5)) { y += 104; ctx.fillText(l, P + s1.dx, y); }
    // Infos, une par une
    y += 120;
    const info = [["📍", `${c.ville || ""}${c.departement ? ` (${c.departement})` : ""}`]];
    if (c.budgetLabel) info.push(["💶", `Budget ${c.budgetLabel}`]);
    if (c.delai) info.push(["⏱️", c.delai]);
    info.push(["👷", c.placesRestantes > 0 ? `${c.placesRestantes} place${c.placesRestantes > 1 ? "s" : ""} disponible${c.placesRestantes > 1 ? "s" : ""}` : "Complet"]);
    ctx.font = font(600, 56);
    info.forEach(([ico, txt], i) => {
      if (y > H - 420) return;
      const s = slide(3.2 + i * 0.7);
      ctx.globalAlpha = s.a;
      ctx.fillStyle = "#fff"; ctx.fillText(ico, P + s.dx, y);
      ctx.fillStyle = "#dfe6f3"; ctx.fillText(wrapLines(ctx, txt, W - 2 * P - 100, 1)[0] || "", P + 100 + s.dx, y);
      y += 96;
    });
    // Appel à l'action (monte depuis le bas, puis pulse)
    const k = ease((t - 7) / 0.7);
    ctx.globalAlpha = 1;
    const by = H - 300 * k;
    ctx.fillStyle = "#f26b1d"; ctx.fillRect(0, by, W, 300);
    if (k > 0) {
      const pulse = 1 + (t > 8 ? 0.03 * Math.sin((t - 8) * 6) : 0);
      ctx.save(); ctx.translate(P, by + 130); ctx.scale(pulse, pulse);
      ctx.fillStyle = "#fff"; ctx.font = font(800, 64); ctx.fillText("Coordonnées du client", 0, 0);
      ctx.restore();
      ctx.fillStyle = "#fff"; ctx.font = font(600, 46); ctx.fillText(`sur ${siteName} · lien en description`, P, by + 210);
    }
    ctx.globalAlpha = 1;
  }

  // Enregistre le Short en temps réel (≈ 12 s) avec MediaRecorder
  async function recordShort(canvas, c, siteName, onProgress) {
    canvas.width = 1080; canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    const types = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const mime = types.find((x) => window.MediaRecorder && MediaRecorder.isTypeSupported(x));
    if (!mime) throw new Error("Votre navigateur ne sait pas enregistrer de vidéo. Utilisez Chrome, Edge ou Firefox récent.");
    drawShortFrame(ctx, c, siteName, 0);
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((res) => (rec.onstop = res));
    rec.start(250);
    const t0 = performance.now();
    await new Promise((res) => {
      const tick = () => {
        const t = (performance.now() - t0) / 1000;
        drawShortFrame(ctx, c, siteName, Math.min(t, SHORT_SECONDS));
        stream.getVideoTracks()[0]?.requestFrame?.();
        onProgress?.(Math.min(1, t / SHORT_SECONDS));
        if (t >= SHORT_SECONDS) return res();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    rec.stop(); await done;
    stream.getTracks().forEach((tr) => tr.stop());
    const type = mime.split(";")[0];
    return new Blob(chunks, { type });
  }

  async function adminYoutube() {
    if (!requireAdmin()) return;
    const { items, enabled, siteName } = await api("/admin/youtube");
    app.innerHTML = adminTabs("#/admin/youtube") + `
      ${enabled ? "" : `<div class="notice"><strong>Envoi automatique non configuré.</strong> Vous pouvez déjà créer la vidéo, la télécharger et copier les textes pour la mettre en ligne depuis YouTube Studio. Pour publier en un clic, ajoutez <code>YOUTUBE_CLIENT_ID</code>, <code>YOUTUBE_CLIENT_SECRET</code> et <code>YOUTUBE_REFRESH_TOKEN</code> dans Netlify (voir README).</div>`}
      <div class="section-title"><h2 style="margin:0">${items.length} chantier(s) ouvert(s)</h2>
        <span class="muted small">${items.filter((i) => !i.post?.publishedAt).length} à publier · Shorts verticaux de ${SHORT_SECONDS} s</span></div>
      <div class="ig-list">${items.map((it, i) => {
        const p = it.post || {};
        return `
        <div class="card ig-item yt-item" data-i="${i}">
          <div><canvas class="yt-canvas"></canvas><div class="yt-progress" hidden><div></div></div></div>
          <div class="ig-side">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:start">
              <div><h3 style="margin:0">${esc(it.chantier.titre)}</h3><div class="muted small">${esc(it.chantier.ville)} · ${dateFr(it.chantier.createdAt)}</div></div>
              ${p.publishedAt ? `<span class="badge green">Publié le ${dateFr(p.publishedAt)}</span>` : `<span class="badge orange">À publier</span>`}
            </div>
            <div class="field" style="margin:12px 0 8px"><label>Titre <span class="muted small yt-tcount"></span></label><input class="yt-title" maxlength="100" value="${esc(p.title || it.title)}"></div>
            <div class="field" style="margin-bottom:8px"><label>Description</label><textarea class="yt-desc ig-caption" maxlength="5000">${esc(p.description || it.description)}</textarea></div>
            <div class="grid2">
              <div class="field"><label>Tags (séparés par des virgules)</label><input class="yt-tags" value="${esc((p.tags || it.tags).join(", "))}"></div>
              <div class="field"><label>Visibilité</label><select class="yt-privacy">${[["public", "Publique"], ["unlisted", "Non répertoriée"], ["private", "Privée"]].map(([v, l]) => `<option value="${v}" ${(p.privacy || "public") === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
            </div>
            <div class="row-actions">
              ${enabled ? `<button class="btn sm" data-act="publish">${p.publishedAt ? "Republier" : "Créer et publier sur YouTube"}</button>` : ""}
              <button class="btn secondary sm" data-act="download">Créer et télécharger la vidéo</button>
              <button class="btn secondary sm" data-act="copy">Copier titre + description</button>
              ${!p.publishedAt ? `<button class="btn secondary sm" data-act="manual">Marquer comme publié</button>` : ""}
              <button class="btn secondary sm" data-act="reset">Textes par défaut</button>
              ${p.url ? `<a class="btn secondary sm" href="${esc(p.url)}" target="_blank" rel="noopener">Voir le Short</a>` : ""}
            </div>
          </div>
        </div>`; }).join("") || `<div class="card empty">Aucun chantier ouvert à publier.</div>`}</div>`;

    let busy = false;
    app.querySelectorAll(".yt-item").forEach((el) => {
      const it = items[Number(el.dataset.i)];
      const canvas = el.querySelector("canvas");
      const title = el.querySelector(".yt-title"), desc = el.querySelector(".yt-desc"), tags = el.querySelector(".yt-tags"), privacy = el.querySelector(".yt-privacy");
      const bar = el.querySelector(".yt-progress");
      const tcount = () => (el.querySelector(".yt-tcount").textContent = `(${title.value.length}/100)`);
      title.addEventListener("input", tcount); tcount();
      const preview = () => { canvas.width = 1080; canvas.height = 1920; drawShortFrame(canvas.getContext("2d"), it.chantier, siteName, SHORT_SECONDS); };
      preview(); document.fonts?.ready.then(() => !busy && preview());
      const record = async () => {
        bar.hidden = false;
        try { return await recordShort(canvas, it.chantier, siteName, (k) => (bar.firstElementChild.style.width = Math.round(k * 100) + "%")); }
        finally { bar.hidden = true; }
      };
      el.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
        const act = b.dataset.act;
        if ((act === "publish" || act === "download") && busy) return toast("Une vidéo est déjà en cours de création, patientez.", true);
        b.disabled = true;
        try {
          if (act === "copy") { await navigator.clipboard.writeText(`${title.value}\n\n${desc.value}\n\nTags : ${tags.value}`); toast("Textes copiés."); }
          else if (act === "reset") { title.value = it.title; desc.value = it.description; tags.value = it.tags.join(", "); tcount(); }
          else if (act === "manual") { await api(`/admin/youtube/${it.chantier.id}/manual`, { method: "POST", body: {} }); toast("Marqué comme publié."); adminYoutube(); }
          else if (act === "download") {
            busy = true; toast(`Création de la vidéo (${SHORT_SECONDS} s)…`);
            const blob = await record();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `chantier-${it.chantier.id}.${blob.type.includes("mp4") ? "mp4" : "webm"}`; a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 10000);
          } else if (act === "publish") {
            if (it.post?.publishedAt && !confirm("Ce chantier a déjà été publié sur YouTube. Le republier ?")) return;
            busy = true;
            await api(`/admin/youtube/${it.chantier.id}/draft`, { method: "POST", body: {
              title: title.value, description: desc.value, privacy: privacy.value,
              tags: tags.value.split(",").map((x) => x.trim()).filter(Boolean) } });
            toast(`Création de la vidéo (${SHORT_SECONDS} s)…`);
            const blob = await record();
            toast("Envoi sur YouTube…");
            const r = await fetch(`/api/admin/youtube/${it.chantier.id}/upload${it.post?.publishedAt ? "?force=1" : ""}`, {
              method: "POST", headers: { "content-type": blob.type }, body: blob, credentials: "same-origin" });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || "Échec de l'envoi.");
            toast("Short publié sur YouTube !"); adminYoutube();
          }
        } catch (e) { toast(e.message, true); }
        finally { b.disabled = false; if (act === "publish" || act === "download") { busy = false; preview(); } }
      }));
    });
  }

  // ---------- Pages légales ----------
  function pageLegal(which) {
    const n = esc(state.config.siteName);
    const R = `<mark>[À REMPLIR]</mark>`;
    const pages = {
      mentions: `<h1>Mentions légales</h1>
        <h2>Éditeur</h2><p>${n} est édité par ${R} (raison sociale), ${R} (forme juridique), au capital de ${R}, immatriculée sous le SIRET ${R}, dont le siège est situé ${R}.<br>Directeur de la publication : ${R}.<br>Contact : ${esc(state.config.contactEmail) || R} ${state.config.contactPhone ? "– " + esc(state.config.contactPhone) : ""}</p>
        <h2>Hébergement</h2><p>Netlify, Inc., 101 2nd Street, San Francisco, CA 94105, États-Unis.</p>
        <h2>Paiements</h2><p>Les paiements par carte sont traités par Stripe. ${n} ne conserve aucune donnée de carte bancaire.</p>`,
      cgv: `<h1>Conditions générales d'utilisation et de vente</h1>
        <div class="notice">Modèle à faire relire par un professionnel du droit avant l'ouverture au public.</div>
        <h2>1. Objet</h2><p>${n} met à disposition de professionnels (artisans, entreprises, prestataires) des demandes de travaux et chantiers recueillies auprès de clients ayant accepté d'être contactés.</p>
        <h2>2. Compte professionnel</h2><p>L'inscription est réservée aux professionnels. Le titulaire du compte garantit l'exactitude de ses informations et la confidentialité de son mot de passe.</p>
        <h2>3. Offres et prix</h2><p>Formule Découverte gratuite ; accès à un chantier à l'unité au prix affiché sur la fiche avant paiement ; abonnement Pro mensuel au prix affiché sur la page Tarifs, donnant accès aux descriptions complètes et à une remise sur les accès. Prix en euros ${R} (TTC/HT selon votre régime de TVA).</p>
        <h2>4. Paiement</h2><p>Paiement par carte bancaire via Stripe, ou par tout autre moyen accepté par l'éditeur (virement…). L'abonnement est renouvelé chaque mois jusqu'à résiliation depuis l'espace client ; la résiliation prend effet à la fin de la période en cours.</p>
        <h2>5. Nature du service</h2><p>Les coordonnées fournies permettent de contacter le client. ${n} ne garantit pas la signature du chantier. Le nombre de professionnels ayant accès à un même chantier est limité et indiqué sur la fiche. Conditions de remboursement en cas de coordonnées erronées : ${R}.</p>
        <h2>6. Utilisation des données des clients</h2><p>Le professionnel s'engage à n'utiliser les coordonnées du client que pour lui proposer un devis pour le chantier concerné, et à ne pas les revendre ni les transmettre.</p>
        <h2>7. Droit applicable</h2><p>Droit français. Tribunal compétent : ${R}.</p>`,
      confidentialite: `<h1>Politique de confidentialité</h1>
        <h2>Responsable du traitement</h2><p>${R} – contact : ${esc(state.config.contactEmail) || R}.</p>
        <h2>Données des professionnels</h2><p>Nom, entreprise, SIRET, coordonnées, métiers, zone d'intervention et historique des achats, utilisés pour gérer le compte, les paiements et la facturation. Conservation : durée du compte puis obligations légales comptables.</p>
        <h2>Données des clients particuliers et entreprises</h2><p>Les coordonnées des clients ne sont publiées qu'avec leur accord préalable pour être recontactés par des professionnels au sujet de leur projet. Elles ne sont visibles que par les professionnels ayant acheté l'accès au chantier, dans la limite du nombre de places indiqué.</p>
        <h2>Vos droits</h2><p>Accès, rectification, effacement, opposition : écrivez à ${esc(state.config.contactEmail) || R}. Vous pouvez saisir la CNIL (cnil.fr).</p>
        <h2>Cookies</h2><p>Un seul cookie technique est utilisé pour maintenir votre connexion. Aucun cookie publicitaire.</p>`,
    };
    app.innerHTML = `<div class="card medium legal">${pages[which] || pages.mentions}</div>`;
  }

  // ---------- Routeur ----------
  async function refreshMe() { try { state.user = (await api("/auth/me")).user; } catch { state.user = null; } }
  async function loadConfig() {
    state.config = await api("/config");
    document.title = `${state.config.siteName} – Des chantiers qualifiés pour les professionnels`;
    $("#brandName").textContent = state.config.siteName;
    $("#footName").textContent = state.config.siteName;
    const tb = $("#testBanner");
    tb.hidden = !state.config.testMode;
    tb.textContent = "Version de démonstration : les paiements sont simulés, aucun montant n'est débité.";
  }

  async function route() {
    const [path, qs] = (location.hash.slice(1) || "/").split("?");
    const params = new URLSearchParams(qs || "");
    const seg = path.split("/").filter(Boolean);
    $("#nav").classList.remove("open");
    renderNav();
    window.scrollTo(0, 0);
    try {
      if (!seg.length) return await pageHome();
      switch (seg[0]) {
        case "chantiers": return await pageList(params);
        case "chantier": return await pageDetail(seg[1]);
        case "tarifs": return pagePricing();
        case "connexion": return pageLogin();
        case "inscription": return pageRegister();
        case "compte": return await pageAccount();
        case "paiement-ok": return await pagePaymentOk(params);
        case "legal": return pageLegal(seg[1]);
        case "admin":
          if (!seg[1]) return await adminDashboard();
          if (seg[1] === "chantiers") return await adminChantiers();
          if (seg[1] === "chantier") return await adminChantierForm(seg[2]);
          if (seg[1] === "pros") return await adminPros();
          if (seg[1] === "paiements") return await adminPayments();
          if (seg[1] === "reglages") return await adminSettings();
          if (seg[1] === "instagram") return await adminInstagram();
          if (seg[1] === "youtube") return await adminYoutube();
        // fallthrough
        default: app.innerHTML = `<div class="card narrow empty"><h2>Page introuvable</h2><a class="btn" href="#/">Retour à l'accueil</a></div>`;
      }
    } catch (e) {
      app.innerHTML = `<div class="card narrow"><h2>Oups</h2><p>${esc(e.message)}</p><a class="btn" href="#/">Retour à l'accueil</a></div>`;
    }
  }

  window.addEventListener("hashchange", route);
  (async () => {
    try { await Promise.all([loadConfig(), refreshMe()]); }
    catch (e) { app.innerHTML = `<div class="card narrow"><h2>Service momentanément indisponible</h2><p>${esc(e.message)}</p></div>`; return; }
    route();
  })();
})();
