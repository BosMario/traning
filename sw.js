// FitLog Service Worker — ทำให้เปิดใช้ได้แม้ไม่มีเน็ต (เช่น ที่ยิมสัญญาณแย่)
const CACHE = 'fitlog-v7';

// ไฟล์ในเครื่อง (app shell) — precache ตอนติดตั้ง
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-512.png',
];

// ไลบรารีภายนอก (CDN) — จะถูก cache ครั้งแรกที่โหลดออนไลน์ แล้วใช้ได้ offline
const CDN = [
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7.24.7/babel.min.js',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // precache แต่ละไฟล์แบบไม่ให้ล้มทั้งหมดถ้าตัวใดตัวหนึ่งพลาด
    await Promise.allSettled([...SHELL, ...CDN].map(async (url) => {
      try { const res = await fetch(url, { cache: 'reload' }); if (res.ok || res.type === 'opaque') await cache.put(url, res.clone()); } catch (_) {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // แตะเฉพาะไฟล์ในเครื่อง + CDN ที่รู้จัก — ปล่อยอย่างอื่น (เช่น YouTube) ให้เบราว์เซอร์โหลดเอง
  const sameOrigin = url.origin === self.location.origin;
  const isCDN = /(^|\.)unpkg\.com$|(^|\.)jsdelivr\.net$|(^|\.)cdn\.tailwindcss\.com$/.test(url.host);
  if (!sameOrigin && !isCDN) return;

  // นำทาง (เปิดหน้า) → network-first, ตกมาที่ index.html ใน cache
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', fresh.clone()).catch(()=>{});
        return fresh;
      } catch (_) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // ไลบรารี/แอสเซต → cache-first (โหลดครั้งแรกออนไลน์ แล้วใช้ offline ได้)
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreVary: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone()).catch(()=>{});
      }
      return res;
    } catch (_) {
      return cached || Response.error();
    }
  })());
});
