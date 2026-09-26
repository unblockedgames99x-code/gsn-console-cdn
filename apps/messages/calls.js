// Nocturne carries call invitations; PeerJS carries WebRTC signaling, never chat history.
(() => {
  // The current Cherri API has no private call invitation channel.
  if (window.CHERRI_CHAT) {
    for (const id of ['audioCall', 'videoCall']) document.getElementById(id).hidden = true;
    return;
  }
  const modal = document.createElement('section'); modal.className='call-overlay'; modal.hidden=true; modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Call');
  modal.innerHTML='<div class="call-card"><video class="call-remote" autoplay playsinline></video><video class="call-local" autoplay playsinline muted hidden></video><div class="call-avatar"></div><h2></h2><p role="status"></p><div class="call-actions"><button class="answer-call" aria-label="Answer call" hidden>✓</button><button class="mute-call" aria-label="Mute microphone"><svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg></button><button class="camera-call" aria-label="Turn camera off" hidden><svg viewBox="0 0 24 24"><rect x="2" y="5" width="13" height="14" rx="3"/><path d="m15 9 7-4v14l-7-4"/></svg></button><button class="end-call" aria-label="End call"><svg viewBox="0 0 24 24"><path d="M3 14c5-5 13-5 18 0v4h-5v-4M8 14v4H3"/></svg></button></div></div>';
  document.body.append(modal);
  const find = name => modal.querySelector(name), status=find('p'), remote=find('.call-remote'), local=find('.call-local');
  let conversation, peer, connection, media, timer, current, returnFocus, invites=new Map();
  const prefix='[GSN call] ';
  const peerId=async id=>'gsn-'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('nocturne:'+id)))).slice(0,16).map(v=>v.toString(16).padStart(2,'0')).join('');
  const show = (name,text,video) => {returnFocus=document.activeElement;modal.hidden=false;find('h2').textContent=name;find('.call-avatar').textContent=(name||'?')[0].toUpperCase();status.textContent=text;find('.camera-call').hidden=!video;find('.end-call').focus();};
  function end(hide=true) {
    clearTimeout(timer); const active=connection;connection=null;active?.close();media?.getTracks().forEach(track=>track.stop());media=null;remote.srcObject=null;local.srcObject=null;local.hidden=true;current=null;find('.answer-call').hidden=true;find('.call-card').classList.remove('connected');
    if(hide){modal.hidden=true;returnFocus?.focus();} else {status.textContent='Call ended';find('.end-call').setAttribute('aria-label','Close call');}
  }
  function fail(error){end(false);status.textContent=error?.name==='NotAllowedError'?'Microphone or camera access was declined. Enable it in your browser to call.':error.message||'The call could not connect.';}
  function attach(call) {
    connection=call;
    call.on('stream',stream=>{clearTimeout(timer);remote.srcObject=stream;remote.play().catch(()=>{status.textContent='Click to play call audio';remote.controls=true;});status.textContent='Connected';if(stream.getVideoTracks().length)find('.call-card').classList.add('connected');});
    call.on('close',()=>{if(connection===call)end(false);});call.on('error',fail);
  }
  async function ensurePeer() {
    if(peer&&!peer.destroyed&&!peer.disconnected) {if(peer.open)return peer;return new Promise((resolve,reject)=>{peer.once('open',()=>resolve(peer));peer.once('error',reject);});}
    const id=await peerId(window.NOCTURNE_CHAT.me.id);
    peer=new Peer(id);
    peer.on('call',call=>{
      const invite=invites.get(call.metadata?.nonce);
      if(!invite||invite.expires<Date.now()||call.peer!==invite.peer||current){call.close();return;}
      current=invite;show(invite.name,'Incoming '+(invite.video?'video':'audio')+' call',invite.video);find('.answer-call').hidden=false;
      timer=setTimeout(()=>end(),60000);connection=call;
      find('.answer-call').onclick=async()=>{find('.answer-call').hidden=true;try{media=await navigator.mediaDevices.getUserMedia({audio:true,video:invite.video});if(!current){media.getTracks().forEach(t=>t.stop());return;}local.srcObject=media;local.hidden=!invite.video;attach(call);call.answer(media);status.textContent='Connecting…';}catch(error){fail(error);}};
      call.on('close',()=>{if(connection===call)end(false);});
    });
    peer.on('error',error=>{if(current)fail(error);});
    return new Promise((resolve,reject)=>{const deadline=setTimeout(()=>reject(new Error('Call signaling is unavailable. Please try again.')),12000);peer.once('open',()=>{clearTimeout(deadline);resolve(peer);});peer.once('error',error=>{clearTimeout(deadline);reject(error);});});
  }
  async function start(video) {
    if(!conversation?.channel?.recipientId||current)return;
    const person=conversation.person || {displayName:conversation.channel.name};
    current={nonce:crypto.randomUUID(),video};const pendingCall=current;
    show(person.displayName || person.username,'Connecting…',video);
    try {
      await ensurePeer();media=await navigator.mediaDevices.getUserMedia({audio:true,video});
      if(current!==pendingCall){media.getTracks().forEach(t=>t.stop());return;}
      local.srcObject=media;local.hidden=!video;
      const recipient=conversation.channel.recipientId;
      const invitation={nonce:current.nonce,peer:peer.id,video,expires:Date.now()+60000};
      await window.NOCTURNE_CHAT.request('/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-2/api/dm/with/'+encodeURIComponent(recipient)+'/send',{text:prefix+JSON.stringify(invitation)});
      if(current!==pendingCall)return;
      status.textContent='Calling…';
      // Let the receiver consume the authenticated invitation before signaling.
      await new Promise(resolve=>setTimeout(resolve,900));
      if(current!==pendingCall)return;
      attach(peer.call(await peerId(recipient),media,{metadata:{nonce:current.nonce}}));
      timer=setTimeout(()=>{end(false);status.textContent='No answer. The other person must have Chat open.';},60000);
    } catch(error) {fail(error);}
  }
  window.addEventListener('messages-conversation',event=>{conversation=event.detail;const enabled=!!conversation.channel?.recipientId;document.getElementById('audioCall').hidden=!enabled;document.getElementById('videoCall').hidden=!enabled;if(conversation.me)ensurePeer().catch(()=>{});});
  window.addEventListener('nocturne-dm',async event=>{
    const message=event.detail;if(!message.text?.startsWith(prefix))return;
    try{const invite=JSON.parse(message.text.slice(prefix.length));if(invite.expires<Date.now()||invite.expires>Date.now()+90000||invite.peer!==await peerId(message.senderId))return;invite.name=message.username || 'Incoming call';invites.set(invite.nonce,invite);setTimeout(()=>invites.delete(invite.nonce),65000);await ensurePeer();}catch{}
  });
  document.getElementById('audioCall').onclick=()=>start(false);document.getElementById('videoCall').onclick=()=>start(true);
  find('.end-call').onclick=()=>end();
  find('.mute-call').onclick=()=>{for(const track of media?.getAudioTracks()||[])track.enabled=!track.enabled;const muted=!media?.getAudioTracks()[0]?.enabled;find('.mute-call').setAttribute('aria-pressed',String(muted));find('.mute-call').setAttribute('aria-label',muted?'Unmute microphone':'Mute microphone');};
  find('.camera-call').onclick=()=>{for(const track of media?.getVideoTracks()||[])track.enabled=!track.enabled;const off=!media?.getVideoTracks()[0]?.enabled;find('.camera-call').setAttribute('aria-pressed',String(off));find('.camera-call').setAttribute('aria-label',off?'Turn camera on':'Turn camera off');};
  modal.addEventListener('keydown',event=>{if(event.key==='Tab'){const buttons=[...modal.querySelectorAll('button:not([hidden])')];const i=buttons.indexOf(document.activeElement);if(event.shiftKey&&i===0){event.preventDefault();buttons.at(-1).focus();}else if(!event.shiftKey&&i===buttons.length-1){event.preventDefault();buttons[0].focus();}}});
  window.addEventListener('pagehide',()=>{end();peer?.destroy();});
})();
