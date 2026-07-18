// Service worker : rend le correcteur utilisable hors ligne.
//
// Le dictionnaire pèse environ 2 Mo compressés. Il est téléchargé une seule
// fois, mis en cache, puis servi localement : les visites suivantes ne font
// aucune requête réseau, et le site fonctionne sans connexion.

"use strict";

// Remplacé par build-web.js avec une empreinte du contenu publié. Le cache est
// ainsi renouvelé automatiquement dès qu'un fichier du site change.
const VERSION = "korr-__BUILD_ID__";

// L'enveloppe de l'application : mise en cache dès l'installation.
const SHELL = [
  "./",
  "index.html",
  "app.css",
  "app.js",
  "manifest.webmanifest",
  "grammalecte-worker.js",
  "grammar-rules.js",
  "icons/icon-128.png",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

// Le moteur : volumineux, donc mis en cache à la première utilisation plutôt
// qu'à l'installation, pour que la page s'affiche sans attendre.
const ENGINE_PATTERN = /vendor\/grammalecte\//u;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Cache d'abord : le moteur et l'enveloppe ne changent qu'avec la version.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        const cacheable = response.ok &&
          (ENGINE_PATTERN.test(url.pathname) || SHELL.some((file) => url.pathname.endsWith(file)));
        if (cacheable) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => {
        // Hors ligne et absent du cache : on renvoie la page d'accueil pour
        // une navigation, sinon l'échec est légitime.
        if (request.mode === "navigate") return caches.match("index.html");
        return Response.error();
      });
    })
  );
});
