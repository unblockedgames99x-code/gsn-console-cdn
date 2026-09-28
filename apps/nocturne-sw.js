import CurlTransport from './movie-proxy/vendor/curl/index.mjs';
// Only the explicit relay prefix is handled. Browser/movie proxy workers retain their own scopes.
const PREFIX = '/gh/unblockedgames99x-code/gsn-console-cdn@v20260928-7/apps/nocturne-relay/';
let ready;
async function transport() {
  if (!ready) ready = (async () => {
    const client = new CurlTransport({wisp:'wss://d27jvgogyihpmk.cloudfront.net/wisp/'});
    await client.init(); return client;
  })().catch(error => {ready=null;throw error;});
  return ready;
}
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(!url.pathname.startsWith(PREFIX))return;
  event.respondWith((async()=>{
    try {
      let remote=new URL(decodeURIComponent(url.pathname.slice(PREFIX.length))+url.search);
      if(!['d27jvgogyihpmk.cloudfront.net','nocturne.lol'].includes(remote.hostname)||remote.protocol!=='https:')return new Response('Unknown service',{status:400});
      // Nocturne's thumbnail endpoint currently returns 502 for valid YouTube
      // artwork. Fetch those same image URLs over its Wisp transport instead.
      if(remote.pathname==='/gh/unblockedgames99x-code/gsn-console-cdn@v20260928-7/api/youtube/thumb') {
        const encoded=remote.searchParams.get('url')||'';
        const image=new URL(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')));
        if(image.protocol!=='https:'||!/(^|\.)(ytimg\.com|ggpht\.com|googleusercontent\.com)$/.test(image.hostname))return new Response('Unknown thumbnail host',{status:400});
        remote=image;
      }
      const request=event.request, client=await transport();
      const headers=[...request.headers].filter(([key])=>!['host','origin','referer','cookie','accept-encoding'].includes(key));
      headers.push(['Origin','https://nocturne.lol'],['Referer','https://nocturne.lol/']);
      let method=request.method, body=['GET','HEAD'].includes(method)?undefined:await request.arrayBuffer();
      for(let i=0;i<6;i++) {
        const result=await client.request(remote,method,body,headers,request.signal);
        const incoming=new Headers(result.headers);
        if([301,302,303,307,308].includes(result.status)&&incoming.has('location')){
          remote=new URL(incoming.get('location'),remote);
          if(remote.protocol!=='https:')throw new Error('Insecure redirect');
          if(result.status===303||[301,302].includes(result.status)&&method==='POST'){method='GET';body=undefined;}
          await result.body?.cancel?.();continue;
        }
        const outgoing=new Headers();
        for(const name of ['content-type','content-range','accept-ranges','cache-control','etag'])if(incoming.has(name))outgoing.set(name,incoming.get(name));
        outgoing.set('Cache-Control','no-store');
        return new Response(['HEAD'].includes(method)||[204,304].includes(result.status)?null:result.body,{status:result.status,statusText:result.statusText,headers:outgoing});
      }
      throw new Error('Too many redirects');
    }catch(error){return Response.json({error:'Nocturne connection failed: '+error.message},{status:502});}
  })());
});

self.GSN_CDN_SKIP=event=>new URL(event.request.url).pathname.startsWith(PREFIX);
await import('../launcher-sw.js');
