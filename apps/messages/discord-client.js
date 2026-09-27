/* SPDX-License-Identifier: MIT — UI enhancements over the existing GSN transport. */
(()=>{'use strict';
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 function button(label,icon,action){const b=node('button','dc-button');b.type='button';b.title=label;b.setAttribute('aria-label',label);if(icon){const s=document.createElementNS('http://www.w3.org/2000/svg','svg'),u=document.createElementNS(s.namespaceURI,'use');u.setAttribute('href','#i-'+icon);s.setAttribute('aria-hidden','true');s.append(u);b.append(s);}else b.textContent=label;b.onclick=action;return b;}
 const storage={get(k,f){try{return JSON.parse(localStorage.getItem(k))??f;}catch{return f;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{return false;}}};
 function format(target,text,actions={}){
  // Only create text nodes and known elements. Raw HTML is never interpreted.
  const token=/```(?:[^\n`]*\n)?([\s\S]*?)```|`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|~~([^~\n]+)~~|\|\|([\s\S]+?)\|\||https?:\/\/[^\s<>]+|@[\w.-]+|#[\w-]+/g;
  let pos=0,m;while((m=token.exec(text))){target.append(document.createTextNode(text.slice(pos,m.index)));let n;
   if(m[1]!==undefined){n=node('pre','dc-code');n.append(node('code','',m[1]));}
   else if(m[2]!==undefined)n=node('code','dc-inline-code',m[2]);
   else if(m[3]!==undefined)n=node('strong','',m[3]);else if(m[4]!==undefined)n=node('em','',m[4]);else if(m[5]!==undefined)n=node('s','',m[5]);
   else if(m[6]!==undefined){n=button('Reveal spoiler',null,()=>{n.classList.toggle('revealed');n.setAttribute('aria-label',n.classList.contains('revealed')?'Hide spoiler':'Reveal spoiler');});n.className='dc-spoiler';n.append(node('span','',m[6]));}
   else if(m[0].startsWith('http')){n=node('a','message-link',m[0]);n.href=m[0];n.target='_blank';n.rel='noopener noreferrer';}
   else if(m[0][0]==='@'){const user=actions.user?.(m[0].slice(1));n=user?button(m[0],null,()=>actions.profile(user)):node('span','',m[0]);n.className='message-mention';}
   else{n=button(m[0],null,()=>actions.channel?.(m[0].slice(1)));n.className='message-mention';}
   target.append(n);pos=token.lastIndex;
  }target.append(document.createTextNode(text.slice(pos)));
 }
 function timeline(root,hooks){
  let id=null,list=[],entries=[],offsets=[0],nodes=new Map(),sizes=new Map(),positions=new Map(),frame=0,atBottom=true,known=new Set(),unseen=0,rendering=false;
  let suspended=false,resumePosition=null;
  const top=node('div','dc-spacer'),bottom=node('div','dc-spacer'),jump=document.getElementById('newMessagesButton');
  root.setAttribute('aria-live','off');root.tabIndex=0;
  const announce=node('div','sr-only');announce.setAttribute('role','status');root.after(announce);
  const ro=new ResizeObserver(items=>{if(rendering)return;let changed=false,anchor=locate(root.scrollTop),delta=0;for(const {target,borderBoxSize,contentRect}of items){const key=target.dataset.virtualKey;const idx=entries.findIndex(e=>e.key===key);if(idx<0)continue;const h=Math.ceil(borderBoxSize?.[0]?.blockSize||contentRect.height);const prev=sizes.get(key)||estimate(entries[idx]);if(h&&Math.abs(h-prev)>1){sizes.set(key,h);if(idx<anchor)delta+=h-prev;changed=true;}}if(changed){calc();if(atBottom)root.scrollTop=offsets.at(-1);else root.scrollTop+=delta;schedule();}});
  function estimate(e){return e.day?36:Math.min(700,(e.start?64:26)+Math.ceil((e.message.text||'').length/110)*22+(e.message.replyTo?24:0)+(e.message.attachments?.length?280:0)+(e.message.reactions?.length?30:0));}
  function calc(){offsets=[0];entries.forEach(e=>offsets.push(offsets.at(-1)+(sizes.get(e.key)||estimate(e))));}
  function locate(y){let lo=0,hi=entries.length;while(lo<hi){const m=(lo+hi)>>1;if(offsets[m+1]<y)lo=m+1;else hi=m;}return lo;}
  function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;draw();});}
  function draw(){
   if(suspended||!root.clientHeight||!entries.length)return;rendering=true;
   const start=Math.max(0,locate(root.scrollTop-500)),end=Math.min(entries.length,locate(root.scrollTop+root.clientHeight+600)+1);
   top.style.height=offsets[start]+'px';bottom.style.height=Math.max(0,offsets.at(-1)-offsets[end])+'px';
   const wanted=[top],next=new Map();
   for(let i=start;i<end;i++){const e=entries[i];let cached=nodes.get(e.key);if(!cached||cached.signature!==e.signature){let row;if(e.day)row=node('div','day-divider',hooks.day(e.message.createdAt));else row=hooks.row(e.message,e.start,e.end);row.dataset.virtualKey=e.key;cached={node:row,signature:e.signature};}next.set(e.key,cached);wanted.push(cached.node);}
   wanted.push(bottom);const keep=new Set(wanted);for(const child of [...root.children])if(!keep.has(child)){ro.unobserve(child);child.remove();}
   let cursor=root.firstChild;for(const child of wanted){if(child===cursor)cursor=cursor.nextSibling;else root.insertBefore(child,cursor);if(child.dataset.virtualKey)ro.observe(child);}
   nodes=next;rendering=false;positions.set(id,{top:root.scrollTop,bottom:atBottom});
  }
  function reset(next){if(id)positions.set(id,{top:root.scrollTop,bottom:atBottom});id=next;atBottom=positions.get(next)?.bottom??true;nodes.clear();ro.disconnect();entries=[];known.clear();unseen=0;jump.hidden=true;announce.textContent="";root.replaceChildren();}
  function update(next,data){
   const changed=id!==next;if(changed){reset(next);window.ChatReactions?.close();}
   const added=data.filter(m=>!known.has(m.id));if(!changed&&added.length){announce.textContent=added.length+' new message'+(added.length===1?'':'s');if(!atBottom){unseen+=added.length;jump.hidden=false;jump.textContent='↓ '+unseen+' new messages';}}
   known=new Set(data.map(m=>m.id));list=data;const byId=new Map(data.map(m=>[m.id,m]));entries=[];
   data.forEach((m,i)=>{const prev=data[i-1],next=data[i+1],day=!prev||new Date(prev.createdAt).toDateString()!==new Date(m.createdAt).toDateString();if(day)entries.push({key:id+':day:'+m.id,day:true,message:m,signature:String(m.createdAt)});const start=day||!!m.replyTo||prev.authorId!==m.authorId||m.createdAt-prev.createdAt>300000,end=!next||next.authorId!==m.authorId||next.createdAt-m.createdAt>300000||!!next.replyTo;entries.push({key:id+':'+m.id,message:m,start,end,signature:JSON.stringify([m,start,end,hooks.user(m.authorId),byId.get(m.replyTo)])});});
   calc();if(!entries.length){ro.disconnect();nodes.clear();root.replaceChildren(node('div','thread-empty','No messages yet. Say hello.'));return;}
   if(changed){const saved=positions.get(id);atBottom=saved?.bottom??true;root.replaceChildren(top,bottom);top.style.height=offsets.at(-1)+'px';root.scrollTop=atBottom?offsets.at(-1):saved.top;}
   else if(atBottom){top.style.height=offsets.at(-1)+'px';root.scrollTop=offsets.at(-1);}
   draw();if(atBottom){root.scrollTop=root.scrollHeight;schedule();}
   // Height metadata is bounded independently of channel/message caches.
   if(sizes.size>4000){const live=new Set(entries.map(e=>e.key));for(const k of sizes.keys())if(!live.has(k))sizes.delete(k);}
   if(positions.size>32)positions.delete(positions.keys().next().value);
  }
  function jumpTo(messageId){const i=entries.findIndex(e=>!e.day&&e.message.id===messageId);if(i<0)return false;atBottom=false;root.scrollTop=Math.max(0,offsets[i]-70);draw();const row=nodes.get(entries[i].key)?.node;row?.classList.add('dc-located');row?.setAttribute('tabindex','-1');row?.focus({preventScroll:true});setTimeout(()=>row?.classList.remove('dc-located'),2500);return true;}
  root.addEventListener('scroll',()=>{if(suspended||!root.clientHeight)return;atBottom=root.scrollHeight-root.scrollTop-root.clientHeight<60;if(atBottom){unseen=0;jump.hidden=true;hooks.read();}schedule();},{passive:true});
  jump.onclick=()=>{atBottom=true;root.scrollTop=root.scrollHeight;unseen=0;jump.hidden=true;draw();hooks.read();};
  const containerObserver=new ResizeObserver(()=>{if(suspended||!root.clientHeight)return;sizes.clear();calc();schedule();});containerObserver.observe(root);
  window.addEventListener('pagehide',()=>{ro.disconnect();containerObserver.disconnect();cancelAnimationFrame(frame);},{once:true});
  return {pause(){if(!suspended)resumePosition={top:root.scrollTop,bottom:atBottom};suspended=true;},resume(){if(!suspended)return;suspended=false;atBottom=resumePosition?.bottom??true;root.scrollTop=atBottom?root.scrollHeight:(resumePosition?.top||0);draw();schedule();},update,reset,jump:jumpTo,get bottom(){return atBottom},get count(){return nodes.size}};
 }
 function install(c){
  const {state,el}=c;let space='community',edit=null,sending=false,memberOpen=true,memberRows=[],memberFrame=0,readPending=new Set(),readTimes=new Map(),memberSource=null,memberScope='',draftTimer=0,searchSerial=0,searchTimer=0,modal=null,menu=null,returnFocus=null,editDraft=null;
  const collapsedSet=new Set(),drafts=new Map();
  const key=()=> 'gsn-chat-drafts:'+state.me?.id;
  const feedback=node('div','dc-compose-feedback');feedback.setAttribute('role','status');el.composer.after(feedback);
  const editor=node('div','dc-edit-strip');editor.hidden=true;editor.append(node('span','','Editing message'),button('Cancel editing','close',()=>cancelEdit()));el.composer.before(editor);
  const memberPanel=node('aside','dc-members');memberPanel.setAttribute('aria-label','Channel members');memberPanel.id='memberPanel';
  const memberHeader=node('header','dc-member-heading'),memberLabel=node('strong','','MEMBERS');memberHeader.append(memberLabel,button('Close member list','close',()=>toggleMembers(false)));
  const memberScroll=node('div','dc-member-scroll');memberScroll.tabIndex=0;memberPanel.append(memberHeader,memberScroll);el.app.append(memberPanel);el.app.classList.add('dc-members-open');
  const memberButton=button('Toggle member list','users',()=>toggleMembers(!memberOpen));memberButton.setAttribute('aria-controls','memberPanel');
  const searchButton=button('Search messages','search',()=>search());searchButton.classList.add('dc-search-button');searchButton.append(node('span','','Search'));
  const muteButton=button('Mute channel notifications','bell',()=>{if(state.activeChannel){c.toggleChannelMuted(state.activeChannel);refresh();}});
  document.querySelector('.header-actions').prepend(muteButton,memberButton,searchButton);
  const settings=button('User settings','settings',()=>shell.settings());document.querySelector('.account-bar').append(settings);
  const gif=button('Choose a GIF',null,c.openGifPicker);gif.classList.add('dc-gif-button');gif.textContent='GIF';el.composer.insertBefore(gif,el.sendButton);el.composer.insertBefore(el.emojiButton,el.sendButton);document.querySelector('#attachButton use').setAttribute('href','#i-attach');
  const nav=button('Open channels','chat',()=>el.app.classList.toggle('dc-nav-open'));nav.classList.add('dc-nav-button');document.querySelector('.chat-header').prepend(nav);
  const navClose=button('Close channels','close',()=>el.app.classList.remove('dc-nav-open'));navClose.classList.add('dc-nav-close');document.querySelector('.sidebar-title-actions').prepend(navClose);
  const social=window.GsnFriends(c,{node,button,profile,saveDraft,navigate:id=>setSpace('home',id==='pending'?'requests':id==='chats'?'chats':'friends',id)});
  document.getElementById('discordHome').onclick=()=>setSpace('home','friends');document.getElementById('discordCommunity').onclick=()=>setSpace('community');
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{setSpace('home',b.dataset.view);}));
  function setSpace(value,view='chats',friendTab){if(value==='home'&&view!=='chats')social.show(friendTab|| (view==='requests'?'pending':'all'));else social.hide();space=value;state.activeView=view;el.app.dataset.space=value;document.querySelector('.sidebar-title h1').textContent=value==='home'?'Direct Messages':'GSN Community';document.getElementById('discordHome').setAttribute('aria-current',String(value==='home'));document.getElementById('discordCommunity').setAttribute('aria-current',String(value==='community'));c.renderSidebar();}
  function sidebar(){shell.sync();social.render();const count=state.channels.filter(x=>x.kind==='server').reduce((n,x)=>n+c.unreadCount(x.id),0);document.getElementById('discordCommunity').classList.toggle('has-unread',!!count);document.querySelectorAll('.conversation-row').forEach(b=>b.setAttribute('aria-current',String(b.classList.contains('active'))));}
  function category(label,kind){label.tabIndex=0;label.setAttribute('role','button');label.setAttribute('aria-expanded',String(!collapsedSet.has(kind)));label.textContent=(collapsedSet.has(kind)?'›  ':'⌄  ')+label.textContent;label.onclick=()=>{if(collapsedSet.has(kind))collapsedSet.delete(kind);else collapsedSet.add(kind);c.renderSidebar();};label.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();label.click();}};}
  function saveDraft(){if(!state.me||!state.activeChannel||edit)return;const value={text:el.messageInput.value,reply:state.replyTo?.id||null,attachment:state.attachment};drafts.set(state.activeChannel.id,value);clearTimeout(draftTimer);draftTimer=setTimeout(()=>{const all=storage.get(key(),{});for(const [id,d]of drafts)if(d.text||d.reply||d.attachment)all[id]=d;else delete all[id];if(!storage.set(key(),all))feedback.textContent='Storage is full. Keep this tab open to preserve your draft.';},150);}
  function restoreDraft(id){setSpace(state.activeChannel?.kind==='server'?'community':'home');cancelEdit();const d=drafts.get(id)||storage.get(key(),{})[id]||{};el.messageInput.value=d.text||'';state.replyTo=(state.messages.get(id)||[]).find(m=>m.id===d.reply)||null;state.attachment=d.attachment||null;c.autoSizeComposer();feedback.textContent='';el.app.classList.remove('dc-nav-open');}
  function cancelEdit(){if(!edit)return;edit=null;editor.hidden=true;if(editDraft){el.messageInput.value=editDraft.text;state.replyTo=editDraft.reply;state.attachment=editDraft.attachment;}editDraft=null;c.autoSizeComposer();c.syncComposeExtras();}
  function beginEdit(message){if(message.authorId!==state.me?.id)return;saveDraft();if(!edit)editDraft={text:el.messageInput.value,reply:state.replyTo,attachment:state.attachment};edit=message;editor.hidden=false;state.replyTo=null;state.attachment=null;el.messageInput.value=message.text||'';c.autoSizeComposer();c.syncComposeExtras();el.messageInput.focus();}
  let pendingSend=null;
  async function send(){
   if(sending||!state.activeChannel||!state.me)return;const channel=state.activeChannel,account=state.me.id,raw=el.messageInput.value,text=raw.trim(),attachment=state.attachment,reply=state.replyTo,editing=edit;
   if(!text&&!attachment&&!editing?.attachments?.length)return;sending=true;c.syncSendButton();saveDraft();feedback.textContent=editing?'Saving changes…':'Sending…';
   const body={text,...(reply?{replyTo:reply.id}:{}),...(attachment?{attachments:[attachment]}:{})};
   if(!editing){pendingSend={id:'pending-'+Date.now(),channelId:channel.id,authorId:account,text,createdAt:Date.now(),replyTo:reply?.id,attachments:attachment?[attachment]:[],pending:true};c.renderMessages();}
   try{
    const payload=await c.api(editing?'/api/messages/'+encodeURIComponent(editing.id):'/api/channels/'+encodeURIComponent(channel.id)+'/messages',{method:editing?'PATCH':'POST',body});
    if(state.me?.id!==account)return;
    if(!payload.message?.id)throw new Error('The server did not confirm the message. Check the conversation before retrying.');pendingSend=null;if(!editing)shell.sound('sent');
    state.mutationVersions.set(channel.id,(state.mutationVersions.get(channel.id)||0)+1);
    const list=state.messages.get(channel.id)||[];c.cacheMessages(channel.id,c.normalizeMessages([...list.filter(m=>m.id!==payload.message.id),payload.message]));
    // Acknowledgments must never clear a newer draft or update a different channel.
    if(state.activeChannel?.id===channel.id){if(editing){if(edit===editing&&el.messageInput.value===raw)cancelEdit();}else if(el.messageInput.value===raw&&state.attachment===attachment&&state.replyTo===reply){el.messageInput.value='';state.replyTo=null;state.attachment=null;}c.autoSizeComposer();c.syncComposeExtras();saveDraft();c.renderMessages();feedback.textContent='';}
    else {const d=drafts.get(channel.id);if(d?.text===raw&&d.attachment===attachment){drafts.set(channel.id,{text:''});const all=storage.get(key(),{});delete all[channel.id];storage.set(key(),all);}}
    c.renderSidebar();
   }catch(error){if(state.activeChannel?.id===channel.id){feedback.replaceChildren(node('span','',error.message+' Your draft is kept. '),button('Retry send',null,()=>send()));}else c.toast('Message to '+c.channelTitle(channel)+' was not confirmed. Its draft is kept.');}
   finally{pendingSend=null;sending=false;c.renderMessages();c.syncSendButton();}
  }
  function profileTrigger(target,user){target.tabIndex=0;target.setAttribute('role','button');target.setAttribute('aria-label','View profile of '+c.cleanDisplayName(user));target.onclick=e=>{e.stopPropagation();profile(user,target);};target.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();profile(user,target);}};}
  function closeModal(){if(!modal)return;modal.remove();modal=null;returnFocus?.focus({preventScroll:true});}
  function dialog(title,cls=''){closeModal();returnFocus=document.activeElement;const overlay=node('div','dc-dialog-backdrop');const panel=node('section','dc-dialog '+cls);panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',title);const heading=node('header','dc-dialog-heading');heading.append(node('h2','',title),button('Close','close',closeModal));panel.append(heading);overlay.append(panel);overlay.onclick=e=>{if(e.target===overlay)closeModal();};document.body.append(overlay);modal=overlay;queueMicrotask(()=>panel.querySelector('button')?.focus());return panel;}
  function profile(user,anchor,full=false){
   anchor ||= document.activeElement;const panel=dialog(c.cleanDisplayName(user),full?'dc-full-profile':'dc-profile');const visual=node('div','dc-profile-banner');const avatar=c.createAvatar(user,'dc-profile-avatar');visual.append(avatar);panel.append(visual,node('h3','',c.cleanDisplayName(user)),node('p','dc-profile-username','@'+user.username));
   if(user.bio)panel.append(node('p','',user.bio));if(user.pronouns)panel.append(node('small','',user.pronouns));
   panel.append(node('h4','','ABOUT'),node('p','dc-muted','GSN community member'));
   if(user.id===state.me?.id)panel.append(button('Edit profile',null,()=>{closeModal();c.showProfileSetup(true);}));
   else {panel.append(button('Message',null,()=>{closeModal();setSpace('home');c.startDm(user);}));const relation=state.friends.find(f=>f.user?.id===user.id);if(!relation)panel.append(button('Add friend',null,async e=>{e.currentTarget.disabled=true;await c.sendFriendRequest(user);closeModal();}));else panel.append(node('p','dc-muted',relation.state==='friends'?'Friends':relation.state==='incoming'?'Incoming friend request':'Friend request sent'));}
   if(!full&&anchor?.getBoundingClientRect&&innerWidth>700){modal.classList.add('dc-popout-backdrop');const r=anchor.getBoundingClientRect();panel.style.position='fixed';requestAnimationFrame(()=>{panel.style.left=Math.max(8,Math.min(innerWidth-panel.offsetWidth-8,r.right+12))+'px';panel.style.top=Math.max(8,Math.min(innerHeight-panel.offsetHeight-8,r.top))+'px';});}
   if(!full)panel.append(button('View full profile',null,()=>profile(user,null,true)));
   else{panel.append(node('h4','','SHARED CHANNELS'));for(const ch of state.channels.filter(ch=>ch.kind==='server'))panel.append(button('# '+ch.name,null,()=>{closeModal();setSpace('community');c.openChannel(ch.id);}));}
  }
  function memberDraw(){memberFrame=0;const start=Math.max(0,Math.floor(memberScroll.scrollTop/44)-5),end=Math.min(memberRows.length,start+Math.ceil(memberScroll.clientHeight/44)+10);const fragment=document.createDocumentFragment(),before=node('div');before.style.height=start*44+'px';fragment.append(before);for(const user of memberRows.slice(start,end)){const row=button(c.cleanDisplayName(user),null,()=>profile(user));row.className='dc-member';row.replaceChildren(c.createAvatar(user),node('span','',c.cleanDisplayName(user)));fragment.append(row);}const after=node('div');after.style.height=(memberRows.length-end)*44+'px';fragment.append(after);memberScroll.replaceChildren(fragment);}
  memberScroll.addEventListener('scroll',()=>{if(!memberFrame)memberFrame=requestAnimationFrame(memberDraw);},{passive:true});
  if(innerWidth<=1100)toggleMembers(false);
  const memberResize=new ResizeObserver(()=>memberDraw());memberResize.observe(memberScroll);
  function toggleMembers(value){memberOpen=value;memberPanel.hidden=!value;el.app.classList.toggle('dc-members-open',value);memberButton.setAttribute('aria-pressed',String(value));if(value)memberDraw();}
  function refresh(){
   if(!state.me)return;shell.sync();const scope=state.activeChannel?.kind==='dm'?state.activeChannel.recipientId:'community';
   if(memberSource!==state.members||memberScope!==scope){memberSource=state.members;memberScope=scope;memberRows=scope==='community'?state.members:state.members.filter(u=>[state.me.id,scope].includes(u.id));memberRows=[...memberRows].sort((a,b)=>c.cleanDisplayName(a).localeCompare(c.cleanDisplayName(b)));memberLabel.textContent='MEMBERS — '+memberRows.length;memberDraw();}
   const muted=state.mutedChannels.has(state.activeChannel?.id);muteButton.setAttribute('aria-pressed',String(muted));muteButton.title=muted?'Unmute channel notifications':'Mute channel notifications';muteButton.setAttribute('aria-label',muteButton.title);memberButton.setAttribute('aria-pressed',String(memberOpen));
  }
  function markVisibleRead(){const ch=state.activeChannel;if(!ch||social.visible||document.hidden||!c.timeline.bottom||readPending.has(ch.id))return;const latest=(state.messages.get(ch.id)||[]).at(-1)?.createdAt||0;if(latest<=Math.max(state.unreads[ch.id]||0,readTimes.get(ch.id)||0))return;readPending.add(ch.id);void c.api('/api/channels/'+encodeURIComponent(ch.id)+'/read',{method:'POST',body:{}}).then(()=>{state.unreads[ch.id]=latest;readTimes.set(ch.id,latest);c.renderSidebar();}).catch(()=>{}).finally(()=>readPending.delete(ch.id));}
  function messageMenu(anchor,message){menu?.remove();returnFocus=anchor;menu=node('div','message-action-menu dc-menu visible');menu.setAttribute('role','menu');const action=(label,fn)=>{const b=button(label,null,()=>{menu?.remove();menu=null;fn();});b.setAttribute('role','menuitem');menu.append(b);};action('Reply',()=>{state.replyTo=message;c.syncComposeExtras();saveDraft();el.messageInput.focus();});action('Copy text',()=>navigator.clipboard.writeText(message.text||'').then(()=>c.toast('Message copied')).catch(()=>c.toast('Clipboard is unavailable in this browser.')));action('View profile',()=>profile(c.userFor(message.authorId)));
   if(message.authorId===state.me?.id){action('Edit message',()=>beginEdit(message));action('Delete message',()=>{const panel=dialog('Delete message?');panel.append(node('p','','This permanently removes your message.'),button('Cancel',null,closeModal),button('Delete',null,async()=>{closeModal();await c.deleteMessage(message);}));});}
   document.body.append(menu);const r=anchor.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(innerWidth-menu.offsetWidth-8,r.right-menu.offsetWidth))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-menu.offsetHeight-8,r.bottom+6))+'px';menu.querySelector('button').focus();
  }
  async function search(){
   const channel=state.activeChannel;if(!channel)return;const panel=dialog('Search #'+c.channelTitle(channel),'dc-search-dialog'),input=node('input','dc-search-input'),filters=node('div','dc-search-filters'),author=node('select'),attachments=node('input'),from=node('input'),results=node('div','dc-search-results');input.type='search';input.placeholder='Search messages';input.setAttribute('aria-label','Search messages');author.setAttribute('aria-label','Filter by author');author.append(new Option('All authors',''));for(const u of state.members)author.append(new Option(c.cleanDisplayName(u),u.id));attachments.type='checkbox';const alabel=node('label','','With image');alabel.prepend(attachments);from.type='date';from.setAttribute('aria-label','Messages since date');filters.append(author,alabel,from);panel.append(input,filters,node('p','dc-muted','Searches the latest 500 messages available from this conversation.'),results);queueMicrotask(()=>input.focus());
   let data=state.messages.get(channel.id)||[],limit=30;const run=()=>{const query=input.value.trim().toLowerCase(),found=data.filter(m=>(!author.value||m.authorId===author.value)&&(!attachments.checked||m.attachments?.length)&&(!from.value||m.createdAt>=Date.parse(from.value))&&(!query||(m.text+' '+(m.attachments||[]).map(a=>a.name).join(' ')).toLowerCase().includes(query)));results.replaceChildren(node('p','dc-muted',found.length+' results'));for(const m of found.slice(0,limit)){const b=button('Jump to message from '+c.cleanDisplayName(c.userFor(m.authorId)),null,()=>{closeModal();if(state.activeChannel?.id!==channel.id)c.openChannel(channel.id).then(()=>c.timeline.jump(m.id));else c.timeline.jump(m.id);});b.className='dc-search-result';b.replaceChildren(node('strong','',c.cleanDisplayName(c.userFor(m.authorId))+' · '+new Date(m.createdAt).toLocaleString()),node('span','',m.text||(m.attachments||[]).map(a=>a.name).join(', ')));results.append(b);}if(found.length>limit)results.append(button('Load more results',null,()=>{limit+=30;run();}));};
   const serial=++searchSerial;results.textContent='Searching the server…';try{data=await c.loadChannelMessages(channel);if(serial===searchSerial&&panel.isConnected)run();}catch(error){if(panel.isConnected)results.replaceChildren(node('p','',error.message),button('Try search again',null,search));}
   input.oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{limit=30;run();},160);};author.onchange=attachments.onchange=from.onchange=run;
  }
  let emojiCatalog=null,emojiRequest=null;
  async function chooseEmoji(anchor,onSelect){
   const panel=dialog('Choose emoji','dc-emoji-dialog'),input=node('input','dc-search-input'),category=node('select'),tone=node('select'),grid=node('div','dc-emoji-grid'),recentKey='gsn-chat-emoji:'+state.me?.id;
   input.type='search';input.placeholder='Search emoji';input.setAttribute('aria-label','Search emoji');category.setAttribute('aria-label','Emoji category');tone.setAttribute('aria-label','Skin tone');
   for(const [value,label]of [['recent','Frequently used'],['all','All emoji'],['faces','Smileys & people'],['nature','Animals & nature'],['food','Food & drink'],['travel','Travel & places'],['objects','Objects & symbols'],['flags','Flags']])category.append(new Option(label,value));
   for(const [value,label]of [['','All skin tones'],['light skin tone','Light'],['medium-light skin tone','Medium light'],['medium skin tone','Medium'],['medium-dark skin tone','Medium dark'],['dark skin tone','Dark']])tone.append(new Option(label,value));
   const filters=node('div','dc-search-filters');filters.append(category,tone);panel.append(input,filters,grid);queueMicrotask(()=>input.focus());grid.textContent='Loading emoji…';
   const groups={faces:/face|person|man|woman|hand|smil|heart|kiss|body|boy|girl|people|finger|skin tone/,nature:/animal|cat|dog|bird|plant|flower|tree|weather|sun|moon|fish|bear|insect/,food:/food|fruit|drink|vegetable|bread|rice|cake|coffee|tea|pizza|meal/,travel:/car|train|travel|building|mountain|boat|airplane|place|vehicle|transport/,flags:/flag|regional indicator/};let limit=120;
   function render(){grid.replaceChildren();const q=input.value.trim().toLowerCase(),recent=storage.get(recentKey,[]),frequent=recent.length?recent:['👍','❤️','😂','🔥','🎉','👀','😀','🎮'];const all=emojiCatalog||frequent.map(emoji=>({emoji,name:emoji,keywords:[]}));let items=all.filter(e=>{const name=(e.name+' '+(e.keywords||[]).join(' ')).toLowerCase();if(tone.value&&!name.includes(tone.value))return false;if(q)return (name+' '+e.emoji).includes(q);if(category.value==='recent')return frequent.includes(e.emoji);if(category.value==='all')return true;if(category.value==='objects')return !Object.values(groups).some(re=>re.test(name));return groups[category.value]?.test(name);});if(category.value==='recent'&&!q)items.sort((a,b)=>frequent.indexOf(a.emoji)-frequent.indexOf(b.emoji));for(const e of items.slice(0,limit)){const b=button(e.name,null,()=>{storage.set(recentKey,[e.emoji,...recent.filter(x=>x!==e.emoji)].slice(0,32));closeModal();onSelect(e.emoji);});b.textContent=e.emoji;grid.append(b);}if(!items.length)grid.textContent='No emoji found.';if(items.length>limit)grid.append(button('More emoji',null,()=>{limit+=120;render();}));}
   if(!emojiCatalog){try{emojiRequest||=fetch(new URL('reaction-emoji.json',document.baseURI)).then(r=>{if(!r.ok)throw Error('Emoji catalog unavailable');return r.json();});emojiCatalog=await emojiRequest;}catch{emojiRequest=null;}}
   if(panel.isConnected)render();input.oninput=()=>{limit=120;render();};category.onchange=tone.onchange=()=>{limit=120;render();};
  }
  window.GsnChatUI.chooseEmoji=chooseEmoji;
  function emojiInit(){el.emojiPopover.replaceChildren();el.emojiButton.addEventListener('click',()=>{el.emojiPopover.hidden=true;chooseEmoji(el.emojiButton,emoji=>{const input=el.messageInput,start=input.selectionStart,end=input.selectionEnd;input.setRangeText(emoji,start,end,'end');c.autoSizeComposer();c.syncSendButton();saveDraft();input.focus();});});}
  const animated=new Set(),mediaObserver=new IntersectionObserver(entries=>{for(const {target,isIntersecting}of entries){const play=isIntersecting&&!document.hidden&&target.dataset.paused!=='true'&&!matchMedia('(prefers-reduced-motion: reduce)').matches;setMotion(target,play);}},{root:el.messageScroll,rootMargin:'0px'});
  function setMotion(img,play){const source=play?img.dataset.motion:img.dataset.poster;if(img.src!==source)img.src=source;if(img.motionControl){img.motionControl.textContent=play?"Pause GIF":"Play GIF";img.motionControl.setAttribute("aria-label",img.motionControl.textContent);}}
  function attachmentImage(img,attachment){
   img.onerror=()=>{img.hidden=true;const link=img.parentElement;if(link){link.classList.add('dc-unavailable-image');link.textContent=(attachment.name||'Image')+' — open original';}};
   if(attachment.type!=='image/gif')return;const url=attachment.url||attachment.data;if(!url)return;
   const placeholder='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="280" height="170"><rect width="280" height="170" fill="#24252b"/><text x="140" y="90" text-anchor="middle" fill="#c4c5cf" font-family="sans-serif" font-size="20">GIF</text></svg>');
   const match=url.match(/^https:\/\/(?:media\d*|i)\.giphy\.com\/media\/([^/]+)\//);img.dataset.motion=url;img.dataset.poster=match?'https://media.giphy.com/media/'+match[1]+'/giphy_s.gif':placeholder;
   img.src=img.dataset.poster;animated.add(img);mediaObserver.observe(img);
   const control=button('Play GIF',null,e=>{e.preventDefault();const playing=img.src===img.dataset.motion;img.dataset.paused=String(playing);setMotion(img,!playing);});control.className='dc-gif-control';img.motionControl=control;img.parentElement.after(control);
  }
  // A virtual row leaving the document releases its observer and GIF decoder.
  const mediaCleanup=new MutationObserver(()=>{for(const old of animated)if(!old.isConnected){mediaObserver.unobserve(old);old.removeAttribute('src');animated.delete(old);}});
  mediaCleanup.observe(el.messageScroll,{childList:true});
  document.addEventListener('visibilitychange',()=>{for(const img of animated){if(document.hidden)setMotion(img,false);else if(img.isConnected){mediaObserver.unobserve(img);mediaObserver.observe(img);}}});
  async function upload(file){if(!file)return;const channel=state.activeChannel?.id;feedback.textContent='Preparing image…';try{const value=await c.fileToAttachment(file);if(state.activeChannel?.id===channel){state.attachment=value;c.syncComposeExtras();saveDraft();feedback.textContent='';}else{const d=drafts.get(channel)||{};d.attachment=value;drafts.set(channel,d);const all=storage.get(key(),{});all[channel]=d;storage.set(key(),all);feedback.textContent='Image saved with the original conversation draft.';}}catch(error){feedback.textContent=error.message;}}
  el.messageInput.addEventListener('paste',event=>{const image=[...(event.clipboardData?.items||[])].find(i=>i.kind==='file');if(image){event.preventDefault();void upload(image.getAsFile());}});
  el.chatView.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();el.composer.classList.add('dc-dragover');}});el.chatView.addEventListener('dragleave',()=>el.composer.classList.remove('dc-dragover'));el.chatView.addEventListener('drop',e=>{if(e.dataTransfer.files.length){e.preventDefault();el.composer.classList.remove('dc-dragover');void upload(e.dataTransfer.files[0]);}});
  el.messageInput.addEventListener('keydown',e=>{if(e.key==='ArrowUp'&&!el.messageInput.value&&!edit){const m=[...(state.messages.get(state.activeChannel?.id)||[])].reverse().find(m=>m.authorId===state.me?.id);if(m){e.preventDefault();beginEdit(m);}}});
  // One keyboard boundary handles dialogs, transient menus, and supported picker grids.
  document.addEventListener('keydown',e=>{
   if((e.ctrlKey||e.metaKey)&&e.key==='f'&&state.activeChannel){e.preventDefault();void search();return;}
   if(e.key==='Escape'){if(modal){e.preventDefault();closeModal();}if(menu){menu.remove();menu=null;returnFocus?.focus();}el.app.classList.remove('dc-nav-open');}
   const scope=modal?.querySelector('[role=dialog]')||[...document.querySelectorAll('.overlay:not([hidden]),.auth-overlay:not([hidden])')].at(-1);
   if(e.key==='Tab'&&scope){const controls=[...scope.querySelectorAll('button:not(:disabled),input:not([hidden]):not([type=file]),textarea,select,a[href],[tabindex="0"]')].filter(n=>n.getClientRects().length);if(!controls.length)return;const first=controls[0],last=controls.at(-1);if(e.shiftKey&&(document.activeElement===first||!scope.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!scope.contains(document.activeElement))){e.preventDefault();first.focus();}}
   const grid=document.activeElement?.closest('.gif-results,#emojiPopover,.message-action-menu,.reaction-picker,.dc-emoji-grid');if(grid&&['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(e.key)){const all=[...grid.querySelectorAll('button:not(:disabled)')],i=all.indexOf(document.activeElement);if(i>=0){e.preventDefault();all[(i+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)+all.length)%all.length]?.focus();}}
  });
  document.addEventListener('pointerdown',e=>{if(menu&&!menu.contains(e.target)&&!e.target.closest('[data-action=more]')){menu.remove();menu=null;}});
  window.addEventListener('pagehide',()=>{saveDraft();clearTimeout(draftTimer);const all=storage.get(key(),{});for(const [id,d]of drafts)all[id]=d;if(state.me)storage.set(key(),all);memberResize.disconnect();mediaObserver.disconnect();mediaCleanup.disconnect();animated.clear();cancelAnimationFrame(memberFrame);});
  window.addEventListener('resize',()=>{c.autoSizeComposer();if(modal?.classList.contains('dc-popout-backdrop'))closeModal();});
  el.cancelAttachmentButton.addEventListener('click',saveDraft);el.cancelReplyButton.addEventListener('click',saveDraft);
  const shell=window.GsnDiscordShell(c,{node,button,dialog,closeModal,search,space:()=>space,socialVisible:()=>social.visible});
  el.app.dataset.space='community';document.getElementById('discordCommunity').setAttribute('aria-current','true');
  return {pendingMessages:id=>pendingSend?.channelId===id&&pendingSend.authorId===state.me?.id?[pendingSend]:[],observeMessages:(channel,messages,initial)=>shell.observe(channel,messages,initial),get space(){return space},get sending(){return sending},category,collapsed:k=>collapsedSet.has(k),sidebar,refresh,profile,profileTrigger,emojiInit,attachmentImage,saveDraft,restoreDraft,cancelEdit,edit:beginEdit,send,markVisibleRead,messageMenu,upload,
   uploadProgress(loaded,total){feedback.textContent=total?'Reading image · '+Math.round(loaded/total*100)+'%':'';},
   detailsOpened(){el.detailsPanel.classList.add('dc-details-overlay');},
   loadError(retry){el.messageScroll.replaceChildren(node('p','thread-empty','This conversation could not be loaded.'),button('Try again',null,retry));}
  };
 }
 window.GsnChatUI={format,timeline,install};
})();
