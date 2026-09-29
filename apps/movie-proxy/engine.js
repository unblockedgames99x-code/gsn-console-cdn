import CurlTransport from './vendor/curl/index.mjs';

export const servers = [
  'wss://cdn.northstreetumc.org/adblock/',
  'wss://cdn.vipersfutbol.com/adblock/',
  'wss://cdn.pcesc.org/adblock/',
  'wss://athollcottage.com/connection/',
  'wss://kristenblackburnvolleyballcamps.com/socket/',
];
export const deadline = (promise, ms, message) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(message)), ms);
  Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});

export async function createMovieProxy(connection = 0, configureTransport) {
  if (!navigator.serviceWorker || location.protocol === 'file:') throw new Error('Open Movies from the GSN launcher. The streaming connection needs a secure web page.');
  const reg = await navigator.serviceWorker.register('/gh/unblockedgames99x-code/gsn-console-cdn@v20260928-9/apps/movie-proxy/sw.js', { scope: '/gh/unblockedgames99x-code/gsn-console-cdn@v20260928-9/apps/movie-proxy/' });
  // navigator.serviceWorker.ready can resolve to the parent CDN worker while
  // this more specific registration is still installing.
  const worker = reg.installing || reg.waiting || reg.active;
  if (!worker) throw new Error('The movie connection could not start. Please retry.');
  if (worker.state !== 'activated') await deadline(new Promise((resolve,reject) => {
    const changed=()=>{
      if(worker.state==='activated'||worker.state==='redundant'){
        worker.removeEventListener('statechange',changed);
        worker.state==='activated'?resolve():reject(new Error('The movie connection needs a refresh.'));
      }
    };
    worker.addEventListener('statechange',changed);changed();
  }), 15000, 'The movie service worker did not start. Reload Movies.');
  const transport = new CurlTransport({ wisp: servers[connection % servers.length] });
  for (let attempt = 0; attempt < 80; attempt++) {
    try { await transport.init(); break; }
    catch (error) { if (!String(error).includes('wasm not loaded') || attempt === 79) throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  configureTransport?.(transport);
  const controller = new $jetController.Controller({
    serviceworker: worker, transport,
    jetConfig: { maskedfiles: ['jet.inject.js', 'jet.wasm.js'] },
    config: { prefix: '/gh/unblockedgames99x-code/gsn-console-cdn@v20260928-9/apps/movie-proxy/~/', jetPath: '/gh/unblockedgames99x-code/gsn-console-cdn@v20260928-9/apps/movie-proxy/vendor/jet/jet.core.js', injectPath: '/gh/unblockedgames99x-code/gsn-console-cdn@v20260928-9/apps/movie-proxy/vendor/jet/jet.inject.js', wasmPath: '/gh/unblockedgames99x-code/gsn-console-cdn@v20260928-9/apps/movie-proxy/vendor/jet/jet.wasm' },
  });
  await deadline(controller.wait(), 12000, 'The streaming connection timed out. Try another connection.');
  // A detached frame owns rewriting for catalogue requests without navigating a page.
  const resourceFrame = controller.createFrame(document.createElement('iframe'));
  const route = url => {
    const remote = new URL(url, location.href);
    if (remote.origin === location.origin || ['blob:', 'data:'].includes(remote.protocol)) return remote.href;
    if (remote.protocol !== 'https:') throw new Error('Use an HTTPS media address.');
    resourceFrame.go(remote.href);
    return resourceFrame.element.src;
  };
  return { controller, transport, route, server: servers[connection % servers.length] };
}
