(()=>{'use strict';
 const video=window.GSN_YOUTUBE.parse(new URLSearchParams(location.search).get('url')||'');
 const status=document.getElementById('status'),retry=document.getElementById('retry'),external=document.getElementById('external');
 let player,timer;
 const report=data=>parent.postMessage({type:'gsn-youtube-player',...data},location.origin);
 function fail(message){clearTimeout(timer);status.textContent=message;retry.hidden=false;}
 if(!video){fail('This YouTube video link is invalid.');return;}
 external.href=video.url;external.hidden=false;
 retry.onclick=()=>location.reload();
 window.onYouTubeIframeAPIReady=()=>{
  player=new YT.Player('player',{host:'https://www.youtube.com',videoId:video.id,width:'100%',height:'100%',playerVars:{autoplay:1,playsinline:1,rel:0,start:video.start,origin:location.origin},events:{
   onReady:()=>{clearTimeout(timer);status.textContent='Press play if playback doesn’t start automatically.';report({ready:true,url:video.url,title:player.getVideoData()?.title||'YouTube'});},
   onStateChange:event=>{if(event.data===1){clearTimeout(timer);status.textContent='Playing on YouTube';retry.hidden=true;}else if(event.data===2)status.textContent='Paused';else if(event.data===0)status.textContent='Video finished';},
   onAutoplayBlocked:()=>{status.textContent='Press play to start the video.';},
   onError:event=>{const messages={2:'This video link is invalid.',5:'The browser couldn’t decode this video. Try again or open it on YouTube.',100:'This video is unavailable or private.',101:'The owner only allows this video to play on YouTube.',150:'The owner only allows this video to play on YouTube.',153:'YouTube couldn’t verify this player’s origin. Open it on YouTube.'};fail(messages[event.data]||'YouTube couldn’t play this video. Try again or open it on YouTube.');}
  }});
 };
 const api=document.createElement('script');api.src='https://www.youtube.com/iframe_api';api.onerror=()=>fail('YouTube couldn’t be reached. Check your connection or open it on YouTube.');document.head.append(api);
 timer=setTimeout(()=>fail('YouTube is taking longer than expected. Try again or open it on YouTube.'),25000);
 addEventListener('pagehide',()=>{clearTimeout(timer);player?.destroy();});
})();
