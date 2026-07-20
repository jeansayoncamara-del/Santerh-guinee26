const CACHE_NAME = "santerh-guinee-v1";
const APP_SHELL = [
  "./",
  "./SanteRH-Guinee.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Installation : mise en cache du shell applicatif
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activation : nettoyage des anciens caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Stratégie : réseau d'abord pour Firebase (données live),
// cache d'abord pour le reste (shell applicatif, icônes)
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // Ne jamais intercepter les appels Firebase (RTDB / auth) : toujours réseau
  if (url.includes("firebaseio.com") || url.includes("googleapis.com")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Mise en cache dynamique des nouvelles ressources same-origin
        if (event.request.method === "GET" && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Fallback hors-ligne : renvoyer la page principale si navigation
        if (event.request.mode === "navigate") {
          return caches.match("./SanteRH-Guinee.html");
        }
      });
    })
  );
});
