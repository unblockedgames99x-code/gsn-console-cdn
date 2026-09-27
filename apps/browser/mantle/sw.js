// A separate scope keeps Mantle's runtime out of the default browser connection.
importScripts('./vendor/controller.sw.js');
addEventListener('fetch', event => {
  if ($scramjetController.shouldRoute(event)) event.respondWith($scramjetController.route(event));
});

self.GSN_CDN_SKIP=event=>$scramjetController.shouldRoute(event);
importScripts('../../../launcher-sw.js');
