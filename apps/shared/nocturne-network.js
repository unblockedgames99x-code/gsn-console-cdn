(() => {
  const originalFetch=window.fetch.bind(window), OriginalEventSource=window.EventSource;
  const route=value=>{
    try {const url=new URL(value,location.href);if(['d27jvgogyihpmk.cloudfront.net','nocturne.lol'].includes(url.hostname))return location.origin+'/gh/unblockedgames99x-code/gsn-console-cdn@v20260929-2/apps/nocturne-relay/'+encodeURIComponent(url.origin+url.pathname)+url.search;}catch{}
    return value;
  };
  const ready=(async()=>{
    if(!navigator.serviceWorker)throw new Error('Open this app from the console web preview.');
    const reg=await navigator.serviceWorker.register('/gh/unblockedgames99x-code/gsn-console-cdn@v20260929-2/apps/nocturne-sw.js',{scope:'/gh/unblockedgames99x-code/gsn-console-cdn@v20260929-2/apps/',type:'module'});
    if(!reg.active)await new Promise(resolve=>{const worker=reg.installing||reg.waiting;worker?.addEventListener('statechange',()=>{if(worker.state==='activated')resolve();});});
    if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  })();
  window.NOCTURNE_NETWORK={ready,route};
  window.fetch=async(input,options)=>{
    const value=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    const next=route(value);
    if(next===value)return originalFetch(input,options);
    await ready;
    return originalFetch(next, input instanceof Request ? new Request(next,input) : options);
  };
  // EventSource is created only after authentication, once the worker is ready.
  window.EventSource=function(url,options){return new OriginalEventSource(route(url),options);};
  window.EventSource.prototype=OriginalEventSource.prototype;
  for(const key of ['OPEN','CLOSED','CONNECTING'])window.EventSource[key]=OriginalEventSource[key];
})();
