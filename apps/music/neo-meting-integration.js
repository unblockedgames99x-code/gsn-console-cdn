(() => {
 'use strict';
 if(window.__NEO_METING_INTEGRATION__)return;
 window.__NEO_METING_INTEGRATION__=true;window.__NEO_MUSIC__=true;
 const base=location.origin+'/gh/unblockedgames99x-code/gsn-console-cdn@v20260927-20/api/console-services/music';
 window.__NEO_MUSIC_SERVER_ORIGIN__=base;
 window.__NEO_MUSIC_API__=Object.freeze({
  base,
  searchUrl:query=>base+'/search?'+new URLSearchParams({q:query||'',limit:20}),
  homeUrl:()=>base+'/search?q=top+hits&limit=20',
  homeSections:payload=>[{section:'Popular songs',tracks:payload.items||[]}],
  trackUrl:(id,track={})=>base+'/stream?'+new URLSearchParams({id,quality:'HIGH',source:track.source||'qobuz',artist:track.artist||'',title:track.title||'',duration:track.duration||0}),
  coverUrl:value=>{if(!value)return '';try{const u=new URL(value,location.origin);if(u.origin===location.origin&&u.pathname.startsWith('/gh/unblockedgames99x-code/gsn-console-cdn@v20260927-20/api/console-services/music/art'))return u.href;if(u.protocol!=='https:')return '';return base+'/art?u='+encodeURIComponent(u.href)}catch{return ''}},
  isRelayUrl:value=>{try{return new URL(value,location.href).pathname.startsWith('/gh/unblockedgames99x-code/gsn-console-cdn@v20260927-20/api/console-services/music/')}catch{return false}}
 });
 window.NEO_PROXY_CLIENT={resolve:url=>Promise.resolve(new URL(url,location.href).href),image:url=>Promise.resolve(new URL(url,location.href).href)};
})();
