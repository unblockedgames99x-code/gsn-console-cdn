/* Scoped proxy worker; never takes control of the console or other apps. */
importScripts('./vendor/jet/jet.sw.js');
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if ($jetController.shouldRoute(event)) event.respondWith($jetController.route(event));
});

self.GSN_CDN_SKIP=event=>$jetController.shouldRoute(event);
importScripts('../../launcher-sw.js');
