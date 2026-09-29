(() => {
 'use strict';
 if(window.__NEO_METING_INTEGRATION__)return;
 window.__NEO_METING_INTEGRATION__=true;window.__NEO_MUSIC__=true;
 // Public API hosts and source IDs from Cherri's current SVG app.
 const hosts=['https://kristenblackburnvolleyballcamps.com','https://southpadreislandkiteboarding.com'];
 const sources=[['ytm','YouTube Music'],['qobuz','Qobuz (lossless)'],['tidal','Tidal (search)'],['octave','Octave (320kbps)'],['scdlp','SoundCloud (yt-dlp)'],['soundcloud','SoundCloud']];
 const read=key=>{try{return localStorage.getItem(key)}catch{return null}};
 const save=(key,value)=>{try{localStorage.setItem(key,value)}catch{}};
 let source=read('gsn-music-source-v1');if(!sources.some(s=>s[0]===source))source='ytm';
 let connection=read('gsn-music-connection-v1');if(!hosts.includes(connection))connection='auto';
 let host=connection==='auto'?(hosts.includes(read('gsn-music-api-host'))?read('gsn-music-api-host'):hosts[0]):connection;
 let pending;
 const base=()=>new URL('../../api/console-services/music',location.href).href;
 const routed=(url,candidate=host)=>{const u=new URL(url);u.searchParams.set('_gsn_music_server',String(hosts.indexOf(candidate)));return u.href};
 async function ready(){
  if(!pending)pending=(async()=>{
   if(connection!=='auto')return;
   for(const candidate of [host,...hosts.filter(h=>h!==host)]){
    try{const r=await fetch(routed(base()+'/ping',candidate),{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(4000)});if(r.ok&&(await r.json()).ok){host=candidate;save('gsn-music-api-host',host);return}}catch{}
   }
  })();
  await pending;
 }
 async function request(url,options={}){
  await ready();
  const original=new URL(url);
  const candidates=connection==='auto'?[host,...hosts.filter(h=>h!==host)]:[host];
  let error;
  for(const candidate of candidates){
   if(options.signal?.aborted)throw options.signal.reason;
   try{
    const r=await fetch(routed(original.href,candidate),{...options,credentials:'omit'});
    if(r.status>=500&&candidate!==candidates.at(-1)){await r.body?.cancel();continue;}
    host=candidate;save('gsn-music-api-host',host);return r;
   }catch(e){if(options.signal?.aborted)throw e;error=e;}
  }
  throw error||new Error('Music server unavailable');
 }
 const params=(id,track={})=>new URLSearchParams({id,quality:'HIGH',source:track.source||track.src||source,artist:track.artist||'',title:track.title||'',duration:track.duration||0,...(track.isrc?{isrc:track.isrc}:{})});
 window.__NEO_MUSIC_API__=Object.freeze({
  get base(){return base()},get source(){return source},get connection(){return connection},sources,hosts,ready,request,
  setSource(value){if(!sources.some(s=>s[0]===value))return;source=value;save('gsn-music-source-v1',value)},
  setConnection(value){if(value!=='auto'&&!hosts.includes(value))return;connection=value;save('gsn-music-connection-v1',value);if(value!=='auto')host=value;pending=null},
  searchUrl:query=>base()+'/search?'+new URLSearchParams({q:query||'',limit:20,source}),
  homeUrl:()=>base()+'/search?'+new URLSearchParams({q:'top hits',limit:20,source}),
  homeSections:payload=>[{section:'Popular songs',tracks:payload.items||[]}],
  trackUrl:(id,track)=>routed(base()+'/stream?'+params(id,track)),
  manifestUrl:(id,track)=>base()+'/manifest?'+params(id,track),
  coverUrl:value=>{if(!value)return '';try{let u=new URL(value,location.origin);if(u.pathname.endsWith('/music/art')&&u.searchParams.has('u'))u=new URL(u.searchParams.get('u'));if(u.protocol!=='https:')return '';return routed(base()+'/art?u='+encodeURIComponent(u.href))}catch{return ''}},
  isRelayUrl:value=>{try{const u=new URL(value,location.href);return u.href.startsWith(base()+'/')}catch{return false}}
 });
 window.NEO_PROXY_CLIENT={resolve:url=>Promise.resolve(new URL(url,location.href).href),image:url=>Promise.resolve(new URL(url,location.href).href)};
})();
