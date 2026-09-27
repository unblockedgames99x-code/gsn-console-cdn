/* Emoji metadata: emojibase-data 17.0.0 (MIT). Images: Twemoji 17.0.3 and the chat server's custom set. */
(()=>{'use strict';
 const quick=['👍','❤️','😂','🔥','🎉','👀','😭','🙏'];
 const common='😀.😂.🥹.😊.😍.😎.🤔.😴.😭.😤.😡.🥳.🤯.😳.🙄.😬.👍.👎.👌.🙏.👀.💪.🔥.✨.💀.❤️.💔.💯.🎉.🚀.⭐.⚡.😺.🍒.🍕.☕.🎮.🎵.💬.✅'.split('.');
 const custom=[];
 let catalog=[],catalogRequest,picker=null,current=null;
 const pending=new Set();
 function loadCatalog(){return catalogRequest||=fetch('reaction-emoji.json').then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{catalog=data}).catch(()=>{catalogRequest=null})}
 function nameOf(emoji){return custom.find(e=>e.emoji===emoji)?.name||catalog.find(e=>e.emoji===emoji)?.name||emoji}
 function icon(emoji){
  const span=document.createElement('span');span.className='reaction-icon';
  const special=custom.find(e=>e.emoji===emoji);
  const img=document.createElement('img');img.alt='';img.draggable=false;
  const hex=Array.from(emoji.includes('\u200d')?emoji:emoji.replace(/\uFE0F/g,'')).map(c=>c.codePointAt(0).toString(16)).join('-');
  img.src=special?.url||'https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/svg/'+hex+'.svg';
  img.onerror=()=>{span.textContent=special?'🐈':emoji;img.remove()};span.append(img);return span;
 }
 function close(restore=false){const id=current?.message.id;picker?.remove();picker=null;current=null;document.querySelectorAll('.reaction-add[aria-expanded=true]').forEach(b=>b.setAttribute('aria-expanded','false'));if(restore&&id)document.querySelector('[data-message="'+CSS.escape(id)+'"] .reaction-add')?.focus({preventScroll:true})}
 function position(){
  if(!picker||!current)return;
  const anchor=document.querySelector('[data-message="'+CSS.escape(current.message.id)+'"] .reaction-add');
  if(!anchor){close();return}
  const r=anchor.getBoundingClientRect(),view=window.visualViewport;
  const left=view?.offsetLeft||0,top=view?.offsetTop||0,width=view?.width||innerWidth,height=view?.height||innerHeight;
  picker.style.maxHeight=Math.max(120,height-16)+'px';
  const box=picker.getBoundingClientRect();
  picker.style.left=Math.max(left+8,Math.min(r.right-box.width,left+width-box.width-8))+'px';
  picker.style.top=Math.max(top+8,Math.min(r.top-box.height-8>=top+8?r.top-box.height-8:r.bottom+8,top+height-box.height-8))+'px';
 }
 async function toggle(context,emoji){
  const key=context.channelId+':'+context.message.id;if(pending.has(key))return;
  pending.add(key);close();
  const row=()=>document.querySelector('[data-message="'+CSS.escape(context.message.id)+'"]');
  row()?.querySelectorAll('.reaction-add,.reaction-chip').forEach(b=>b.disabled=true);
  try{
   const result=await context.send(context.message.id,emoji);
   if(!Array.isArray(result.reactions))throw new Error('The server did not confirm this reaction.');
   context.update(context.channelId,context.message.id,result.reactions);
  }catch(error){context.onError(error.message||'Could not update this reaction. Try again.')}
  finally{pending.delete(key);row()?.querySelectorAll('.reaction-add,.reaction-chip').forEach(b=>b.disabled=false)}
 }
 function open(context,anchor){
  if(window.GsnChatUI?.chooseEmoji){window.GsnChatUI.chooseEmoji(anchor,emoji=>toggle(context,emoji));return;}
  if(current?.message.id===context.message.id){close(true);return}close();current=context;
  anchor.setAttribute('aria-expanded','true');
  picker=document.createElement('section');picker.className='reaction-picker';picker.setAttribute('role','dialog');picker.setAttribute('aria-label','Add a reaction');
  const quickRow=document.createElement('div');quickRow.className='reaction-quick';
  const search=document.createElement('input');search.type='search';search.placeholder='Search emoji…';search.setAttribute('aria-label','Search emoji');
  const grid=document.createElement('div');grid.className='reaction-grid';grid.setAttribute('aria-label','Emoji');
  const button=emoji=>{const b=document.createElement('button');b.type='button';b.dataset.emoji=emoji;b.title=nameOf(emoji);b.setAttribute('aria-label','React with '+nameOf(emoji));b.append(icon(emoji));b.onclick=()=>toggle(context,emoji);return b};
  quick.forEach(emoji=>quickRow.append(button(emoji)));
  function render(){
   grid.replaceChildren();const query=search.value.trim().toLowerCase();
   const items=query?[...custom,...catalog].filter(e=>(e.emoji+' '+e.name+' '+e.keywords.join(' ')).toLowerCase().includes(query)).slice(0,120):[...custom,...common.map(emoji=>({emoji}))];
   items.forEach(e=>grid.append(button(e.emoji)));
   if(!items.length){const empty=document.createElement('p');empty.className='reaction-empty';empty.textContent='No emoji found';grid.append(empty)}
   position();
  }
  search.oninput=render;picker.append(quickRow,search,grid);document.body.append(picker);render();search.focus({preventScroll:true});
  const opened=picker;loadCatalog().then(()=>{if(picker===opened)render()});
  picker.addEventListener('keydown',event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true)}
   if(event.key==='ArrowDown'&&event.target===search){event.preventDefault();grid.querySelector('button')?.focus()}
   if(event.key==='Tab'){
    const nodes=[...picker.querySelectorAll('input,button')],index=nodes.indexOf(document.activeElement);
    if(event.shiftKey&&index===0){event.preventDefault();nodes.at(-1).focus()}
    else if(!event.shiftKey&&index===nodes.length-1){event.preventDefault();nodes[0].focus()}
   }
  });
 }
 function attach(context){
  const {message,channelId,userId,tools,stack}=context;
  const locked=pending.has(channelId+':'+message.id);
  const add=document.createElement('button');add.type='button';add.className='reaction-add';add.title='Add reaction';add.setAttribute('aria-label','Add reaction');add.setAttribute('aria-haspopup','dialog');add.setAttribute('aria-expanded','false');add.textContent='☺';add.disabled=locked;add.onclick=()=>open(context,add);tools.prepend(add);
  const bar=document.createElement('div');bar.className='message-reactions';bar.setAttribute('aria-label','Reactions');
  for(const item of message.reactions||[]){
   if(typeof item.emoji!=='string'||!Array.isArray(item.userIds)||!item.userIds.length)continue;
   const ids=[...new Set(item.userIds.map(String))],mine=ids.includes(String(userId));
   const button=document.createElement('button');button.type='button';button.className='reaction-chip';button.dataset.emoji=item.emoji;button.disabled=locked;button.setAttribute('aria-pressed',String(mine));button.setAttribute('aria-label',nameOf(item.emoji)+', '+ids.length+' reaction'+(ids.length===1?'':'s')+(mine?', including you':''));button.title=(mine?'Remove':'Add')+' '+nameOf(item.emoji)+' reaction';
   const count=document.createElement('span');count.textContent=ids.length;button.append(icon(item.emoji),count);button.onclick=()=>toggle(context,item.emoji);bar.append(button);
  }
  if(bar.childElementCount)stack.append(bar);
 }
 document.addEventListener('pointerdown',event=>{if(picker&&!picker.contains(event.target)&&!event.target.closest('.reaction-add'))close()},true);
 document.addEventListener('scroll',event=>{if(picker&&!picker.contains(event.target))close()},true);
 window.addEventListener('resize',position);window.visualViewport?.addEventListener('resize',position);
 window.ChatReactions={attach,close};
})();
