(() => {
  'use strict';
  const BUILD_ID = '20260901fix2';
  const isServiceWorker = typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope;

  if (isServiceWorker) {
    const CACHE = `drivesg-shell-${BUILD_ID}`;
    const shell = [
      './',
      './index.html',
      `./styles.css?b=${BUILD_ID}`,
      `./app.js?b=${BUILD_ID}`,
      `./boot.js?b=${BUILD_ID}`
    ];
    const optionalRuntime = [
      'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js'
    ];

    self.addEventListener('install', event => {
      event.waitUntil(
        caches.open(CACHE)
          .then(async cache => {
            await Promise.all(shell.map(url => cache.add(url).catch(() => {})));
            await Promise.all(optionalRuntime.map(url => cache.add(url).catch(() => {})));
          })
          .catch(() => {})
          .then(() => self.skipWaiting())
      );
    });

    self.addEventListener('activate', event => {
      event.waitUntil(
        caches.keys()
          .then(keys => Promise.all(keys.filter(k => k.startsWith('drivesg-shell-') && k !== CACHE).map(k => caches.delete(k))))
          .then(() => self.clients.claim())
      );
    });

    self.addEventListener('fetch', event => {
      const req = event.request;
      if (req.method !== 'GET') return;
      const url = new URL(req.url);
      const sameOrigin = url.origin === self.location.origin;
      const isShell = sameOrigin && (
        req.mode === 'navigate' ||
        /\/(?:index\.html|styles\.css|app\.js|boot\.js)$/.test(url.pathname)
      );
      const isThree = /^(?:cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com)$/.test(url.hostname);
      if (!isShell && !isThree) return;

      event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        try {
          const fresh = await fetch(req);
          if (fresh && (fresh.ok || fresh.type === 'opaque')) cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch (_) {
          const cached = await cache.match(req);
          if (cached) return cached;
          if (req.mode === 'navigate') {
            return (await cache.match('./')) || (await cache.match('./index.html'));
          }
          throw _;
        }
      })());
    });
    return;
  }

  const sources = [
    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js',
    'https://unpkg.com/three@0.160.0/build/three.min.js'
  ];

  const loader = document.getElementById('loader');
  const title = document.getElementById('loaderTitle');
  const text = document.getElementById('loaderText');

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { s.remove(); reject(new Error(`Could not load ${src}`)); };
      document.head.appendChild(s);
    });
  }

  async function boot() {
    for (const src of sources) {
      try {
        await loadScript(src);
        if (window.THREE) break;
      } catch (_) {}
    }

    if (!window.THREE) {
      loader?.classList.remove('hidden');
      if (title) title.textContent = '3D engine could not load';
      if (text) text.textContent = 'DriveSG needs an internet connection the first time it opens. Reload when you are online.';
      return;
    }

    try {
      await loadScript(`app.js?b=${BUILD_ID}`);
    } catch (err) {
      console.error(err);
      if (title) title.textContent = 'DriveSG could not start';
      if (text) text.textContent = 'Reload Safari and try again.';
    }
  }

  boot();
})();
