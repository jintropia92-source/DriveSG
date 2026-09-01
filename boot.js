(() => {
  'use strict';
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
      await loadScript('app.js?b=20260901game1');
    } catch (err) {
      console.error(err);
      if (title) title.textContent = 'DriveSG could not start';
      if (text) text.textContent = 'Reload Safari and try again.';
    }
  }

  boot();
})();
