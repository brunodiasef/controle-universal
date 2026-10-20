// Service worker do Smart Remote: permite abrir o app sem internet depois da primeira visita.
// Nunca intercepta comandos para a TV, para a ponte (/api/) nem para outros endereços.
const CACHE = 'brunoversal-v4';
const CORE = ['./', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;

  if (request.mode === 'navigate') {
    // Página: tenta a rede primeiro para receber atualizações; sem rede, usa a cópia salva.
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put('./', copy)); }
          return response;
        })
        .catch(() => caches.match('./')),
    );
    return;
  }

  // Arquivos (JS/CSS/ícones): usa a cópia salva e atualiza em segundo plano.
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(request, copy)); }
        return response;
      });
      if (cached) { network.catch(() => {}); return cached; }
      return network;
    }),
  );
});
