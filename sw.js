// Bloom Service Worker v11 — safe version
const CACHE = "bloom-v11";
const STATIC = ["/", "/index.html", "/style.css", "/manifest.json"];

// domains to NEVER intercept
const BYPASS = [
  "firestore.googleapis.com",
  "firebase.googleapis.com", 
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "googleapis.com",
  "gstatic.com",
  "firebaseapp.com",
  "groq.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // bypass ALL external APIs — only cache local static files
  if (BYPASS.some(d => url.hostname.includes(d))) return;
  if (url.origin !== self.location.origin) return;
  // only cache GET requests for local files
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

self.addEventListener("push", e => {
  const data = e.data?.json() || { title: "bloom 🌸", body: "hey, checking in on you 💉" };
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, icon: "/icon-192.png",
    vibrate: [100, 50, 100], tag: "bloom-notif"
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.openWindow("/"));
});
