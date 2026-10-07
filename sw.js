// Service worker: deixa o app abrir sem internet. Funciona na raiz do site ou em uma subpasta
// (por exemplo https://usuario.github.io/treino-remo/), pois tudo é relativo ao escopo.
const CACHE = "treino-remo-v1";
const ESCOPO = self.registration.scope; // sempre termina com "/"
const BASE = [ESCOPO, `${ESCOPO}manifest.webmanifest`, `${ESCOPO}icons/icon.svg`];
const CAMINHO_API = new URL("api/", ESCOPO).pathname;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      // só apaga caches antigos DESTE app (no github.io outros projetos dividem o mesmo domínio)
      .then((nomes) =>
        Promise.all(nomes.filter((n) => n.startsWith("treino-remo-") && n !== CACHE).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.pathname.startsWith(CAMINHO_API)) return; // API sempre na rede

  // Páginas: rede primeiro, cópia local se estiver offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(ESCOPO, copia));
          return r;
        })
        .catch(() => caches.match(ESCOPO)),
    );
    return;
  }

  // Arquivos do app e fontes: usa a cópia e atualiza em segundo plano.
  const mesmaOrigem = url.origin === self.location.origin;
  const fonte = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (mesmaOrigem || fonte) {
    e.respondWith(
      caches.match(req).then((emCache) => {
        const rede = fetch(req)
          .then((r) => {
            if (r.ok || r.type === "opaque") {
              const copia = r.clone();
              caches.open(CACHE).then((c) => c.put(req, copia));
            }
            return r;
          })
          .catch(() => emCache);
        return emCache || rede;
      }),
    );
  }
});
