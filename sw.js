/* sw.js — service worker.
   - App shell: cache primeiro (funciona offline após a 1ª visita).
   - Arquivos de dados (data/*.json): rede primeiro, com cache de reserva,
     para que novos bancos apareçam quando houver internet, sem quebrar o offline.
   Caminhos relativos: compatível com hospedagem em subdiretório (GitHub Pages). */

var VERSAO = "ciencias-7ano-v1";
var CACHE_SHELL = VERSAO + "-shell";
var CACHE_DADOS = VERSAO + "-dados";

var SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/embedded-content.js",
  "./js/util.js",
  "./js/srs.js",
  "./js/content.js",
  "./js/state.js",
  "./js/session.js",
  "./js/admin.js",
  "./js/ui.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
].map(function (p) { return new URL(p, self.location).toString(); });

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE_SHELL).then(function (c) {
      return Promise.all(SHELL.map(function (url) {
        return c.add(new Request(url, { cache: "reload" })).catch(function () { /* ignora item faltante */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.map(function (n) {
        if (n !== CACHE_SHELL && n !== CACHE_DADOS) return caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  var ehDados = /\/data\/.*\.json$/.test(url.pathname);

  if (ehDados) {
    // rede primeiro
    e.respondWith(
      fetch(req).then(function (resp) {
        var copia = resp.clone();
        caches.open(CACHE_DADOS).then(function (c) { c.put(req, copia); });
        return resp;
      }).catch(function () {
        return caches.match(req).then(function (r) { return r || Response.error(); });
      })
    );
    return;
  }

  // app shell / navegação: cache primeiro, com atualização em segundo plano
  e.respondWith(
    caches.match(req).then(function (cacheado) {
      var rede = fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          var copia = resp.clone();
          caches.open(CACHE_SHELL).then(function (c) { c.put(req, copia); });
        }
        return resp;
      }).catch(function () { return null; });
      return cacheado || rede || caches.match(new URL("./index.html", self.location).toString());
    })
  );
});
