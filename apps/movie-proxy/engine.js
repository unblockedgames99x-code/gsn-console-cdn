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
  const reg = await navigator.serviceWorker.register('/gh/unblockedgames99x-code/gsn-console-cdn@v20260929-3/apps/movie-proxy/sw.js', { scope: '/gh/unblockedgames99x-code/gsn-console-cdn@v20260929-3/apps/movie-proxy/' });
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
  // Recover a failed read on another connection without replaying submissions.
  // Certificate validation stays enabled on every transport.
  const initialRequest=transport.request.bind(transport);
  let fallback;
  transport.request=async(...args)=>{
    try{return await initialRequest(...args);}
    catch(error){
      if(args[4]?.aborted || !/^(GET|HEAD)$/i.test(args[1]) || args[2]!=null || !/error code (5|6|7|18|28|35|52|55|56|92)\b|network|fetch|connection/i.test(String(error)))throw error;
      fallback ||= (async()=>{const client=new CurlTransport({wisp:servers[(connection+2)%servers.length]});await client.init();return client;})().catch(failure=>{fallback=null;throw failure;});
      return (await fallback).request(...args);
    }
  };
  configureTransport?.(transport);
  const controller = new $jetController.Controller({
    serviceworker: worker, transport,
    jetConfig: { maskedfiles: ['jet.inject.js', 'jet.wasm.js'] },
    config: { prefix: '/gh/unblockedgames99x-code/gsn-console-cdn@v20260929-3/apps/movie-proxy/~/', jetPath: '/gh/unblockedgames99x-code/gsn-console-cdn@v20260929-3/apps/movie-proxy/vendor/jet/jet.core.js', injectPath: '/gh/unblockedgames99x-code/gsn-console-cdn@v20260929-3/apps/movie-proxy/vendor/jet/jet.inject.js', wasmPath: '/gh/unblockedgames99x-code/gsn-console-cdn@v20260929-3/apps/movie-proxy/vendor/jet/jet.wasm' },
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
