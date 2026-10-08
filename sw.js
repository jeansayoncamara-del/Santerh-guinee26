/* SantéRH Guinée — service worker (v3)
 *
 * Principe :
 *  - L'application (SanteRH-Guinee.html) est TOUJOURS chargée depuis internet en priorité,
 *    pour que chaque mise à jour publiée sur GitHub soit visible dès la réouverture.
 *    Si le réseau est absent ou trop lent (plus de 6 s), on affiche la copie gardée
 *    sur le téléphone, et la nouvelle version s'enregistre en arrière-plan pour la fois suivante.
 *  - Icônes et manifest : affichés depuis le téléphone, puis rafraîchis en arrière-plan.
 *  - Firebase, Google, Jitsi et tout autre site extérieur ne passent JAMAIS par ce
 *    service worker : les données restent toujours en direct avec le serveur.
 *
 * Plus besoin de changer CACHE_NAME à chaque mise à jour de l'application.
 * Ne le changer que si la liste FICHIERS_DE_BASE change.
 */
const CACHE_NAME = "santerh-guinee-v3";
const PAGE_APP = "./SanteRH-Guinee.html";
const FICHIERS_DE_BASE = [
  PAGE_APP,
  "./manifest.json",
  "./icon-192-5.png",
  "./icon-512-5.png"
];
const DELAI_RESEAU_MS = 6000; // au-delà, on affiche la copie locale (réseau lent en zone rurale)

// Installation : chaque fichier est mis en cache séparément. Un fichier manquant ou
// renommé ne bloque plus jamais l'installation (c'était le problème de l'ancienne version).
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        FICHIERS_DE_BASE.map((url) =>
          fetch(url, { cache: "no-cache" }).then((rep) => {
            if (rep.ok) return cache.put(url, rep);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

// Activation : suppression des anciens caches, prise en main immédiate des pages ouvertes.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE_NAME).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Sites extérieurs (Firebase, Google, Jitsi, polices, CDN…) : jamais interceptés.
  if (url.origin !== self.location.origin) return;
  // Fichiers techniques (.well-known…) : laissés au navigateur.
  if (url.pathname.includes("/.well-known/")) return;

  const estPageApp = req.mode === "navigate" || url.pathname.endsWith(".html");
  event.respondWith(estPageApp ? reseauDabord(event) : cacheDabord(event));
});

// Application : réseau d'abord (avec délai maximum), copie locale en secours.
function reseauDabord(event) {
  const req = event.request;
  const versReseau = fetch(req, { cache: "no-cache" }).then((rep) => {
    if (rep && rep.ok) {
      const copie = rep.clone();
      // La page est gardée sous une seule clé, sans les paramètres (?formation=…).
      event.waitUntil(caches.open(CACHE_NAME).then((c) => c.put(PAGE_APP, copie)));
    }
    return rep;
  });
  // Même si on répond avec la copie locale, le téléchargement continue jusqu'au bout
  // pour que la version suivante soit à jour.
  event.waitUntil(versReseau.catch(() => {}));

  const copieLocale = () =>
    caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match(PAGE_APP));

  return new Promise((resolve) => {
    let repondu = false;
    const repondre = (r) => { if (!repondu && r) { repondu = true; resolve(r); } };

    const minuteur = setTimeout(() => copieLocale().then(repondre), DELAI_RESEAU_MS);

    versReseau
      .then((rep) => { clearTimeout(minuteur); repondre(rep); })
      .catch(() => {
        clearTimeout(minuteur);
        copieLocale().then((r) =>
          repondre(r || new Response(
            "<meta charset='utf-8'><p style='font-family:sans-serif;padding:24px'>Pas de connexion internet et aucune copie de SantéRH sur ce téléphone. Reconnectez-vous puis rouvrez l'application.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          ))
        );
      });
  });
}

// Icônes, manifest, autres fichiers du site : copie locale tout de suite, rafraîchie en arrière-plan.
function cacheDabord(event) {
  const req = event.request;
  return caches.match(req).then((enCache) => {
    const maj = fetch(req).then((rep) => {
      if (rep && rep.ok) {
        const copie = rep.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copie));
      }
      return rep;
    });
    if (enCache) {
      event.waitUntil(maj.catch(() => {}));
      return enCache;
    }
    return maj;
  });
}
