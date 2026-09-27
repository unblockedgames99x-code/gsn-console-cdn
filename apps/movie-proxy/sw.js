/* Scoped proxy worker; never takes control of the console or other apps. */
importScripts('./vendor/jet/jet.sw.js', './image-route.js');
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if ($jetController.shouldRoute(event)) {
    const imageRoute = event.request.destination === 'image'
      ? unwrapProxyImageUrl(event.request.url, self.registration.scope) : null;
    event.respondWith(imageRoute ? Response.redirect(imageRoute, 307) : $jetController.route(event));
  }
});

self.GSN_CDN_SKIP=event=>$jetController.shouldRoute(event);
importScripts('../../launcher-sw.js');
