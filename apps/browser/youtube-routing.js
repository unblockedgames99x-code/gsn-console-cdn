/* Keep YouTube watch pages out of the script-rewriting proxy renderer. */
(()=>{'use strict';
 const parse=window.GSN_YOUTUBE?.parse,originalMakeFrame=window.makeFrame,originalOnFrameUrl=window.onFrameUrl;
 if(!parse||typeof originalMakeFrame!=='function')return;
 const handleFor=tab=>Object.values(tab||{}).find(v=>v&&typeof v.go==='function');
 function destination(raw,base){
  const direct=parse(raw,base);if(direct)return direct;
  try{
   const local=new URL(raw,location.href);if(local.origin!==location.origin)return null;
   // Both proxy engines encode the remote URL in the path. Only accept a
   // decoded, validated YouTube video URL, never an arbitrary destination.
   for(const part of local.pathname.split('/')){let decoded;try{decoded=decodeURIComponent(part);}catch{continue;}if(/^https?:\/\//.test(decoded)){const video=parse(decoded+local.hash);if(video)return video;}}
  }catch{}
  return null;
 }
 function route(tab,video){const handle=handleFor(tab);if(!handle)return;handle.go(video.url);originalOnFrameUrl?.(tab,video.url);}
 function installClicks(tab,frame){
  try{
   const doc=frame.contentDocument;if(!doc||doc.__gsnYouTubeLinks)return;doc.__gsnYouTubeLinks=true;
   frame.contentWindow.addEventListener('click',event=>{
    if(event.button!==0||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
    const anchor=event.target?.closest?.('a[href]');if(!anchor)return;
    const video=destination(anchor.getAttribute('href'),tab.url);if(!video)return;
    event.preventDefault();event.stopImmediatePropagation();route(tab,video);
   },true);
  }catch{/* Cross-origin embeds retain their own navigation. */}
 }
 window.makeFrame=function(tab){
  const result=originalMakeFrame.apply(this,arguments),handle=handleFor(tab),frame=tab.frameEl;
  if(!handle||!frame||handle.youtubeRouting)return result;
  handle.youtubeRouting=true;
  const originalGo=handle.go.bind(handle);
  handle.go=function(value){
   const video=parse(value);
   if(!video){delete frame.dataset.youtubePlayer;return originalGo(value);}
   delete frame.dataset.mantleTab;delete frame.dataset.moviePlayer;
   frame.dataset.youtubePlayer=video.id;frame.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture');frame.setAttribute('allowfullscreen','');
   const wrapper=new URL('./youtube-player.html',location.href);wrapper.searchParams.set('url',video.url);frame.src=wrapper.href;
  };
  const load=()=>{if(!frame.dataset.youtubePlayer)installClicks(tab,frame);};frame.addEventListener('load',load);
  const listener=event=>{
   if(event.source!==frame.contentWindow||event.origin!==location.origin||event.data?.type!=='gsn-youtube-player'||!frame.dataset.youtubePlayer)return;
   const video=parse(event.data.url);if(!video||video.id!==frame.dataset.youtubePlayer)return;
   if(event.data.title){tab.title=String(event.data.title).slice(0,200);renderTabs();}
  };
  addEventListener('message',listener);
  const cleanup=new MutationObserver(()=>{if(!frame.isConnected){removeEventListener('message',listener);frame.removeEventListener('load',load);cleanup.disconnect();}});cleanup.observe(frame.parentNode,{childList:true});
  return result;
 };
 window.onFrameUrl=function(tab,value){const video=parse(value);if(video&&tab?.frameEl?.dataset.youtubePlayer!==video.id)route(tab,video);else return originalOnFrameUrl.apply(this,arguments);};
})();
