// Service worker: deixa o app abrir sem internet. Funciona na raiz do site ou em uma subpasta
// (por exemplo https://usuario.github.io/treino-remo/), pois tudo é relativo ao escopo.
// A versão e a lista de assets abaixo são preenchidas no build (vite.config.js). O cache do app muda a cada versão;
// o das falas (audio/) é separado e permanece, para não baixar tudo de novo a cada atualização.
const VERSAO = "muyr7dp3";
const CACHE = `treino-remo-app-${VERSAO}`;
const CACHE_FALAS = "treino-remo-falas-v1";
const ESCOPO = self.registration.scope; // sempre termina com "/"
const ASSETS = ["assets/index-BqscSaz3.css", "assets/index-CVXGMTwn.js", "assets/react-C8w-UNLI.js"];
const BASE = [ESCOPO, `${ESCOPO}manifest.webmanifest`, `${ESCOPO}icons/icon.svg`, ...ASSETS.map((a) => `${ESCOPO}${a}`)];
const CAMINHO_API = new URL("api/", ESCOPO).pathname;
// Falas do treino (audio/voga-12.mp3 ... voga-46.mp3, 5seg.mp3, vai.mp3): guardadas para funcionar offline.
const FALAS = [
  ...Array.from({ length: 35 }, (_, i) => `${ESCOPO}audio/voga-${i + 12}.mp3`),
  `${ESCOPO}audio/5seg.mp3`,
  `${ESCOPO}audio/vai.mp3`,
];

// Guarda treinos/index.json e os arquivos de treino que ele lista (de melhor esforço), para a lista abrir offline
// mesmo logo depois da primeira visita.
async function guardarTreinos(cache) {
  try {
    const r = await fetch(`${ESCOPO}treinos/index.json`, { cache: "no-cache" });
    if (!r.ok) return;
    const nomes = await r.clone().json();
    await cache.put(`${ESCOPO}treinos/index.json`, r);
    await Promise.allSettled(
      nomes.filter((n) => typeof n === "string").map((n) => cache.add(`${ESCOPO}treinos/${encodeURIComponent(n)}`)),
    );
  } catch {
    /* sem pasta treinos ou sem rede: segue sem */
  }
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE).then(async (c) => {
        await c.addAll(BASE);
        await guardarTreinos(c);
      }),
      // as falas são "de melhor esforço": se alguma falhar, a instalação do app não falha
      caches.open(CACHE_FALAS).then((c) => Promise.allSettled(FALAS.map((u) => c.add(u)))),
    ]).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      // só apaga caches antigos DESTE app (no github.io outros projetos dividem o mesmo domínio)
      .then((nomes) =>
        Promise.all(nomes.filter((n) => n.startsWith("treino-remo-") && n !== CACHE && n !== CACHE_FALAS).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.pathname.startsWith(CAMINHO_API)) return; // API sempre na rede

  // Treinos em arquivos (pasta treinos/): rede primeiro, para que um arquivo novo apareça ao atualizar a página;
  // a cópia guardada só entra se estiver offline.
  if (url.pathname.startsWith(new URL("treinos/", ESCOPO).pathname)) {
    e.respondWith(
      fetch(req, { cache: "no-cache" })
        .then((r) => {
          if (r.ok) {
            const copia = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return r;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }

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
              caches.open(url.pathname.startsWith(new URL("audio/", ESCOPO).pathname) ? CACHE_FALAS : CACHE).then((c) => c.put(req, copia));
            }
            return r;
          })
          .catch(() => emCache);
        return emCache || rede;
      }),
    );
  }
});
