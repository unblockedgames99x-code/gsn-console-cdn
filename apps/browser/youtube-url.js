/* Parse video destinations without accepting lookalike hosts or arbitrary embeds. */
(()=>{'use strict';
 function parse(value,base='https://www.youtube.com/'){
  let url;try{url=new URL(value,base);}catch{return null;}
  if(!/^https?:$/.test(url.protocol))return null;
  const host=url.hostname.toLowerCase(),parts=url.pathname.split('/').filter(Boolean);
  let id;
  if(host==='youtu.be')id=parts[0];
  else if(/^(?:www\.|m\.|music\.)?youtube\.com$/.test(host)||/^(?:www\.)?youtube-nocookie\.com$/.test(host)){
   if(url.pathname==='/watch')id=url.searchParams.get('v');
   else if(['shorts','live','embed','v'].includes(parts[0]))id=parts[1];
  }
  if(!/^[\w-]{11}$/.test(id||''))return null;
  const raw=url.searchParams.get('start')||url.searchParams.get('t')||url.hash.match(/(?:^#|&)t=([^&]+)/)?.[1]||'';
  let start=0;
  if(/^\d+(?:\.\d+)?$/.test(raw))start=Math.floor(Number(raw));
  else if(/^(?:\d+h)?(?:\d+m)?(?:\d+s)?$/.test(raw))start=(Number(raw.match(/(\d+)h/)?.[1])||0)*3600+(Number(raw.match(/(\d+)m/)?.[1])||0)*60+(Number(raw.match(/(\d+)s/)?.[1])||0);
  start=Math.min(start,604800);
  const canonical=new URL('https://www.youtube.com/watch');canonical.searchParams.set('v',id);if(start)canonical.searchParams.set('t',String(start));
  return{id,start,url:canonical.href};
 }
 window.GSN_YOUTUBE={parse};
})();
